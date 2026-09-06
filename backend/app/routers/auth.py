"""Authentication: register, login, logout, session probe, password reset stub."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import clear_session_cookie, optional_user, set_session_cookie
from ..models import CaptionTemplate, User
from ..schemas import (
    LoginRequest,
    PasswordResetRequest,
    RegisterRequest,
    serialize_user,
)
from ..security import (
    SESSION_COOKIE,
    create_session,
    destroy_session,
    hash_password,
    needs_rehash,
    validate_email,
    validate_password,
    validate_username,
    verify_password,
)
from ..services import ratelimit

router = APIRouter(prefix="/api/auth", tags=["auth"])

_DEFAULT_TEMPLATES = [
    ("Épuré", "clean", "medium", "bottom", "#2F80ED", True),
    ("Punch", "punch", "large", "bottom", "#FF8A3D", False),
    ("Accent Fastclip", "accent", "medium", "bottom", "#FF8A3D", False),
]


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/register")
def register(payload: RegisterRequest, request: Request, response: Response,
             db: Session = Depends(get_db)):
    try:
        ratelimit.check(
            "register", _client_key(request), 10,
            "Trop de comptes créés depuis cette adresse. Réessaie dans une heure.",
        )
    except ratelimit.RateLimited as exc:
        raise HTTPException(status_code=429, detail=exc.message) from exc

    email = payload.email.strip().lower()
    username = payload.username.strip()

    for error in (
        validate_email(email),
        validate_username(username),
        validate_password(payload.password),
    ):
        if error:
            raise HTTPException(status_code=422, detail=error)

    existing = db.scalar(select(User).where(func.lower(User.email) == email))
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="Un compte existe déjà avec cette adresse email.",
        )

    user = User(email=email, username=username, password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()

    # Seed the three built-in subtitle presets so the editor is useful on day one.
    for name, style, size, position, accent, is_default in _DEFAULT_TEMPLATES:
        db.add(
            CaptionTemplate(
                user_id=user.id, name=name, style=style, size=size,
                position=position, accent_color=accent, is_default=is_default,
            )
        )
    db.commit()

    raw_token, max_age = create_session(db, user, payload.remember)
    set_session_cookie(response, raw_token, max_age)
    return {"user": serialize_user(user)}


@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response,
          db: Session = Depends(get_db)):
    try:
        ratelimit.check(
            "login", _client_key(request), 30,
            "Trop de tentatives de connexion. Réessaie dans une heure.",
        )
    except ratelimit.RateLimited as exc:
        raise HTTPException(status_code=429, detail=exc.message) from exc

    email = payload.email.strip().lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email))

    # Same generic message either way: no account enumeration.
    if user is None or not verify_password(user.password_hash, payload.password):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)
        db.commit()

    raw_token, max_age = create_session(db, user, payload.remember)
    set_session_cookie(response, raw_token, max_age)
    return {"user": serialize_user(user)}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    destroy_session(db, request.cookies.get(SESSION_COOKIE))
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me")
def me(user: User | None = Depends(optional_user)):
    """Session probe.

    Returns 200 with a null user when nobody is signed in: a public page
    asking "who am I?" is a normal question, not an error, and a 401 here
    would fill every visitor's console with red herrings.
    """
    return {"user": serialize_user(user) if user else None}


@router.post("/password-reset")
def password_reset(payload: PasswordResetRequest, request: Request):
    """No email infrastructure in V1 - and we say so instead of pretending."""
    try:
        ratelimit.check(
            "password-reset", _client_key(request), 5,
            "Trop de demandes. Réessaie dans une heure.",
        )
    except ratelimit.RateLimited as exc:
        raise HTTPException(status_code=429, detail=exc.message) from exc

    validate_email(payload.email)
    return {
        "ok": True,
        "email_delivery_configured": False,
        "message": (
            "L'envoi d'email n'est pas encore branche sur cette installation. "
            "Contacte l'administrateur du serveur pour réinitialiser le mot de "
            "passe : c'est la prochaine évolution prévue."
        ),
    }
