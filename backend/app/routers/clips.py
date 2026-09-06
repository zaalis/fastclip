"""Clips: create an export job, follow it, download the results."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import current_user, owned_project
from ..models import Clip, Job, Project, User
from ..responses import range_file_response
from ..schemas import ClipCreateRequest, serialize_clip
from ..services import queue, ratelimit, storage, subtitles

router = APIRouter(tags=["clips"])

MIN_CLIP_SECONDS = 3.0
MAX_CLIP_SECONDS = 180.0

EXPORT_FORMATS = {
    "vertical_hd": (1080, 1920), "vertical": (720, 1280),
    "square": (1080, 1080), "landscape_hd": (1920, 1080),
}


def _owned_clip(clip_id: str, db: Session, user: User) -> tuple[Clip, Project]:
    clip = db.get(Clip, clip_id)
    if clip is None:
        raise HTTPException(status_code=404, detail="Clip introuvable.")
    project = db.get(Project, clip.project_id)
    if project is None or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Clip introuvable.")
    return clip, project


@router.post("/api/projects/{project_id}/clips")
def create_clip(
    payload: ClipCreateRequest,
    db: Session = Depends(get_db),
    project: Project = Depends(owned_project),
):
    """Validate the user's cut, then queue the render."""
    if project.files_purged_at is not None or not project.source_filename:
        raise HTTPException(
            status_code=410,
            detail=(
                "La vidéo source a été supprimée automatiquement après "
                f"{settings.retention_hours} heures. Réimporte-la pour exporter."
            ),
        )
    if not project.transcript_json:
        raise HTTPException(
            status_code=409,
            detail="La transcription n'est pas encore prête pour ce projet.",
        )
    if project.status in ("queued", "transcribing", "analyzing", "rendering"):
        raise HTTPException(
            status_code=409,
            detail="Une tâche est déjà en cours sur ce projet. Attends la fin ou "
                   "annule-la.",
        )

    try:
        ratelimit.check(
            "export", project.user_id, settings.rate_limit_exports_per_hour,
            f"Limite d'exports atteinte "
            f"({settings.rate_limit_exports_per_hour} par heure).",
        )
    except ratelimit.RateLimited as exc:
        raise HTTPException(
            status_code=429, detail=exc.message,
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc

    start = max(0.0, float(payload.start_seconds))
    end = min(float(payload.end_seconds), project.duration_seconds or payload.end_seconds)
    duration = end - start

    if duration < MIN_CLIP_SECONDS:
        raise HTTPException(
            status_code=422,
            detail=f"Le clip est trop court (minimum {MIN_CLIP_SECONDS:.0f} secondes).",
        )
    if duration > MAX_CLIP_SECONDS:
        raise HTTPException(
            status_code=422,
            detail=f"Le clip est trop long (maximum {MAX_CLIP_SECONDS / 60:.0f} minutes).",
        )

    hashtags = [
        ("#" + str(tag).lstrip("#").strip())
        for tag in (payload.hashtags or [])[:10]
        if str(tag).strip()
    ]

    export_format = payload.export_format if payload.export_format in EXPORT_FORMATS else "vertical_hd"
    export_width, export_height = EXPORT_FORMATS[export_format]
    clip = Clip(
        project_id=project.id,
        suggestion_id=payload.suggestion_id,
        title=payload.title.strip()[:200] or project.name,
        caption=payload.caption.strip()[:2000],
        hashtags_json=json.dumps(hashtags, ensure_ascii=False),
        start_seconds=round(start, 2),
        end_seconds=round(end, 2),
        subtitle_style=subtitles.normalise_style(payload.subtitle_style),
        subtitle_size=subtitles.normalise_size(payload.subtitle_size),
        subtitle_position=subtitles.normalise_position(payload.subtitle_position),
        subtitle_accent=payload.subtitle_accent if payload.subtitle_accent.startswith("#")
        else "#FF8A3D",
        subtitles_enabled=payload.subtitles_enabled,
        export_format=export_format,
        export_width=export_width,
        export_height=export_height,
        subtitle_font=subtitles.normalise_font(payload.subtitle_font),
        subtitle_effect=subtitles.normalise_effect(payload.subtitle_effect),
        playback_speed=round(payload.playback_speed, 2),
        crop_x=round(payload.crop_x, 3), crop_y=round(payload.crop_y, 3),
        crop_zoom=round(payload.crop_zoom, 3), crop_rotation=round(payload.crop_rotation, 2),
        status="queued",
        stage_detail="En attente dans la file",
    )
    db.add(clip)

    project.status = "queued"
    project.progress = 0
    project.stage_detail = "Export en attente"
    project.error_message = None
    db.commit()
    db.refresh(clip)

    queue.enqueue(
        db, user_id=project.user_id, project_id=project.id, kind="export", clip_id=clip.id
    )
    db.refresh(clip)
    return {"clip": serialize_clip(clip)}


@router.get("/api/clips/{clip_id}")
def get_clip(clip_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    clip, _ = _owned_clip(clip_id, db, user)
    return {"clip": serialize_clip(clip)}


@router.post("/api/clips/{clip_id}/cancel")
def cancel_clip(clip_id: str, db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    clip, _ = _owned_clip(clip_id, db, user)
    jobs = db.scalars(
        select(Job).where(Job.clip_id == clip.id, Job.status.in_(("queued", "running")))
    ).all()
    if not jobs:
        raise HTTPException(status_code=409, detail="Aucun export en cours pour ce clip.")
    for job in jobs:
        queue.request_cancel(db, job)
    db.refresh(clip)
    return {"clip": serialize_clip(clip)}


@router.post("/api/clips/{clip_id}/retry")
def retry_clip(clip_id: str, db: Session = Depends(get_db),
               user: User = Depends(current_user)):
    clip, project = _owned_clip(clip_id, db, user)
    if clip.status in ("queued", "rendering"):
        raise HTTPException(status_code=409, detail="Cet export est déjà en cours.")
    if project.files_purged_at is not None or not project.source_filename:
        raise HTTPException(
            status_code=410,
            detail="La vidéo source a été supprimée automatiquement. Réimporte-la.",
        )

    clip.status = "queued"
    clip.progress = 0
    clip.error_message = None
    clip.stage_detail = "En attente dans la file"
    project.status = "queued"
    project.progress = 0
    project.error_message = None
    db.commit()

    queue.enqueue(
        db, user_id=project.user_id, project_id=project.id, kind="export", clip_id=clip.id
    )
    db.refresh(clip)
    return {"clip": serialize_clip(clip)}


@router.delete("/api/clips/{clip_id}")
def delete_clip(clip_id: str, db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    clip, project = _owned_clip(clip_id, db, user)
    for job in db.scalars(
        select(Job).where(Job.clip_id == clip.id, Job.status.in_(("queued", "running")))
    ).all():
        queue.request_cancel(db, job)

    folder = storage.clip_dir(project.user_id, project.id, clip.id)
    db.delete(clip)
    db.commit()
    storage.remove_path(folder)
    return {"ok": True}


# --- Downloads --------------------------------------------------------------

def _clip_file(clip: Clip, project: Project, filename: str | None):
    if not filename:
        raise HTTPException(
            status_code=410,
            detail=(
                "Ce fichier a été supprimé automatiquement après "
                f"{settings.retention_hours} heures."
            ),
        )
    return storage.clip_dir(project.user_id, project.id, clip.id) / filename


def _safe_filename(title: str, extension: str) -> str:
    base = "".join(c if c.isalnum() or c in " -_" else "" for c in (title or "fastclip"))
    base = base.strip().replace(" ", "-")[:60] or "fastclip"
    return f"{base}{extension}"


@router.get("/api/clips/{clip_id}/video")
def stream_clip(clip_id: str, request: Request, db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    clip, project = _owned_clip(clip_id, db, user)
    path = _clip_file(clip, project, clip.output_filename)
    return range_file_response(
        request, path, "video/mp4",
        missing_detail="Le Short n'est plus disponible sur le serveur.",
    )


@router.get("/api/clips/{clip_id}/download")
def download_clip(clip_id: str, request: Request, db: Session = Depends(get_db),
                  user: User = Depends(current_user)):
    clip, project = _owned_clip(clip_id, db, user)
    path = _clip_file(clip, project, clip.output_filename)
    return range_file_response(
        request, path, "video/mp4",
        filename=_safe_filename(clip.title, ".mp4"),
        download=True,
        missing_detail="Le Short n'est plus disponible sur le serveur.",
    )


@router.get("/api/clips/{clip_id}/subtitles")
def download_subtitles(clip_id: str, request: Request, db: Session = Depends(get_db),
                       user: User = Depends(current_user)):
    clip, project = _owned_clip(clip_id, db, user)
    path = _clip_file(clip, project, clip.srt_filename)
    return range_file_response(
        request, path, "application/x-subrip",
        filename=_safe_filename(clip.title, ".srt"),
        download=True,
        missing_detail="Le fichier de sous-titres n'est plus disponible.",
    )
