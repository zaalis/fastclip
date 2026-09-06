"""Shared FastAPI dependencies."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import Project, User
from .security import SESSION_COOKIE, resolve_session


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = resolve_session(db, request.cookies.get(SESSION_COOKIE))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expirée. Reconnecte-toi pour continuer.",
        )
    return user


def optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    return resolve_session(db, request.cookies.get(SESSION_COOKIE))


def owned_project(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.user_id != user.id or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Projet introuvable.")
    return project


def set_session_cookie(response, raw_token: str, max_age: int) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=raw_token,
        max_age=max_age,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )


def clear_session_cookie(response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )
