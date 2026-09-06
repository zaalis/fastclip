"""Account settings: profile, avatar, password, privacy data and deletion."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import clear_session_cookie, current_user
from ..models import Clip, Project, User
from ..schemas import (
    AccountDeleteRequest,
    MistralApiKeyRequest,
    MistralModelRequest,
    PasswordChangeRequest,
    ProfileUpdateRequest,
    serialize_user,
)
from ..security import (
    destroy_all_sessions,
    hash_password,
    validate_email,
    validate_password,
    validate_username,
    verify_password,
)
from ..services import ai, storage
from ..services.account_secrets import (
    SecretUnavailable,
    decrypt_api_key,
    encrypt_api_key,
    masked_api_key,
)

router = APIRouter(prefix="/api/account", tags=["account"])

_AVATAR_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
_AVATAR_MAX_BYTES = 3 * 1024 * 1024


@router.patch("/profile")
def update_profile(payload: ProfileUpdateRequest, db: Session = Depends(get_db),
                   user: User = Depends(current_user)):
    if payload.username is not None:
        username = payload.username.strip()
        error = validate_username(username)
        if error:
            raise HTTPException(status_code=422, detail=error)
        user.username = username

    if payload.email is not None:
        email = payload.email.strip().lower()
        error = validate_email(email)
        if error:
            raise HTTPException(status_code=422, detail=error)
        if email != user.email:
            taken = db.scalar(
                select(User).where(func.lower(User.email) == email, User.id != user.id)
            )
            if taken is not None:
                raise HTTPException(
                    status_code=409, detail="This email address is already in use."
                )
            user.email = email

    db.commit()
    return {"user": serialize_user(user)}


@router.post("/password")
def change_password(payload: PasswordChangeRequest, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    if not verify_password(user.password_hash, payload.current_password):
        raise HTTPException(status_code=403, detail="Current password is incorrect.")

    error = validate_password(payload.new_password)
    if error:
        raise HTTPException(status_code=422, detail=error)

    user.password_hash = hash_password(payload.new_password)
    db.commit()
    # Every other device is signed out; this one keeps working.
    return {"ok": True, "message": "Password updated."}


def _api_key_status(user: User, models: list[str] | None = None) -> dict:
    masked = masked_api_key(user.id, user.mistral_api_key_encrypted)
    model = user.mistral_model if user.mistral_model in (models or []) else None
    return {
        "configured": masked is not None,
        "masked": masked,
        "model": model if masked else None,
        "available_models": models or [],
    }


def _cached_available_models(user: User) -> list[str]:
    try:
        models = json.loads(user.mistral_compatible_models_json or "[]")
    except ValueError:
        return []
    return [model for model in models if isinstance(model, str) and 0 < len(model) <= 128]


def _available_models_for_user(user: User, api_key: str, db: Session, *, refresh: bool = False) -> list[str]:
    models = [] if refresh else _cached_available_models(user)
    if models:
        return models
    models = ai.available_models(api_key)
    if not models:
        raise ai.MistralError(
            "Mistral did not return a chat model for this key."
        )
    user.mistral_compatible_models_json = json.dumps(models)
    if user.mistral_model not in models:
        user.mistral_model = None
    db.commit()
    return models


@router.get("/mistral-key")
def get_mistral_key_status(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Return metadata only. The credential itself is never readable."""
    try:
        api_key = decrypt_api_key(user.id, user.mistral_api_key_encrypted)
        if api_key is None:
            return _api_key_status(user)
        models = _available_models_for_user(user, api_key, db)
        return _api_key_status(user, models)
    except ai.MistralError as exc:
        return {
            **_api_key_status(user),
            "model_error": str(exc),
        }
    except SecretUnavailable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/mistral-key")
def save_mistral_key(payload: MistralApiKeyRequest, db: Session = Depends(get_db),
                     user: User = Depends(current_user)):
    api_key = payload.api_key.strip()
    if any(character.isspace() for character in api_key):
        raise HTTPException(status_code=422, detail="The API key contains unexpected whitespace.")

    try:
        models = ai.verify_api_key(api_key)
    except ai.MistralError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    user.mistral_api_key_encrypted = encrypt_api_key(user.id, api_key)
    # The user explicitly picks a model from the menu after the key is saved.
    # This prevents a global default from silently selecting a paid-only tier.
    user.mistral_model = None
    user.mistral_compatible_models_json = json.dumps(models)
    db.commit()
    return {
        **_api_key_status(user, models),
        "message": "API key connected to your account.",
    }


@router.patch("/mistral-key/model")
def update_mistral_model(
    payload: MistralModelRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    try:
        api_key = decrypt_api_key(user.id, user.mistral_api_key_encrypted)
        if api_key is None:
            raise HTTPException(status_code=409, detail="Connect a Mistral API key first.")
        models = _available_models_for_user(user, api_key, db)
    except SecretUnavailable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ai.MistralError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if payload.model not in models:
        raise HTTPException(
            status_code=422,
            detail="This model is not available for this Mistral key.",
        )
    try:
        ai.verify_model_access(api_key, payload.model)
    except ai.MistralError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    user.mistral_model = payload.model
    db.commit()
    return {
        **_api_key_status(user, models),
        "message": "Mistral model updated.",
    }


@router.post("/mistral-key/models/refresh")
def refresh_mistral_models(
    db: Session = Depends(get_db), user: User = Depends(current_user)
):
    try:
        api_key = decrypt_api_key(user.id, user.mistral_api_key_encrypted)
        if api_key is None:
            raise HTTPException(status_code=409, detail="Connect a Mistral API key first.")
        models = _available_models_for_user(user, api_key, db, refresh=True)
    except SecretUnavailable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ai.MistralError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        **_api_key_status(user, models),
        "message": "Model list updated.",
    }


@router.delete("/mistral-key")
def delete_mistral_key(db: Session = Depends(get_db), user: User = Depends(current_user)):
    user.mistral_api_key_encrypted = None
    user.mistral_model = None
    user.mistral_compatible_models_json = None
    db.commit()
    return {"configured": False, "masked": None, "model": None, "available_models": []}


@router.post("/avatar")
def upload_avatar(file: UploadFile = File(...), db: Session = Depends(get_db),
                  user: User = Depends(current_user)):
    if file.content_type not in _AVATAR_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Unsupported image format. Use JPEG, PNG, or WebP.",
        )

    data = file.file.read(_AVATAR_MAX_BYTES + 1)
    if len(data) > _AVATAR_MAX_BYTES:
        raise HTTPException(status_code=413, detail="The picture must not exceed 3 MB.")
    if not data:
        raise HTTPException(status_code=422, detail="Le fichier est vide.")

    for old in settings.avatar_path.glob(f"{user.id}.*"):
        storage.remove_path(old)

    extension = _AVATAR_TYPES[file.content_type]
    destination = settings.avatar_path / f"{user.id}{extension}"
    destination.write_bytes(data)

    user.avatar_filename = destination.name
    db.commit()
    return {"user": serialize_user(user)}


@router.delete("/avatar")
def delete_avatar(db: Session = Depends(get_db), user: User = Depends(current_user)):
    for old in settings.avatar_path.glob(f"{user.id}.*"):
        storage.remove_path(old)
    user.avatar_filename = None
    db.commit()
    return {"user": serialize_user(user)}


@router.get("/avatar/{user_id}")
def get_avatar(user_id: str, user: User = Depends(current_user)):
    if user_id != user.id:
        raise HTTPException(status_code=404, detail="Image introuvable.")
    if not user.avatar_filename:
        raise HTTPException(status_code=404, detail="Aucune photo de profil.")
    path = settings.avatar_path / user.avatar_filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Aucune photo de profil.")
    return FileResponse(path, headers={"Cache-Control": "private, max-age=60"})


@router.get("/data")
def privacy_data(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Everything Fastclip holds about this account, in one honest summary."""
    projects = db.scalars(select(Project).where(Project.user_id == user.id)).all()
    clip_count = db.scalar(
        select(func.count(Clip.id))
        .select_from(Clip)
        .join(Project, Project.id == Clip.project_id)
        .where(Project.user_id == user.id, Clip.status == "completed")
    ) or 0

    return {
        "account": serialize_user(user),
        "counts": {
            "projects": len(projects),
            "clips": int(clip_count),
            "active_files": len([p for p in projects if p.files_purged_at is None]),
        },
        "storage_bytes": storage.user_storage_bytes(user.id),
        "storage_limit_bytes": settings.max_storage_per_user_mb * 1024 * 1024,
        "retention_hours": settings.retention_hours,
        "policy": [
            {
                "title": "Automatic deletion",
                "detail": (
                    f"Uploaded videos and exports are automatically deleted "
                    f"{settings.retention_hours} hours after upload. "
                    "Projects remain visible without their files."
                ),
            },
            {
                "title": "What is sent to AI",
                "detail": (
                    "Only the text transcript and its timestamps are sent to the "
                    "analysis model. Neither the video nor the audio leaves the server."
                ),
            },
            {
                "title": "Local processing",
                "detail": (
                    "Audio extraction, transcription, and encoding run on the "
                    "Fastclip server, not with a third party."
                ),
            },
            {
                "title": "Personal AI connection",
                "detail": (
                    "Your Mistral connection is linked only to your account and is "
                    "used only to analyze your transcripts."
                ),
            },
        ],
    }


@router.delete("")
def delete_account(payload: AccountDeleteRequest, response: Response,
                   db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not verify_password(user.password_hash, payload.password):
        raise HTTPException(status_code=403, detail="Password is incorrect.")

    user_id = user.id
    destroy_all_sessions(db, user_id)
    db.delete(user)
    db.commit()
    storage.delete_user_files(user_id)
    clear_session_cookie(response)
    return {"ok": True}
