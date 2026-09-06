"""FFmpeg service.

Everything that touches pixels or audio goes through here. Design rules:

* Files are never loaded into memory - FFmpeg streams from and to disk.
* Every long-running call reports progress via `-progress pipe:1` and can be
  cancelled cooperatively between reads.
* The binary is resolved once: a system FFmpeg on PATH wins, otherwise the
  static binary shipped by `imageio-ffmpeg`, so the app runs out of the box.
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from ..config import settings

logger = logging.getLogger("fastclip.video")

# Windows: keep the console window hidden when spawning FFmpeg.
_CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


class FFmpegError(RuntimeError):
    """FFmpeg failed. The message is safe to show to a human."""


class JobCancelled(RuntimeError):
    """The user cancelled the job while FFmpeg was running."""


@dataclass(slots=True)
class MediaInfo:
    duration: float
    width: int
    height: int
    has_audio: bool
    video_codec: str = ""


def _resolve(binary: str) -> str | None:
    explicit = settings.ffmpeg_path if binary == "ffmpeg" else settings.ffprobe_path
    if explicit and Path(explicit).exists():
        return explicit

    found = shutil.which(binary)
    if found:
        return found

    if binary == "ffmpeg":
        try:
            import imageio_ffmpeg

            return imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:  # pragma: no cover - optional dependency
            return None
    return None


_FFMPEG = _resolve("ffmpeg")
_FFPROBE = _resolve("ffprobe")


def ffmpeg_available() -> bool:
    return _FFMPEG is not None


def ffmpeg_binary() -> str:
    if _FFMPEG is None:
        raise FFmpegError(
            "FFmpeg est introuvable. Installe FFmpeg ou le paquet Python "
            "imageio-ffmpeg, puis relance le serveur."
        )
    return _FFMPEG


def ffmpeg_version() -> str:
    if _FFMPEG is None:
        return "absent"
    try:
        out = subprocess.run(
            [_FFMPEG, "-version"],
            capture_output=True,
            text=True,
            timeout=15,
            creationflags=_CREATE_NO_WINDOW,
        )
        first = out.stdout.splitlines()[0] if out.stdout else ""
        return first.replace("ffmpeg version ", "").split(" ")[0] or "inconnue"
    except Exception:  # pragma: no cover
        return "inconnue"


# --- Probing ---------------------------------------------------------------

_DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)")
_VIDEO_RE = re.compile(r"Stream #\d+:\d+.*?: Video: (\w+).*?, (\d{2,5})x(\d{2,5})")
_AUDIO_RE = re.compile(r"Stream #\d+:\d+.*?: Audio: ")


def probe(path: Path) -> MediaInfo:
    """Read container metadata.

    Uses ffprobe when present; otherwise parses FFmpeg's own stderr banner,
    which is always available since we ship an FFmpeg binary.
    """
    if _FFPROBE:
        try:
            return _probe_with_ffprobe(path)
        except Exception as exc:  # pragma: no cover - falls through
            logger.warning("ffprobe failed (%s), falling back to ffmpeg banner", exc)
    return _probe_with_ffmpeg(path)


def _probe_with_ffprobe(path: Path) -> MediaInfo:
    result = subprocess.run(
        [
            _FFPROBE, "-v", "error", "-print_format", "json",
            "-show_format", "-show_streams", str(path),
        ],
        capture_output=True,
        text=True,
        timeout=60,
        creationflags=_CREATE_NO_WINDOW,
    )
    if result.returncode != 0:
        raise FFmpegError("Fichier vidéo illisible.")

    data = json.loads(result.stdout)
    duration = float(data.get("format", {}).get("duration") or 0.0)
    width = height = 0
    codec = ""
    has_audio = False
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video" and not width:
            width = int(stream.get("width") or 0)
            height = int(stream.get("height") or 0)
            codec = stream.get("codec_name") or ""
            if not duration:
                duration = float(stream.get("duration") or 0.0)
        elif stream.get("codec_type") == "audio":
            has_audio = True
    return MediaInfo(duration, width, height, has_audio, codec)


def _probe_with_ffmpeg(path: Path) -> MediaInfo:
    result = subprocess.run(
        [ffmpeg_binary(), "-hide_banner", "-i", str(path)],
        capture_output=True,
        text=True,
        timeout=120,
        creationflags=_CREATE_NO_WINDOW,
    )
    # `ffmpeg -i` with no output always exits non-zero; the banner is on stderr.
    stderr = result.stderr or ""

    duration = 0.0
    match = _DURATION_RE.search(stderr)
    if match:
        hours, minutes, seconds = match.groups()
        duration = int(hours) * 3600 + int(minutes) * 60 + float(seconds)

    width = height = 0
    codec = ""
    video_match = _VIDEO_RE.search(stderr)
    if video_match:
        codec, w, h = video_match.groups()
        width, height = int(w), int(h)

    if not width or duration <= 0:
        raise FFmpegError(
            "Impossible de lire cette vidéo. Vérifie qu'il s'agit bien d'un "
            "fichier MP4, MOV ou WebM valide."
        )

    return MediaInfo(duration, width, height, bool(_AUDIO_RE.search(stderr)), codec)


# --- Command runner with progress ------------------------------------------

_OUT_TIME_RE = re.compile(r"out_time_us=(\d+)")
_OUT_TIME_MS_RE = re.compile(r"out_time_ms=(\d+)")


def _run_with_progress(
    args: list[str],
    total_seconds: float,
    on_progress: Callable[[float], None] | None,
    should_cancel: Callable[[], bool] | None,
    cwd: Path | None = None,
) -> None:
    """Run FFmpeg, streaming `-progress` output to `on_progress` (0..1)."""
    command = [ffmpeg_binary(), "-hide_banner", "-nostdin", "-loglevel", "error",
               "-progress", "pipe:1", "-nostats", *args]

    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        cwd=str(cwd) if cwd else None,
        creationflags=_CREATE_NO_WINDOW,
    )

    cancelled = False
    try:
        assert process.stdout is not None
        for line in process.stdout:
            if should_cancel is not None and should_cancel():
                cancelled = True
                process.kill()
                break
            if on_progress is None or total_seconds <= 0:
                continue
            micros = _OUT_TIME_RE.search(line)
            if micros:
                on_progress(min(1.0, int(micros.group(1)) / 1_000_000 / total_seconds))
                continue
            millis = _OUT_TIME_MS_RE.search(line)
            if millis:
                on_progress(min(1.0, int(millis.group(1)) / 1_000_000 / total_seconds))
    finally:
        stderr = ""
        try:
            _, stderr = process.communicate(timeout=30)
        except subprocess.TimeoutExpired:  # pragma: no cover
            process.kill()
            _, stderr = process.communicate()

    if cancelled:
        raise JobCancelled("Tâche annulée.")

    if process.returncode != 0:
        detail = (stderr or "").strip().splitlines()
        tail = detail[-1] if detail else "erreur inconnue"
        logger.error("ffmpeg failed: %s", "\n".join(detail[-6:]))
        raise FFmpegError(f"FFmpeg a échoué : {tail}")


# --- Pipeline steps --------------------------------------------------------

def extract_audio(
    source: Path,
    destination: Path,
    duration: float,
    on_progress: Callable[[float], None] | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> None:
    """Mono 16 kHz PCM WAV - exactly what Whisper wants, nothing more."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    _run_with_progress(
        [
            "-y", "-i", str(source),
            "-vn", "-map", "0:a:0",
            "-ac", "1", "-ar", "16000",
            "-c:a", "pcm_s16le",
            "-threads", str(settings.ffmpeg_threads),
            str(destination),
        ],
        duration,
        on_progress,
        should_cancel,
    )


