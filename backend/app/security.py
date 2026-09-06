"""Password hashing (Argon2id) and opaque server-side sessions.

The browser only ever receives a random opaque token in an HttpOnly cookie.
The database stores its SHA-256 digest, so a database leak does not hand out
usable sessions.
"""
from __future__ import annotations

import hashlib
import re
import secrets
from datetime import timedelta

from argon2 import PasswordHasher, Type
from argon2.exceptions import (
    InvalidHashError,
    VerificationError,
    VerifyMismatchError,
)
from sqlalchemy.orm import Session

from .config import settings
from .models import SessionToken, User, utcnow

SESSION_COOKIE = "fastclip_session"

# Argon2id tuned for a 2 vCPU / 8 GB machine: ~64 MB and 2 passes keeps login
# well under 200 ms while staying far above bcrypt-equivalent cost.
_hasher = PasswordHasher(
    time_cost=2,
    memory_cost=64 * 1024,
    parallelism=2,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def validate_email(email: str) -> str | None:
    email = email.strip().lower()
    if not email:
        return "L'adresse email est obligatoire."
    if len(email) > 255 or not EMAIL_RE.match(email):
        return "Cette adresse email ne semble pas valide."
    return None


def validate_password(password: str) -> str | None:
    if len(password) < 8:
        return "Le mot de passe doit contenir au moins 8 caractères."
    if len(password) > 200:
        return "Le mot de passe ne peut pas dépasser 200 caractères."
    if password.isdigit() or password.isalpha():
        return "Mélange lettres et chiffres pour un mot de passe plus solide."
    return None


def validate_username(username: str) -> str | None:
    username = username.strip()
    if len(username) < 2:
        return "Le pseudo doit contenir au moins 2 caractères."
    if len(username) > 40:
        return "Le pseudo ne peut pas dépasser 40 caractères."
    return None


def _digest(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def create_session(db: Session, user: User, remember: bool) -> tuple[str, int]:
    """Returns (raw token for the cookie, max-age in seconds)."""
    raw_token = secrets.token_urlsafe(48)
    days = settings.session_days_remember if remember else settings.session_days
    expires_at = utcnow() + timedelta(days=days)

    db.add(SessionToken(id=_digest(raw_token), user_id=user.id, expires_at=expires_at))
    db.commit()
    return raw_token, days * 24 * 3600


def resolve_session(db: Session, raw_token: str | None) -> User | None:
    if not raw_token:
        return None
    record = db.get(SessionToken, _digest(raw_token))
    if record is None:
        return None
    if record.expires_at < utcnow():
        db.delete(record)
        db.commit()
        return None
    return db.get(User, record.user_id)


def destroy_session(db: Session, raw_token: str | None) -> None:
    if not raw_token:
        return
    record = db.get(SessionToken, _digest(raw_token))
    if record is not None:
        db.delete(record)
        db.commit()


def destroy_all_sessions(db: Session, user_id: str) -> None:
    db.query(SessionToken).filter(SessionToken.user_id == user_id).delete()
    db.commit()


def purge_expired_sessions(db: Session) -> int:
    deleted = (
        db.query(SessionToken).filter(SessionToken.expires_at < utcnow()).delete()
    )
    db.commit()
    return deleted
