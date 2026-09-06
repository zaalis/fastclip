"""Filesystem layout, quotas and the 24-hour retention sweep.

Layout:
    data/storage/<user_id>/<project_id>/source.mp4
                                        audio.wav
                                        thumb.jpg
                                        clips/<clip_id>/short.mp4
                                                        subtitles.srt
                                                        subtitles.ass
    data/avatars/<user_id>.<ext>
"""
from __future__ import annotations

import logging
import shutil
from datetime import timedelta
from pathlib import Path

from sqlalchemy import select

from ..config import settings
from ..models import Clip, Project, utcnow

logger = logging.getLogger("fastclip.storage")


def user_dir(user_id: str) -> Path:
    path = settings.storage_path / user_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def project_dir(user_id: str, project_id: str) -> Path:
    path = user_dir(user_id) / project_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def clip_dir(user_id: str, project_id: str, clip_id: str) -> Path:
    path = project_dir(user_id, project_id) / "clips" / clip_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def directory_size(path: Path) -> int:
    if not path.exists():
        return 0
    total = 0
    for entry in path.rglob("*"):
        try:
            if entry.is_file():
                total += entry.stat().st_size
        except OSError:  # pragma: no cover - file vanished mid-scan
            continue
    return total


def user_storage_bytes(user_id: str) -> int:
    return directory_size(settings.storage_path / user_id)


def has_storage_room(user_id: str, incoming_bytes: int) -> bool:
    limit = settings.max_storage_per_user_mb * 1024 * 1024
    return user_storage_bytes(user_id) + incoming_bytes <= limit


def remove_path(path: Path | None) -> None:
    if path is None:
        return
    try:
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)
        elif path.exists():
            path.unlink()
    except OSError as exc:  # pragma: no cover
        logger.warning("Could not remove %s: %s", path, exc)


def delete_project_files(user_id: str, project_id: str) -> None:
    remove_path(settings.storage_path / user_id / project_id)


def delete_user_files(user_id: str) -> None:
    remove_path(settings.storage_path / user_id)
    for candidate in settings.avatar_path.glob(f"{user_id}.*"):
        remove_path(candidate)


def purge_expired(db) -> int:
    """Delete source files and exports older than the retention window.

    Rows are kept (so the user still sees what existed and why it is gone) but
    every byte of media is removed and the project is flagged `files_purged_at`.
    """
    cutoff = utcnow() - timedelta(hours=settings.retention_hours)
    projects = db.scalars(
        select(Project).where(
            Project.created_at < cutoff, Project.files_purged_at.is_(None)
        )
    ).all()

    purged = 0
    for project in projects:
        delete_project_files(project.user_id, project.id)
        project.files_purged_at = utcnow()
        project.source_filename = None
        project.audio_filename = None
        project.thumbnail_filename = None
        for clip in db.scalars(select(Clip).where(Clip.project_id == project.id)).all():
            clip.output_filename = None
            clip.srt_filename = None
        purged += 1

    if purged:
        db.commit()
        logger.info("Retention sweep purged %s project(s)", purged)
    return purged