def generate_thumbnail(source: Path, destination: Path, at_second: float = 1.0) -> None:
    """Single 480px-wide JPEG poster frame."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            ffmpeg_binary(), "-hide_banner", "-loglevel", "error", "-nostdin",
            "-y", "-ss", f"{max(0.0, at_second):.3f}", "-i", str(source),
            "-frames:v", "1",
            "-vf", "scale=480:-2:flags=bilinear",
            "-q:v", "4",
            str(destination),
        ],
        capture_output=True,
        timeout=120,
        creationflags=_CREATE_NO_WINDOW,
    )


def build_export_filter(subtitle_file: str | None, width: int, height: int, speed: float = 1.0, crop_x: float = 0.0, crop_y: float = 0.0, zoom: float = 1.0, rotation: float = 0.0) -> str:
    """Centre-crop to the requested aspect ratio and scale, optionally burn subtitles.

    The crop expression is intentionally isolated: swapping it for a
    face-tracking crop later means changing this one function.
    """
    zoom = min(2.5, max(1.0, zoom))
    crop_x = min(1.0, max(-1.0, crop_x))
    crop_y = min(1.0, max(-1.0, crop_y))
    chain = [
        # Crop centre is adjustable over the source, then zoomed in safely.
        f"crop='min(iw,ih*{width}/{height})/{zoom:.3f}':'min(ih,iw*{height}/{width})/{zoom:.3f}':'(iw-ow)*{(crop_x + 1) / 2:.4f}':'(ih-oh)*{(crop_y + 1) / 2:.4f}'",
        f"scale={width}:{height}:flags=bicubic",
        *([f"rotate={rotation:.2f}*PI/180:fillcolor=black"] if abs(rotation) >= 0.01 else []),
        "setsar=1",
        f"setpts=PTS/{speed:.2f}",
    ]
    if subtitle_file:
        # Relative filename only - FFmpeg runs with cwd set to the clip folder,
        # which avoids Windows drive-letter escaping inside filtergraphs.
        chain.append(f"ass=filename={subtitle_file}")
    return ",".join(chain)


def render_short(
    source: Path,
    destination: Path,
    start: float,
    end: float,
    subtitle_file: Path | None = None,
    on_progress: Callable[[float], None] | None = None,
    should_cancel: Callable[[], bool] | None = None,
    width: int | None = None,
    height: int | None = None,
    speed: float = 1.0,
    crop_x: float = 0.0, crop_y: float = 0.0, zoom: float = 1.0, rotation: float = 0.0,
) -> None:
    """Cut, crop to the selected format, burn subtitles, encode H.264 + AAC."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    duration = max(0.1, end - start)
    width = width or settings.export_width
    height = height or settings.export_height
    speed = min(2.0, max(0.5, speed))

    # FFmpeg runs with cwd set to the clip folder (so the subtitle filter can
    # use a bare filename), which means the source must be absolute.
    source = source.resolve()
    workdir = destination.parent
    subtitle_name = None
    if subtitle_file is not None and subtitle_file.exists():
        subtitle_name = subtitle_file.name
        if subtitle_file.parent.resolve() != workdir.resolve():
            shutil.copy2(subtitle_file, workdir / subtitle_name)

    args = [
        "-y",
        # Fast seek before -i, then an accurate trim of the decoded stream.
        "-ss", f"{start:.3f}",
        "-t", f"{duration:.3f}",
        "-i", str(source),
        "-vf", build_export_filter(subtitle_name, width, height, speed, crop_x, crop_y, zoom, rotation),
        "-c:v", "libx264",
        "-preset", settings.export_preset,
        "-crf", str(settings.export_crf),
        "-profile:v", "high",
        "-level", "4.0",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-af", f"atempo={speed:.2f}",
        "-c:a", "aac",
        "-b:a", settings.export_audio_bitrate,
        "-ac", "2", "-ar", "44100",
        "-movflags", "+faststart",
        "-threads", str(settings.ffmpeg_threads),
        "-max_muxing_queue_size", "512",
        str(destination.name),
    ]
    _run_with_progress(args, duration, on_progress, should_cancel, cwd=workdir)
