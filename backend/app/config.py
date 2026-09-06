"""Central configuration for Fastclip.

Every tunable lives here and is driven by environment variables so the same
codebase runs on a laptop and on a small e2-standard-2 VM without edits.
Secrets are read from the environment only - never hardcoded, never shipped
to the browser.
"""
from __future__ import annotations

import os
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Application ---
    app_name: str = "Fastclip"
    environment: str = "development"
    secret_key: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    # --- Storage & database ---
    data_dir: str = str(BACKEND_DIR / "data")
    database_url: str = ""

    # --- Upload limits (kept low on purpose: 2 vCPU / 8 GB target) ---
    max_upload_mb: int = 250
    max_duration_seconds: int = 600  # 10 minutes
    max_storage_per_user_mb: int = 2048
    allowed_extensions: str = ".mp4,.mov,.webm"
    upload_chunk_bytes: int = 1024 * 1024  # stream to disk 1 MiB at a time

    # --- Retention ---
    retention_hours: int = 24
    cleanup_interval_minutes: int = 15

    # --- Export profile ---
    export_width: int = 720
    export_height: int = 1280
    export_crf: int = 23
    export_preset: str = "veryfast"
    export_audio_bitrate: str = "128k"
    ffmpeg_threads: int = 2  # matches 2 vCPU

    # --- Transcription (faster-whisper, CPU/int8) ---
    whisper_model: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    whisper_beam_size: int = 1
    whisper_cpu_threads: int = 2
    whisper_language: str = ""  # empty = auto-detect

    # --- Mistral ---
    # API keys are account-scoped and encrypted in the database. Only provider
    # settings remain global.
    mistral_model: str = "mistral-large-latest"
    mistral_base_url: str = "https://api.mistral.ai/v1"
    mistral_timeout_seconds: int = 120

    # --- Internal test mode -------------------------------------------------
    # Produces heuristic (NON-AI) clip suggestions so the pipeline can be
    # exercised without a Mistral key. Results are always tagged
    # `source = "heuristic"` and the UI labels them as such: they are never
    # presented as AI output. Off by default.
    allow_heuristic_fallback: bool = Field(
        default=False,
        validation_alias=AliasChoices(
            "FASTCLIP_ALLOW_HEURISTIC_FALLBACK", "ALLOW_HEURISTIC_FALLBACK"
        ),
    )

    # --- Binaries ---
    ffmpeg_path: str = ""
    ffprobe_path: str = ""

    # --- Rate limits (per user) ---
    rate_limit_uploads_per_hour: int = 12
    rate_limit_analyses_per_hour: int = 30
    rate_limit_exports_per_hour: int = 40

    # --- Sessions ---
    session_days: int = 1
    session_days_remember: int = 30

    @property
    def data_path(self) -> Path:
        return Path(self.data_dir)

    @property
    def storage_path(self) -> Path:
        return self.data_path / "storage"

    @property
    def avatar_path(self) -> Path:
        return self.data_path / "avatars"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_extension_list(self) -> list[str]:
        return [e.strip().lower() for e in self.allowed_extensions.split(",") if e.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

@lru_cache
def get_settings() -> Settings:
    settings = Settings()

    if not settings.secret_key:
        # Persist a generated key so sessions survive a restart in dev.
        key_file = Path(settings.data_dir) / ".secret_key"
        key_file.parent.mkdir(parents=True, exist_ok=True)
        if key_file.exists():
            settings.secret_key = key_file.read_text(encoding="utf-8").strip()
        else:
            settings.secret_key = secrets.token_urlsafe(48)
            key_file.write_text(settings.secret_key, encoding="utf-8")

    if not settings.database_url:
        db_file = Path(settings.data_dir) / "fastclip.db"
        db_file.parent.mkdir(parents=True, exist_ok=True)
        settings.database_url = f"sqlite:///{db_file.as_posix()}"

    settings.storage_path.mkdir(parents=True, exist_ok=True)
    settings.avatar_path.mkdir(parents=True, exist_ok=True)
    return settings


settings = get_settings()
