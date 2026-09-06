"""Request models and response serializers."""
from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field

from .config import settings
from .models import Clip, ClipSuggestion, CaptionTemplate, Project, User


# --- Requests ---------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: str = Field(max_length=255)
    username: str = Field(max_length=60)
    password: str = Field(max_length=200)
    remember: bool = False


class LoginRequest(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=200)
    remember: bool = False


class PasswordResetRequest(BaseModel):
    email: str = Field(max_length=255)


class ProfileUpdateRequest(BaseModel):
    username: str | None = Field(default=None, max_length=60)
    email: str | None = Field(default=None, max_length=255)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(max_length=200)


class MistralApiKeyRequest(BaseModel):
    api_key: str = Field(min_length=20, max_length=512)


class MistralModelRequest(BaseModel):
    model: str = Field(min_length=1, max_length=128)


class AccountDeleteRequest(BaseModel):
    password: str = Field(max_length=200)


class ProjectRenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=140)


class ClipCreateRequest(BaseModel):
    suggestion_id: str | None = None
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(gt=0)
    title: str = Field(default="", max_length=200)
    caption: str = Field(default="", max_length=2000)
    hashtags: list[str] = Field(default_factory=list)
    subtitle_style: str = "clean"
    subtitle_size: str = "medium"
    subtitle_position: str = "bottom"
    subtitle_accent: str = Field(default="#FF8A3D", max_length=9)
    subtitles_enabled: bool = True
    export_format: str = "vertical_hd"
    subtitle_font: str = "sans"
    subtitle_effect: str = "none"
    playback_speed: float = Field(default=1.0, ge=0.5, le=2.0)
    crop_x: float = Field(default=0.0, ge=-1.0, le=1.0)
    crop_y: float = Field(default=0.0, ge=-1.0, le=1.0)
    crop_zoom: float = Field(default=1.0, ge=1.0, le=2.5)
    crop_rotation: float = Field(default=0.0, ge=-20.0, le=20.0)


class CaptionTemplateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    style: str = "clean"
    size: str = "medium"
    position: str = "bottom"
    accent_color: str = Field(default="#FF8A3D", max_length=9)
    is_default: bool = False


# --- Serializers ------------------------------------------------------------

def _loads(raw: str | None, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return fallback


def serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "avatar_url": f"/api/account/avatar/{user.id}" if user.avatar_filename else None,
        "created_at": user.created_at.isoformat() + "Z",
        "seconds_saved": user.seconds_saved,
    }


def serialize_suggestion(item: ClipSuggestion) -> dict:
    return {
        "id": item.id,
        "project_id": item.project_id,
        "rank": item.rank,
        "start_seconds": item.start_seconds,
        "end_seconds": item.end_seconds,
        "duration_seconds": round(item.end_seconds - item.start_seconds, 2),
        "score": item.score,
        "category": item.category,
        "title": item.title,
        "hook": item.hook,
        "reason": item.reason,
        "suggested_caption": item.suggested_caption,
        "hashtags": _loads(item.hashtags_json, []),
        "score_breakdown": _loads(item.score_breakdown_json, {}),
        "source": item.source,
    }


def serialize_clip(clip: Clip) -> dict:
    return {
        "id": clip.id,
        "project_id": clip.project_id,
        "suggestion_id": clip.suggestion_id,
        "title": clip.title,
        "caption": clip.caption,
        "hashtags": _loads(clip.hashtags_json, []),
        "start_seconds": clip.start_seconds,
        "end_seconds": clip.end_seconds,
        "duration_seconds": round(clip.end_seconds - clip.start_seconds, 2),
        "subtitle_style": clip.subtitle_style,
        "subtitle_size": clip.subtitle_size,
        "subtitle_position": clip.subtitle_position,
        "subtitle_accent": clip.subtitle_accent,
        "subtitles_enabled": clip.subtitles_enabled,
        "export_format": clip.export_format,
        "export_width": clip.export_width,
        "export_height": clip.export_height,
        "subtitle_font": clip.subtitle_font,
        "subtitle_effect": clip.subtitle_effect,
        "playback_speed": clip.playback_speed,
        "crop_x": clip.crop_x, "crop_y": clip.crop_y,
        "crop_zoom": clip.crop_zoom, "crop_rotation": clip.crop_rotation,
        "status": clip.status,
        "progress": clip.progress,
        "stage_detail": clip.stage_detail,
        "error_message": clip.error_message,
        "output_size_bytes": clip.output_size_bytes,
        "has_output": bool(clip.output_filename),
        "has_subtitles_file": bool(clip.srt_filename),
        "video_url": f"/api/clips/{clip.id}/video" if clip.output_filename else None,
        "download_url": f"/api/clips/{clip.id}/download" if clip.output_filename else None,
        "srt_url": f"/api/clips/{clip.id}/subtitles" if clip.srt_filename else None,
        "created_at": clip.created_at.isoformat() + "Z",
        "completed_at": (clip.completed_at.isoformat() + "Z") if clip.completed_at else None,
    }


def serialize_project(project: Project, *, include_relations: bool = False) -> dict:
    expires = project.expires_at(settings.retention_hours)
    data = {
        "id": project.id,
        "name": project.name,
        "status": project.status,
        "progress": project.progress,
        "stage_detail": project.stage_detail,
        "error_message": project.error_message,
        "analysis_source": project.analysis_source,
        "analysis_error": project.analysis_error,
        "original_filename": project.original_filename,
        "duration_seconds": project.duration_seconds,
        "size_bytes": project.size_bytes,
        "width": project.width,
        "height": project.height,
        "language": project.language,
        "created_at": project.created_at.isoformat() + "Z",
        "updated_at": project.updated_at.isoformat() + "Z",
        "expires_at": (expires.isoformat() + "Z") if expires else None,
        "files_purged": project.files_purged_at is not None,
        "thumbnail_url": (
            f"/api/projects/{project.id}/thumbnail" if project.thumbnail_filename else None
        ),
        "video_url": f"/api/projects/{project.id}/video" if project.source_filename else None,
        "clip_count": len([c for c in project.clips if c.status == "completed"]),
        "suggestion_count": len(project.suggestions),
    }
    if include_relations:
        data["suggestions"] = [
            serialize_suggestion(s)
            for s in sorted(project.suggestions, key=lambda s: (s.rank, -s.score))
        ]
        data["clips"] = [
            serialize_clip(c)
            for c in sorted(project.clips, key=lambda c: c.created_at, reverse=True)
        ]
    return data


def serialize_template(template: CaptionTemplate) -> dict:
    return {
        "id": template.id,
        "name": template.name,
        "style": template.style,
        "size": template.size,
        "position": template.position,
        "accent_color": template.accent_color,
        "is_default": template.is_default,
        "created_at": template.created_at.isoformat() + "Z",
    }
