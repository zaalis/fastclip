"""Single-slot processing queue.

One worker thread, one job at a time. That is a deliberate product decision,
not a limitation: on an e2-standard-2 (2 vCPU / 8 GB) a parallel FFmpeg encode
plus a Whisper transcription would thrash the machine and make every job slower.

The queue lives in SQLite, so its state survives a restart and can be rendered
honestly in the UI (position in line, current stage, live progress).
"""
from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path

from sqlalchemy import select

from ..config import settings
from ..database import session_scope
from ..models import Clip, ClipSuggestion, Job, Project, User, utcnow
from . import ai, storage, subtitles, transcription, video
from .account_secrets import SecretUnavailable, decrypt_api_key
from .video import FFmpegError, JobCancelled

logger = logging.getLogger("fastclip.queue")

_wake = threading.Event()
_worker: threading.Thread | None = None
_janitor: threading.Thread | None = None
_stop = threading.Event()

# Progress budget per stage of a `process` job (must sum to 100).
_AUDIO_SHARE = 12
_TRANSCRIBE_SHARE = 63
_ANALYSE_SHARE = 25


# --- Public API -------------------------------------------------------------

def enqueue(db, *, user_id: str, project_id: str, kind: str, clip_id: str | None = None) -> Job:
    job = Job(user_id=user_id, project_id=project_id, kind=kind, clip_id=clip_id)
    db.add(job)
    db.commit()
    db.refresh(job)
    _wake.set()
    return job


def request_cancel(db, job: Job) -> None:
    job.cancel_requested = True
    if job.status == "queued":
        job.status = "cancelled"
        job.finished_at = utcnow()
    db.commit()


def queue_snapshot(db, user_id: str) -> dict:
    """What the user sees in the queue panel: their jobs plus global position."""
    pending = db.scalars(
        select(Job)
        .where(Job.status.in_(("queued", "running")))
        .order_by(Job.created_at.asc())
    ).all()

    items = []
    for position, job in enumerate(pending):
        if job.user_id != user_id:
            continue
        project = db.get(Project, job.project_id)
        items.append(
            {
                "job_id": job.id,
                "project_id": job.project_id,
                "project_name": project.name if project else "Projet",
                "clip_id": job.clip_id,
                "kind": job.kind,
                "status": job.status,
                "stage": job.stage,
                "stage_detail": job.stage_detail,
                "progress": job.progress,
                "position": position,
                "created_at": job.created_at.isoformat() + "Z",
            }
        )
    return {"active_slots": 1, "pending_total": len(pending), "items": items}


def start_workers() -> None:
    global _worker, _janitor
    _stop.clear()
    if _worker is None or not _worker.is_alive():
        _worker = threading.Thread(target=_worker_loop, name="fastclip-worker", daemon=True)
        _worker.start()
    if _janitor is None or not _janitor.is_alive():
        _janitor = threading.Thread(target=_janitor_loop, name="fastclip-janitor", daemon=True)
        _janitor.start()


def stop_workers() -> None:
    _stop.set()
    _wake.set()


def recover_orphans() -> None:
    """A job that was `running` when the process died can never resume."""
    with session_scope() as db:
        stuck = db.scalars(select(Job).where(Job.status == "running")).all()
        for job in stuck:
            job.status = "failed"
            job.error_message = "Le serveur a redémarré pendant le traitement."
            job.finished_at = utcnow()
            project = db.get(Project, job.project_id)
            if project is not None and project.status not in ("completed", "cancelled"):
                project.status = "failed"
                project.error_message = job.error_message
            if job.clip_id:
                clip = db.get(Clip, job.clip_id)
                if clip is not None and clip.status not in ("completed", "cancelled"):
                    clip.status = "failed"
                    clip.error_message = job.error_message
        if stuck:
            logger.warning("Recovered %s orphaned job(s)", len(stuck))


# --- Worker loop ------------------------------------------------------------

def _worker_loop() -> None:
    logger.info("Worker started (1 concurrent job)")
    while not _stop.is_set():
        job_id = _claim_next_job()
        if job_id is None:
            _wake.wait(timeout=2.0)
            _wake.clear()
            continue
        try:
            _run_job(job_id)
        except Exception:  # pragma: no cover - last-resort guard
            logger.exception("Unhandled error while running job %s", job_id)
            _fail_job(job_id, "Une erreur inattendue est survenue pendant le traitement.")


