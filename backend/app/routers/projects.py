"""Projects: import, listing, lifecycle, media streaming."""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import current_user, owned_project
from ..models import Job, Project, User, utcnow
from ..responses import range_file_response
from ..schemas import ProjectRenameRequest, serialize_project
from ..services import queue, ratelimit, storage, video

logger = logging.getLogger("fastclip.projects")
router = APIRouter(prefix="/api/projects", tags=["projects"])

_SAFE_NAME_RE = re.compile(r"[^\w\s\-.]", re.UNICODE)
_CONTENT_TYPES = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
}


def _clean_name(raw: str, fallback: str = "Nouveau projet") -> str:
    cleaned = _SAFE_NAME_RE.sub("", (raw or "").strip())[:140].strip()
    return cleaned or fallback


def _is_busy(project: Project) -> bool:
    return project.status in ("queued", "transcribing", "analyzing", "rendering", "uploading")


# --- Import -----------------------------------------------------------------

@router.post("/upload")
async def upload_project(
    request: Request,
    file: UploadFile = File(...),
    name: str = Form(default=""),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Stream the upload to disk, validate it, then queue the pipeline."""
    try:
        ratelimit.check(
            "upload", user.id, settings.rate_limit_uploads_per_hour,
            f"Limite d'import atteinte ({settings.rate_limit_uploads_per_hour} par "
            "heure). Réessaie plus tard.",
        )
    except ratelimit.RateLimited as exc:
        raise HTTPException(
            status_code=429, detail=exc.message,
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc

    if not video.ffmpeg_available():
        raise HTTPException(
            status_code=503,
            detail="FFmpeg n'est pas disponible sur le serveur. L'import est "
                   "désactivé tant qu'il n'est pas installe.",
        )

    original = Path(file.filename or "video.mp4").name
    extension = Path(original).suffix.lower()
    if extension not in settings.allowed_extension_list:
        raise HTTPException(
            status_code=415,
            detail=(
                "Format non supporté. Formats acceptés : "
                + ", ".join(e.upper().lstrip(".") for e in settings.allowed_extension_list)
                + "."
            ),
        )

    if not storage.has_storage_room(user.id, 0):
        raise HTTPException(
            status_code=507,
            detail=(
                f"Espace de stockage plein ({settings.max_storage_per_user_mb} Mo). "
                "Supprime un projet pour libérer de la place."
            ),
        )

    project = Project(
        user_id=user.id,
        name=_clean_name(name or Path(original).stem),
        status="uploading",
        original_filename=original,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    folder = storage.project_dir(user.id, project.id)
    destination = folder / f"source{extension}"

    # --- Stream to disk, 1 MiB at a time, refusing to exceed the cap ---
    written = 0
    try:
        with destination.open("wb") as handle:
            while True:
                chunk = await file.read(settings.upload_chunk_bytes)
                if not chunk:
                    break
                written += len(chunk)
                if written > settings.max_upload_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            f"Fichier trop lourd. Limite : "
                            f"{settings.max_upload_mb} Mo."
                        ),
                    )
                handle.write(chunk)
    except HTTPException:
        storage.delete_project_files(user.id, project.id)
        db.delete(project)
        db.commit()
        raise
    except Exception as exc:
        storage.delete_project_files(user.id, project.id)
        db.delete(project)
        db.commit()
        logger.exception("Upload failed")
        raise HTTPException(
            status_code=500, detail="L'import a échoué pendant l'écriture du fichier."
        ) from exc
    finally:
        await file.close()

    if written == 0:
        storage.delete_project_files(user.id, project.id)
        db.delete(project)
        db.commit()
        raise HTTPException(status_code=422, detail="Le fichier envoyé est vide.")

    if not storage.has_storage_room(user.id, 0):
        storage.delete_project_files(user.id, project.id)
        db.delete(project)
        db.commit()
        raise HTTPException(
            status_code=507,
            detail=(
                f"Espace de stockage plein ({settings.max_storage_per_user_mb} Mo). "
                "Supprime un projet pour libérer de la place."
            ),
        )

    # --- Validate the actual media, not just the extension ---
    try:
        info = video.probe(destination)
    except video.FFmpegError as exc:
        storage.delete_project_files(user.id, project.id)
        db.delete(project)
        db.commit()
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if info.duration > settings.max_duration_seconds:
        storage.delete_project_files(user.id, project.id)
        db.delete(project)
        db.commit()
        minutes = settings.max_duration_seconds // 60
        raise HTTPException(
            status_code=422,
            detail=(
                f"Vidéo trop longue ({info.duration / 60:.1f} min). "
                f"Limite : {minutes} minutes."
            ),
        )
    if not info.has_audio:
        storage.delete_project_files(user.id, project.id)
        db.delete(project)
        db.commit()
        raise HTTPException(
            status_code=422,
            detail="Cette vidéo ne contient aucune piste audio : impossible de la "
                   "transcrire.",
        )

    thumbnail = folder / "thumb.jpg"
    try:
        video.generate_thumbnail(destination, thumbnail, min(1.0, info.duration / 2))
    except Exception:  # pragma: no cover - a missing poster is not fatal
        logger.warning("Thumbnail generation failed for %s", project.id)

    project.source_filename = destination.name
    project.size_bytes = written
    project.duration_seconds = round(info.duration, 2)
    project.width = info.width
    project.height = info.height
    project.thumbnail_filename = thumbnail.name if thumbnail.exists() else None
    project.status = "queued"
    project.stage_detail = "En attente dans la file"
    db.commit()

    queue.enqueue(db, user_id=user.id, project_id=project.id, kind="process")
    db.refresh(project)
    return {"project": serialize_project(project)}


# --- Listing & detail -------------------------------------------------------

@router.get("")
def list_projects(db: Session = Depends(get_db), user: User = Depends(current_user)):
    projects = db.scalars(
        select(Project)
        .where(Project.user_id == user.id, Project.deleted_at.is_(None))
        .order_by(Project.created_at.desc())
    ).all()
    return {"projects": [serialize_project(p) for p in projects]}


@router.get("/trash")
def list_trash(db: Session = Depends(get_db), user: User = Depends(current_user)):
    projects = db.scalars(select(Project).where(Project.user_id == user.id, Project.deleted_at.is_not(None)).order_by(Project.deleted_at.desc())).all()
    return {"projects": [serialize_project(p) for p in projects]}


@router.post("/trash/{project_id}/restore")
def restore_project(project_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    project = db.get(Project, project_id)
    if project is None or project.user_id != user.id or project.deleted_at is None:
        raise HTTPException(status_code=404, detail="Projet introuvable dans la corbeille.")
    project.deleted_at = None
    db.commit()
    return {"project": serialize_project(project)}


@router.delete("/trash/{project_id}")
def permanently_delete_project(project_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    project = db.get(Project, project_id)
    if project is None or project.user_id != user.id or project.deleted_at is None:
        raise HTTPException(status_code=404, detail="Projet introuvable dans la corbeille.")
    user_id, project_id = project.user_id, project.id
    db.delete(project)
    db.commit()
    storage.delete_project_files(user_id, project_id)
    return {"ok": True}


@router.get("/{project_id}")
def get_project(project: Project = Depends(owned_project)):
    return {"project": serialize_project(project, include_relations=True)}


@router.get("/{project_id}/transcript")
def get_transcript(project: Project = Depends(owned_project)):
    if not project.transcript_json:
        return {"transcript": None}
    try:
        return {"transcript": json.loads(project.transcript_json)}
    except ValueError:
        return {"transcript": None}


@router.patch("/{project_id}")
def rename_project(payload: ProjectRenameRequest, db: Session = Depends(get_db),
                   project: Project = Depends(owned_project)):
    project.name = _clean_name(payload.name, project.name)
    db.commit()
    return {"project": serialize_project(project)}


@router.delete("/{project_id}")
def delete_project(db: Session = Depends(get_db), project: Project = Depends(owned_project)):
    # Stop queued work, then keep all media recoverable in the recycle bin.
    for job in db.scalars(
        select(Job).where(
            Job.project_id == project.id, Job.status.in_(("queued", "running"))
        )
    ).all():
        queue.request_cancel(db, job)

    project.deleted_at = utcnow()
    db.commit()
    return {"ok": True}


# --- Lifecycle --------------------------------------------------------------

@router.post("/{project_id}/cancel")
def cancel_project(db: Session = Depends(get_db), project: Project = Depends(owned_project)):
    jobs = db.scalars(
        select(Job).where(
            Job.project_id == project.id, Job.status.in_(("queued", "running"))
        )
    ).all()
    if not jobs:
        raise HTTPException(
            status_code=409, detail="Aucune tâche en cours pour ce projet."
        )
    for job in jobs:
        queue.request_cancel(db, job)

    if all(job.status == "cancelled" for job in jobs):
        project.status = "cancelled"
        project.stage_detail = "Tâche annulée"
        db.commit()

    db.refresh(project)
    return {"project": serialize_project(project)}


@router.post("/{project_id}/retry")
def retry_project(db: Session = Depends(get_db), project: Project = Depends(owned_project)):
    if _is_busy(project):
        raise HTTPException(
            status_code=409, detail="Une tâche est déjà en cours pour ce projet."
        )
    if project.files_purged_at is not None or not project.source_filename:
        raise HTTPException(
            status_code=410,
            detail=(
                "Le fichier source a été supprimé automatiquement après "
                f"{settings.retention_hours} heures. Réimporte la vidéo."
            ),
        )
    source = storage.project_dir(project.user_id, project.id) / project.source_filename
    if not source.exists():
        raise HTTPException(
            status_code=410,
            detail="Le fichier source est introuvable. Réimporte la vidéo.",
        )

    try:
        ratelimit.check(
            "analysis", project.user_id, settings.rate_limit_analyses_per_hour,
            f"Limite d'analyses atteinte "
            f"({settings.rate_limit_analyses_per_hour} par heure).",
        )
    except ratelimit.RateLimited as exc:
        raise HTTPException(
            status_code=429, detail=exc.message,
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc

    project.status = "queued"
    project.progress = 0
    project.error_message = None
    project.analysis_error = None
    project.stage_detail = "En attente dans la file"
    project.updated_at = utcnow()
    db.commit()

    queue.enqueue(db, user_id=project.user_id, project_id=project.id, kind="process")
    db.refresh(project)
    return {"project": serialize_project(project)}


# --- Media ------------------------------------------------------------------

@router.get("/{project_id}/thumbnail")
def get_thumbnail(project: Project = Depends(owned_project)):
    from fastapi.responses import FileResponse

    if not project.thumbnail_filename:
        raise HTTPException(status_code=404, detail="Aucune miniature.")
    path = storage.project_dir(project.user_id, project.id) / project.thumbnail_filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Aucune miniature.")
    return FileResponse(
        path, media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.get("/{project_id}/video")
def stream_video(request: Request, project: Project = Depends(owned_project)):
    if not project.source_filename:
        raise HTTPException(
            status_code=410,
            detail=(
                "La vidéo source a été supprimée automatiquement après "
                f"{settings.retention_hours} heures."
            ),
        )
    path = storage.project_dir(project.user_id, project.id) / project.source_filename
    media_type = _CONTENT_TYPES.get(Path(project.source_filename).suffix.lower(), "video/mp4")
    return range_file_response(
        request, path, media_type,
        missing_detail="La vidéo source n'est plus disponible sur le serveur.",
    )
