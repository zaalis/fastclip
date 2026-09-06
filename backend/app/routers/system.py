"""System status, dashboard stats, live queue and saved subtitle templates."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import current_user, optional_user
from ..models import CaptionTemplate, Clip, Project, User
from ..schemas import CaptionTemplateRequest, serialize_project, serialize_template
from ..services import ai, queue, storage, subtitles, transcription, video
from ..services.account_secrets import SecretUnavailable, decrypt_api_key

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/status")
def system_status(user: User | None = Depends(optional_user)):
    """Honest capability report. The UI renders this instead of guessing."""
    api_key = None
    key_error = None
    if user is not None:
        try:
            api_key = decrypt_api_key(user.id, user.mistral_api_key_encrypted)
        except SecretUnavailable as exc:
            key_error = str(exc)
    return {
        "app": settings.app_name,
        "ai": {
            **ai.engine_info(api_key, user.mistral_model if user is not None else None),
            "message": (
                key_error
                if key_error
                else (
                    None
                    if ai.is_configured(api_key) and user is not None and user.mistral_model
                    else "Choisis un modèle Mistral dans les paramètres pour activer l’analyse IA."
                    if ai.is_configured(api_key)
                    else "Ajoute ta clé API Mistral dans les paramètres pour activer l’analyse IA."
                )
            ),
        },
        "transcription": transcription.engine_info(),
        "ffmpeg": {
            "available": video.ffmpeg_available(),
            "version": video.ffmpeg_version(),
        },
        "limits": {
            "max_upload_mb": settings.max_upload_mb,
            "max_duration_seconds": settings.max_duration_seconds,
            "max_storage_per_user_mb": settings.max_storage_per_user_mb,
            "retention_hours": settings.retention_hours,
            "allowed_extensions": settings.allowed_extension_list,
            "export": {
                "width": settings.export_width,
                "height": settings.export_height,
                "codec": "H.264 (libx264)",
            },
            "concurrent_jobs": 1,
        },
        "subtitles": {
            "styles": list(subtitles.SUBTITLE_STYLES),
            "sizes": list(subtitles.SUBTITLE_SIZES),
            "positions": list(subtitles.SUBTITLE_POSITIONS),
        },
    }


@router.get("/queue")
def get_queue(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return queue.queue_snapshot(db, user.id)


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(current_user)):
    projects = db.scalars(
        select(Project)
        .where(Project.user_id == user.id, Project.deleted_at.is_(None))
        .order_by(Project.created_at.desc())
    ).all()

    clips_exported = db.scalar(
        select(func.count(Clip.id))
        .select_from(Clip)
        .join(Project, Project.id == Clip.project_id)
        .where(Project.user_id == user.id, Clip.status == "completed")
    ) or 0

    return {
        "stats": {
            "projects": len(projects),
            "clips_exported": int(clips_exported),
            # A practical manual edit is estimated at eight times the delivered clip.
            # Derive it from completed clip durations so the dashboard is auditable.
            "seconds_saved": int(sum(max(60, (clip.end_seconds - clip.start_seconds) * 8) for clip in db.scalars(select(Clip).join(Project, Project.id == Clip.project_id).where(Project.user_id == user.id, Clip.status == "completed")).all())),
            "storage_bytes": storage.user_storage_bytes(user.id),
            "storage_limit_bytes": settings.max_storage_per_user_mb * 1024 * 1024,
        },
        "recent_projects": [serialize_project(p) for p in projects[:6]],
        "queue": queue.queue_snapshot(db, user.id),
    }


# --- Saved subtitle presets -------------------------------------------------

@router.get("/caption-templates")
def list_templates(db: Session = Depends(get_db), user: User = Depends(current_user)):
    templates = db.scalars(
        select(CaptionTemplate)
        .where(CaptionTemplate.user_id == user.id)
        .order_by(CaptionTemplate.is_default.desc(), CaptionTemplate.created_at.asc())
    ).all()
    return {"templates": [serialize_template(t) for t in templates]}


@router.post("/caption-templates")
def create_template(payload: CaptionTemplateRequest, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    count = db.scalar(
        select(func.count(CaptionTemplate.id)).where(CaptionTemplate.user_id == user.id)
    ) or 0
    if count >= 20:
        raise HTTPException(
            status_code=409,
            detail="Limite de 20 modèles atteinte. Supprime un modèle existant.",
        )

    if payload.is_default:
        for existing in db.scalars(
            select(CaptionTemplate).where(CaptionTemplate.user_id == user.id)
        ).all():
            existing.is_default = False

    template = CaptionTemplate(
        user_id=user.id,
        name=payload.name.strip()[:80],
        style=subtitles.normalise_style(payload.style),
        size=subtitles.normalise_size(payload.size),
        position=subtitles.normalise_position(payload.position),
        accent_color=payload.accent_color if payload.accent_color.startswith("#")
        else "#FF8A3D",
        is_default=payload.is_default,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return {"template": serialize_template(template)}


@router.post("/caption-templates/{template_id}/default")
def set_default_template(template_id: str, db: Session = Depends(get_db),
                         user: User = Depends(current_user)):
    template = db.get(CaptionTemplate, template_id)
    if template is None or template.user_id != user.id:
        raise HTTPException(status_code=404, detail="Modèle introuvable.")
    for existing in db.scalars(
        select(CaptionTemplate).where(CaptionTemplate.user_id == user.id)
    ).all():
        existing.is_default = existing.id == template_id
    db.commit()
    return {"template": serialize_template(template)}


@router.delete("/caption-templates/{template_id}")
def delete_template(template_id: str, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    template = db.get(CaptionTemplate, template_id)
    if template is None or template.user_id != user.id:
        raise HTTPException(status_code=404, detail="Modèle introuvable.")
    db.delete(template)
    db.commit()
    return {"ok": True}
