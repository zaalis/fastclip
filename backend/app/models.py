"""SQLAlchemy models for Fastclip."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# --- Status vocabulary ------------------------------------------------------
# Mirrors the product spec 1:1. The UI maps these keys to French labels and
# always pairs colour with an icon + text label (never colour alone).
PROJECT_STATUSES = (
    "draft",         # Brouillon
    "uploading",     # Televersement (Téléversement)
    "queued",        # En attente
    "transcribing",  # Transcription
    "analyzing",     # Analyse IA
    "rendering",     # Generation du Short
    "completed",     # Termine
    "failed",        # Echec
    "cancelled",     # Annule
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(String(60), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # Encrypted at rest with a server-only key. The plaintext API key is never
    # returned by the API and never stored in a file or in the browser.
    mistral_api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The selected provider model belongs to this account, just like its key.
    mistral_model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Provider metadata only (never a secret). It avoids spending API calls each
    # time the settings page is opened while keeping the selector account-scoped.
    mistral_compatible_models_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    # Denormalised counter powering the "temps économisé" stat without a scan.
    seconds_saved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    projects: Mapped[list["Project"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    sessions: Mapped[list["SessionToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    caption_templates: Mapped[list["CaptionTemplate"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class SessionToken(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # sha256 of raw token
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    user: Mapped[User] = relationship(back_populates="sessions")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="draft", nullable=False)

    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    audio_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    thumbnail_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)

    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    width: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    height: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    language: Mapped[str | None] = mapped_column(String(12), nullable=True)
    transcript_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Provenance of the current suggestions: "mistral" (real AI) or "heuristic"
    # (documented internal test mode, always surfaced as such in the UI).
    analysis_source: Mapped[str | None] = mapped_column(String(24), nullable=True)
    analysis_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stage_detail: Mapped[str | None] = mapped_column(String(180), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )
    files_purged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)

    user: Mapped[User] = relationship(back_populates="projects")
    suggestions: Mapped[list["ClipSuggestion"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    clips: Mapped[list["Clip"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    jobs: Mapped[list["Job"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )

    def expires_at(self, retention_hours: int) -> datetime | None:
        if self.files_purged_at is not None:
            return None
        return self.created_at + timedelta(hours=retention_hours)


class ClipSuggestion(Base):
    __tablename__ = "clip_suggestions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    rank: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    start_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    end_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    category: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    title: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    hook: Mapped[str] = mapped_column(Text, default="", nullable=False)
    reason: Mapped[str] = mapped_column(Text, default="", nullable=False)
    suggested_caption: Mapped[str] = mapped_column(Text, default="", nullable=False)
    hashtags_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    # Transparency breakdown (extra #1): JSON dict of named sub-scores.
    score_breakdown_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    source: Mapped[str] = mapped_column(String(24), default="mistral", nullable=False)

    project: Mapped[Project] = relationship(back_populates="suggestions")


class Clip(Base):
    """A rendered (or rendering) Short."""

    __tablename__ = "clips"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    suggestion_id: Mapped[str | None] = mapped_column(String(32), nullable=True)

    title: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    caption: Mapped[str] = mapped_column(Text, default="", nullable=False)
    hashtags_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)

    start_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    end_seconds: Mapped[float] = mapped_column(Float, nullable=False)

    subtitle_style: Mapped[str] = mapped_column(String(24), default="clean", nullable=False)
    subtitle_size: Mapped[str] = mapped_column(String(16), default="medium", nullable=False)
    subtitle_position: Mapped[str] = mapped_column(String(16), default="bottom", nullable=False)
    subtitle_accent: Mapped[str] = mapped_column(String(9), default="#FF8A3D", nullable=False)
    subtitles_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    export_format: Mapped[str] = mapped_column(String(24), default="vertical_hd", nullable=False)
    export_width: Mapped[int] = mapped_column(Integer, default=1080, nullable=False)
    export_height: Mapped[int] = mapped_column(Integer, default=1920, nullable=False)
    subtitle_font: Mapped[str] = mapped_column(String(24), default="sans", nullable=False)
    subtitle_effect: Mapped[str] = mapped_column(String(24), default="none", nullable=False)
    playback_speed: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    crop_x: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    crop_y: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    crop_zoom: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    crop_rotation: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    status: Mapped[str] = mapped_column(String(24), default="queued", nullable=False)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stage_detail: Mapped[str | None] = mapped_column(String(180), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    output_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    srt_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    output_size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    project: Mapped[Project] = relationship(back_populates="clips")


class Job(Base):
    """Single-slot processing queue: exactly one job runs at a time."""

    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    clip_id: Mapped[str | None] = mapped_column(String(32), nullable=True)

    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # process | export
    status: Mapped[str] = mapped_column(String(16), default="queued", nullable=False)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stage: Mapped[str] = mapped_column(String(24), default="queued", nullable=False)
    stage_detail: Mapped[str | None] = mapped_column(String(180), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    project: Mapped[Project] = relationship(back_populates="jobs")


Index("ix_jobs_status_created", Job.status, Job.created_at)


class CaptionTemplate(Base):
    """Saved subtitle presets (extra #2)."""

    __tablename__ = "caption_templates"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    style: Mapped[str] = mapped_column(String(24), default="clean", nullable=False)
    size: Mapped[str] = mapped_column(String(16), default="medium", nullable=False)
    position: Mapped[str] = mapped_column(String(16), default="bottom", nullable=False)
    accent_color: Mapped[str] = mapped_column(String(9), default="#FF8A3D", nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    user: Mapped[User] = relationship(back_populates="caption_templates")