def _claim_next_job() -> str | None:
    with session_scope() as db:
        job = db.scalars(
            select(Job).where(Job.status == "queued").order_by(Job.created_at.asc()).limit(1)
        ).first()
        if job is None:
            return None
        if job.cancel_requested:
            job.status = "cancelled"
            job.finished_at = utcnow()
            return None
        job.status = "running"
        job.started_at = utcnow()
        return job.id


def _cancel_checker(job_id: str):
    """Cheap, throttled DB poll used by FFmpeg/Whisper progress loops."""
    state = {"last": 0.0, "value": False}

    def check() -> bool:
        now = time.monotonic()
        if now - state["last"] < 1.0:
            return state["value"]
        state["last"] = now
        with session_scope() as db:
            job = db.get(Job, job_id)
            state["value"] = bool(job and job.cancel_requested)
        return state["value"]

    return check


def _progress_reporter(job_id: str):
    """Throttled progress writer: at most one DB write per 400 ms per job."""
    state = {"last": 0.0, "value": -1}

    def report(percent: int, stage: str | None = None, detail: str | None = None) -> None:
        percent = max(0, min(100, int(percent)))
        now = time.monotonic()
        forced = percent in (0, 100) or stage is not None
        if not forced and (now - state["last"] < 0.4 or percent == state["value"]):
            return
        state["last"] = now
        state["value"] = percent
        with session_scope() as db:
            job = db.get(Job, job_id)
            if job is None:
                return
            job.progress = percent
            if stage:
                job.stage = stage
            if detail is not None:
                job.stage_detail = detail
            project = db.get(Project, job.project_id)
            if project is not None:
                project.progress = percent
                if detail is not None:
                    project.stage_detail = detail
            if job.clip_id:
                clip = db.get(Clip, job.clip_id)
                if clip is not None:
                    clip.progress = percent
                    if detail is not None:
                        clip.stage_detail = detail

    return report


def _run_job(job_id: str) -> None:
    with session_scope() as db:
        job = db.get(Job, job_id)
        if job is None:
            return
        kind, project_id, clip_id, user_id = job.kind, job.project_id, job.clip_id, job.user_id

    try:
        if kind == "process":
            _run_process_job(job_id, user_id, project_id)
        elif kind == "export":
            _run_export_job(job_id, user_id, project_id, clip_id)
        else:  # pragma: no cover
            raise FFmpegError(f"Type de tâche inconnu : {kind}")
    except JobCancelled:
        _cancel_job(job_id)
    except (FFmpegError, transcription.TranscriptionUnavailable) as exc:
        _fail_job(job_id, str(exc))
    except ai.MistralNotConfigured as exc:
        _fail_job(job_id, str(exc), analysis_error=str(exc))
    except ai.MistralError as exc:
        _fail_job(job_id, str(exc), analysis_error=str(exc))
    except FileNotFoundError:
        _fail_job(
            job_id,
            "Le fichier source est introuvable. Il a peut-être été supprimé "
            "automatiquement après 24 heures.",
        )
    except Exception as exc:  # pragma: no cover
        logger.exception("Job %s failed", job_id)
        _fail_job(job_id, f"Erreur inattendue : {exc}")


# --- Stage 1-3: audio -> transcription -> AI analysis ----------------------

