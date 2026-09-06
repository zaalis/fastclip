"""SQLite engine + session factory.

WAL journaling keeps the API responsive while the single video worker writes
progress updates from its own thread.
"""
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False, "timeout": 30},
    pool_pre_ping=True,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _record):  # pragma: no cover - driver hook
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    """FastAPI dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Standalone session for worker threads and scheduled jobs."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    from . import models  # noqa: F401  (registers mappers)

    Base.metadata.create_all(bind=engine)
    # This project intentionally stays migration-tool free. Keep existing local
    # databases compatible when account-scoped secrets are introduced.
    columns = {column["name"] for column in inspect(engine).get_columns("users")}
    if "mistral_api_key_encrypted" not in columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE users ADD COLUMN mistral_api_key_encrypted TEXT")
            )
    if "mistral_model" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN mistral_model VARCHAR(128)"))
    if "mistral_compatible_models_json" not in columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE users ADD COLUMN mistral_compatible_models_json TEXT")
            )
    clip_columns = {column["name"] for column in inspect(engine).get_columns("clips")}
    with engine.begin() as connection:
        if "export_format" not in clip_columns:
            connection.execute(text("ALTER TABLE clips ADD COLUMN export_format VARCHAR(24) NOT NULL DEFAULT 'vertical_hd'"))
        if "export_width" not in clip_columns:
            connection.execute(text("ALTER TABLE clips ADD COLUMN export_width INTEGER NOT NULL DEFAULT 1080"))
        if "export_height" not in clip_columns:
            connection.execute(text("ALTER TABLE clips ADD COLUMN export_height INTEGER NOT NULL DEFAULT 1920"))
    project_columns = {column["name"] for column in inspect(engine).get_columns("projects")}
    if "deleted_at" not in project_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE projects ADD COLUMN deleted_at DATETIME"))
    with engine.begin() as connection:
        if "subtitle_font" not in clip_columns:
            connection.execute(text("ALTER TABLE clips ADD COLUMN subtitle_font VARCHAR(24) NOT NULL DEFAULT 'sans'"))
        if "subtitle_effect" not in clip_columns:
            connection.execute(text("ALTER TABLE clips ADD COLUMN subtitle_effect VARCHAR(24) NOT NULL DEFAULT 'none'"))
        if "playback_speed" not in clip_columns:
            connection.execute(text("ALTER TABLE clips ADD COLUMN playback_speed FLOAT NOT NULL DEFAULT 1.0"))
        for name, default in (("crop_x", "0.0"), ("crop_y", "0.0"), ("crop_zoom", "1.0"), ("crop_rotation", "0.0")):
            if name not in clip_columns:
                connection.execute(text(f"ALTER TABLE clips ADD COLUMN {name} FLOAT NOT NULL DEFAULT {default}"))
