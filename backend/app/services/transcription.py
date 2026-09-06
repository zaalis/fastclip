"""Transcription via faster-whisper (CTranslate2), tuned for CPU.

The model is loaded lazily and kept as a process-wide singleton: on a 2 vCPU /
8 GB VM we can afford exactly one resident model, and the single-slot job queue
guarantees only one transcription runs at a time.
"""
from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any

from ..config import settings

logger = logging.getLogger("fastclip.transcription")

_model: Any = None
_model_lock = threading.Lock()
_model_key: tuple[str, str, str] | None = None


class TranscriptionUnavailable(RuntimeError):
    """faster-whisper is not installed. Message is safe to show to a human."""


def is_available() -> bool:
    try:
        import faster_whisper  # noqa: F401

        return True
    except Exception:
        return False


def engine_info() -> dict[str, Any]:
    return {
        "available": is_available(),
        "model": settings.whisper_model,
        "device": settings.whisper_device,
        "compute_type": settings.whisper_compute_type,
        "loaded": _model is not None,
    }


def _get_model():
    global _model, _model_key
    key = (settings.whisper_model, settings.whisper_device, settings.whisper_compute_type)

    with _model_lock:
        if _model is not None and _model_key == key:
            return _model
        try:
            from faster_whisper import WhisperModel
        except Exception as exc:  # pragma: no cover - optional dependency
            raise TranscriptionUnavailable(
                "Le moteur de transcription faster-whisper n'est pas installe. "
                "Lance `pip install -r requirements.txt` dans backend/."
            ) from exc

        logger.info(
            "Loading Whisper model %s (%s / %s)",
            settings.whisper_model, settings.whisper_device, settings.whisper_compute_type,
        )
        _model = WhisperModel(
            settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
            cpu_threads=settings.whisper_cpu_threads,
            num_workers=1,
        )
        _model_key = key
        return _model


def transcribe(
    audio_path: Path,
    duration: float,
    on_progress: Callable[[float], None] | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> dict[str, Any]:
    """Return {language, duration, text, segments[{start,end,text,words[]}]}."""
    model = _get_model()

    language = settings.whisper_language.strip() or None
    segments_iter, info = model.transcribe(
        str(audio_path),
        language=language,
        beam_size=settings.whisper_beam_size,
        vad_filter=True,                      # skip long silences: faster + cleaner
        vad_parameters={"min_silence_duration_ms": 500},
        word_timestamps=True,                 # needed for punchy caption cues
        condition_on_previous_text=False,     # avoids runaway repetition on CPU
    )

    total = float(getattr(info, "duration", 0.0) or duration or 0.0)
    segments: list[dict[str, Any]] = []
    full_text: list[str] = []

    # faster-whisper yields lazily: this loop is where the work actually happens,
    # which is exactly where cancellation and progress belong.
    for index, segment in enumerate(segments_iter):
        if should_cancel is not None and should_cancel():
            from .video import JobCancelled

            raise JobCancelled("Transcription annulée.")

        words = [
            {
                "start": round(float(word.start), 3),
                "end": round(float(word.end), 3),
                "word": word.word.strip(),
            }
            for word in (segment.words or [])
            if word.start is not None and word.end is not None
        ]
        text = (segment.text or "").strip()
        segments.append(
            {
                "id": index,
                "start": round(float(segment.start), 3),
                "end": round(float(segment.end), 3),
                "text": text,
                "words": words,
            }
        )
        if text:
            full_text.append(text)

        if on_progress is not None and total > 0:
            on_progress(min(1.0, float(segment.end) / total))

    if on_progress is not None:
        on_progress(1.0)

    return {
        "language": getattr(info, "language", None) or language or "und",
        "language_probability": round(float(getattr(info, "language_probability", 0.0) or 0.0), 3),
        "duration": round(total or duration, 3),
        "text": " ".join(full_text).strip(),
        "segments": segments,
    }