def _run_process_job(job_id: str, user_id: str, project_id: str) -> None:
    report = _progress_reporter(job_id)
    cancelled = _cancel_checker(job_id)

    with session_scope() as db:
        project = db.get(Project, project_id)
        if project is None:
            raise FileNotFoundError(project_id)
        source_name = project.source_filename
        duration = project.duration_seconds
        project.status = "transcribing"
        project.error_message = None
        project.analysis_error = None
        project.progress = 0

    folder = storage.project_dir(user_id, project_id)
    source = folder / (source_name or "")
    if not source_name or not source.exists():
        raise FileNotFoundError(str(source))

    # --- Audio extraction (mono 16 kHz) ---
    report(0, "transcribing", "Extraction de l'audio (mono 16 kHz)")
    audio_path = folder / "audio.wav"
    video.extract_audio(
        source,
        audio_path,
        duration,
        on_progress=lambda ratio: report(int(ratio * _AUDIO_SHARE)),
        should_cancel=cancelled,
    )
    if cancelled():
        raise JobCancelled()

    with session_scope() as db:
        project = db.get(Project, project_id)
        if project is not None:
            project.audio_filename = audio_path.name

    # --- Transcription ---
    report(_AUDIO_SHARE, "transcribing", f"Transcription (modèle {settings.whisper_model})")
    result = transcription.transcribe(
        audio_path,
        duration,
        on_progress=lambda ratio: report(
            _AUDIO_SHARE + int(ratio * _TRANSCRIBE_SHARE)
        ),
        should_cancel=cancelled,
    )
    if cancelled():
        raise JobCancelled()

    with session_scope() as db:
        project = db.get(Project, project_id)
        if project is None:
            raise FileNotFoundError(project_id)
        project.transcript_json = json.dumps(result, ensure_ascii=False)
        project.language = result.get("language")
        project.status = "analyzing"
        project.stage_detail = "Analyse IA de la transcription"

    if not (result.get("segments") or []):
        raise FFmpegError(
            "Aucune parole n'a été détectée dans cette vidéo. Vérifie que la "
            "piste audio contient bien du son."
        )

    # --- AI analysis ---
    report(_AUDIO_SHARE + _TRANSCRIBE_SHARE, "analyzing", "Analyse IA de la transcription")
    with session_scope() as db:
        user = db.get(User, user_id)
        try:
            api_key = decrypt_api_key(
                user_id, user.mistral_api_key_encrypted if user is not None else None
            )
        except SecretUnavailable as exc:
            raise ai.MistralNotConfigured(str(exc)) from exc
        model = user.mistral_model if user is not None else None

    use_heuristic = not ai.is_configured(api_key) and settings.allow_heuristic_fallback
    if use_heuristic:
        logger.warning("Account API key missing - using documented heuristic test mode")
        clips = ai.heuristic_clips(result, duration)
        source_label = "heuristic"
    else:
        if not model:
            raise ai.MistralNotConfigured(
                "Choisis un modèle Mistral dans les paramètres avant de lancer l’analyse IA."
            )
        clips = ai.analyse_transcript(
            result,
            duration,
            api_key=api_key or "",
            model=model,
        )
        source_label = "mistral"

    report(96, "analyzing", "Enregistrement des propositions")

    with session_scope() as db:
        project = db.get(Project, project_id)
        if project is None:
            raise FileNotFoundError(project_id)
        db.query(ClipSuggestion).filter(ClipSuggestion.project_id == project_id).delete()
        for clip in clips:
            db.add(
                ClipSuggestion(
                    project_id=project_id,
                    rank=clip.get("rank", 0),
                    start_seconds=clip["start_seconds"],
                    end_seconds=clip["end_seconds"],
                    score=clip["score"],
                    category=clip.get("category", ""),
                    title=clip.get("title", ""),
                    hook=clip.get("hook", ""),
                    reason=clip.get("reason", ""),
                    suggested_caption=clip.get("suggested_caption", ""),
                    hashtags_json=json.dumps(clip.get("hashtags", []), ensure_ascii=False),
                    score_breakdown_json=json.dumps(
                        clip.get("score_breakdown", {}), ensure_ascii=False
                    ),
                    source=clip.get("source", source_label),
                )
            )
        project.analysis_source = source_label
        project.analysis_error = None
        project.status = "completed"
        project.progress = 100
        project.stage_detail = f"{len(clips)} propositions prêtes"

    _finish_job(job_id)


# --- Stage 4: render the Short ---------------------------------------------

def _run_export_job(job_id: str, user_id: str, project_id: str, clip_id: str | None) -> None:
    if clip_id is None:  # pragma: no cover - guarded at enqueue time
        raise FFmpegError("Tâche d'export sans clip associe.")

    report = _progress_reporter(job_id)
    cancelled = _cancel_checker(job_id)

    with session_scope() as db:
        project = db.get(Project, project_id)
        clip = db.get(Clip, clip_id)
        if project is None or clip is None:
            raise FileNotFoundError(clip_id)
        source_name = project.source_filename
        transcript_raw = project.transcript_json
        params = {
            "start": clip.start_seconds,
            "end": clip.end_seconds,
            "style": clip.subtitle_style,
            "size": clip.subtitle_size,
            "position": clip.subtitle_position,
            "accent": clip.subtitle_accent,
            "subtitles_enabled": clip.subtitles_enabled,
            "export_width": clip.export_width,
            "export_height": clip.export_height,
            "font": clip.subtitle_font,
            "effect": clip.subtitle_effect,
            "speed": clip.playback_speed,
            "crop_x": clip.crop_x, "crop_y": clip.crop_y,
            "crop_zoom": clip.crop_zoom, "crop_rotation": clip.crop_rotation,
        }
        project.status = "rendering"
        project.progress = 0
        project.error_message = None
        clip.status = "rendering"
        clip.progress = 0
        clip.error_message = None

    folder = storage.project_dir(user_id, project_id)
    source = folder / (source_name or "")
    if not source_name or not source.exists():
        raise FileNotFoundError(str(source))

    target = storage.clip_dir(user_id, project_id, clip_id)

    # --- Subtitles ---
    report(0, "rendering", "Préparation des sous-titres")
    transcript = json.loads(transcript_raw) if transcript_raw else {"segments": []}
    cues = subtitles.build_cues(
        transcript.get("segments") or [], params["start"], params["end"]
    )

    srt_path = target / "subtitles.srt"
    srt_path.write_text(subtitles.build_srt(cues, 1 / params["speed"]), encoding="utf-8")

    ass_path: Path | None = None
    if params["subtitles_enabled"] and cues:
        ass_path = target / "subtitles.ass"
        ass_path.write_text(
            subtitles.build_ass(
                cues, params["style"], params["size"], params["position"], params["accent"],
                params["export_width"], params["export_height"], params["font"], params["effect"], 1 / params["speed"]
            ),
            encoding="utf-8-sig",
        )

    if cancelled():
        raise JobCancelled()

    # --- Encode ---
    report(5, "rendering", f"Encodage {params['export_width']}x{params['export_height']} H.264")
    output = target / "short.mp4"
    video.render_short(
        source,
        output,
        params["start"],
        params["end"],
        subtitle_file=ass_path,
        on_progress=lambda ratio: report(5 + int(ratio * 93)),
        should_cancel=cancelled,
        width=params["export_width"],
        height=params["export_height"],
        speed=params["speed"],
        crop_x=params["crop_x"], crop_y=params["crop_y"],
        zoom=params["crop_zoom"], rotation=params["crop_rotation"],
    )

    size_bytes = output.stat().st_size if output.exists() else 0
    clip_seconds = int(params["end"] - params["start"])

    with session_scope() as db:
        clip = db.get(Clip, clip_id)
        project = db.get(Project, project_id)
        if clip is not None:
            clip.status = "completed"
            clip.progress = 100
            clip.stage_detail = "Short prêt"
            clip.output_filename = output.name
            clip.srt_filename = srt_path.name
            clip.output_size_bytes = size_bytes
            clip.completed_at = utcnow()
        if project is not None:
            project.status = "completed"
            project.progress = 100
            project.stage_detail = "Short généré"
            user = project.user
            if user is not None:
                # Rough manual-editing equivalent: ~8x the clip length.
                user.seconds_saved += max(60, clip_seconds * 8)

    _finish_job(job_id)


# --- Job bookkeeping --------------------------------------------------------

def _finish_job(job_id: str) -> None:
    with session_scope() as db:
        job = db.get(Job, job_id)
        if job is None:
            return
        job.status = "completed"
        job.progress = 100
        job.stage = "completed"
        job.finished_at = utcnow()


def _fail_job(job_id: str, message: str, analysis_error: str | None = None) -> None:
    with session_scope() as db:
        job = db.get(Job, job_id)
        if job is None:
            return
        job.status = "failed"
        job.error_message = message
        job.stage = "failed"
        job.finished_at = utcnow()

        project = db.get(Project, job.project_id)
        if project is not None:
            project.status = "failed"
            project.error_message = message
            project.stage_detail = None
            if analysis_error:
                project.analysis_error = analysis_error
        if job.clip_id:
            clip = db.get(Clip, job.clip_id)
            if clip is not None:
                clip.status = "failed"
                clip.error_message = message


def _cancel_job(job_id: str) -> None:
    with session_scope() as db:
        job = db.get(Job, job_id)
        if job is None:
            return
        job.status = "cancelled"
        job.stage = "cancelled"
        job.finished_at = utcnow()

        project = db.get(Project, job.project_id)
        if project is not None:
            project.status = "cancelled"
            project.stage_detail = "Tâche annulée"
        if job.clip_id:
            clip = db.get(Clip, job.clip_id)
            if clip is not None:
                clip.status = "cancelled"
                clip.stage_detail = "Export annulé"


# --- Retention janitor ------------------------------------------------------

def _janitor_loop() -> None:
    from ..security import purge_expired_sessions

    interval = max(60, settings.cleanup_interval_minutes * 60)
    # Run once shortly after boot so a restarted server cleans up immediately.
    while not _stop.wait(timeout=20):
        try:
            with session_scope() as db:
                storage.purge_expired(db)
                purge_expired_sessions(db)
        except Exception:  # pragma: no cover
            logger.exception("Retention sweep failed")
        if _stop.wait(timeout=interval):
            break
