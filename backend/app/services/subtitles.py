"""Subtitle generation: caption cues, ASS (burn-in) and SRT (download).

Word-level timestamps produce short, punchy cues. When a model only returns
segment-level timing we degrade gracefully to whole segments rather than
inventing word boundaries.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..config import settings

# --- Style catalogue --------------------------------------------------------
# Three styles, three sizes, three positions. Keys are stable API values; the
# frontend owns the French labels.

SUBTITLE_STYLES = ("clean", "punch", "accent", "minimal", "neon")
SUBTITLE_SIZES = ("small", "medium", "large")
SUBTITLE_POSITIONS = ("top", "middle", "bottom")
SUBTITLE_FONTS = {"sans": "DejaVu Sans", "bold": "DejaVu Sans", "serif": "DejaVu Serif", "mono": "DejaVu Sans Mono"}
SUBTITLE_EFFECTS = ("none", "shadow", "outline", "highlight")

_FONT_SIZES = {"small": 44, "medium": 56, "large": 70}
_ALIGNMENT = {"top": 8, "middle": 5, "bottom": 2}
_MARGIN_V = {"top": 130, "middle": 0, "bottom": 180}

MAX_WORDS_PER_CUE = 5
MAX_CUE_SECONDS = 2.6
MIN_CUE_SECONDS = 0.5
_BREAK_CHARS = ".!?,;:"


@dataclass(slots=True)
class Cue:
    start: float
    end: float
    text: str


def _hex_to_ass(color: str, alpha: str = "00") -> str:
    """#RRGGBB -> &HAABBGGRR (ASS stores BGR with a leading alpha byte)."""
    value = (color or "").lstrip("#")
    if len(value) != 6:
        value = "FF8A3D"
    r, g, b = value[0:2], value[2:4], value[4:6]
    return f"&H{alpha}{b}{g}{r}".upper()


def normalise_style(style: str | None) -> str:
    return style if style in SUBTITLE_STYLES else "clean"


def normalise_size(size: str | None) -> str:
    return size if size in SUBTITLE_SIZES else "medium"


def normalise_position(position: str | None) -> str:
    return position if position in SUBTITLE_POSITIONS else "bottom"


def normalise_font(font: str | None) -> str:
    return font if font in SUBTITLE_FONTS else "sans"


def normalise_effect(effect: str | None) -> str:
    return effect if effect in SUBTITLE_EFFECTS else "none"


# --- Cue building -----------------------------------------------------------

def build_cues(segments: list[dict], start: float, end: float) -> list[Cue]:
    """Extract cues for [start, end], rebased to 0 so they match the cut clip."""
    words: list[dict] = []
    for segment in segments:
        for word in segment.get("words") or []:
            w_start = float(word.get("start", 0.0))
            w_end = float(word.get("end", w_start))
            text = str(word.get("word", "")).strip()
            if text and w_end > start and w_start < end:
                words.append({"start": w_start, "end": w_end, "text": text})

    cues = _cues_from_words(words, start, end) if words else _cues_from_segments(
        segments, start, end
    )

    cleaned: list[Cue] = []
    for cue in cues:
        cue_start = max(0.0, cue.start - start)
        cue_end = min(end - start, cue.end - start)
        if cue_end - cue_start < 0.08 or not cue.text.strip():
            continue
        cleaned.append(Cue(cue_start, cue_end, cue.text.strip()))
    return cleaned


def _cues_from_words(words: list[dict], start: float, end: float) -> list[Cue]:
    cues: list[Cue] = []
    bucket: list[dict] = []

    def flush() -> None:
        if not bucket:
            return
        text = " ".join(w["text"] for w in bucket)
        cue_start = bucket[0]["start"]
        cue_end = max(bucket[-1]["end"], cue_start + MIN_CUE_SECONDS)
        cues.append(Cue(cue_start, cue_end, text))
        bucket.clear()

    for word in words:
        bucket.append(word)
        span = bucket[-1]["end"] - bucket[0]["start"]
        ends_clause = word["text"].rstrip().endswith(tuple(_BREAK_CHARS))
        if len(bucket) >= MAX_WORDS_PER_CUE or span >= MAX_CUE_SECONDS or ends_clause:
            flush()
    flush()

    # Never let a cue outlive the next one or the clip itself.
    for index, cue in enumerate(cues):
        upper = cues[index + 1].start if index + 1 < len(cues) else end
        cue.end = min(cue.end, upper, end)
        cue.start = max(cue.start, start)
    return [c for c in cues if c.end > c.start]


def _cues_from_segments(segments: list[dict], start: float, end: float) -> list[Cue]:
    cues: list[Cue] = []
    for segment in segments:
        s_start = float(segment.get("start", 0.0))
        s_end = float(segment.get("end", s_start))
        text = str(segment.get("text", "")).strip()
        if not text or s_end <= start or s_start >= end:
            continue
        cues.append(Cue(max(s_start, start), min(s_end, end), text))
    return cues


# --- ASS (burned into the video) -------------------------------------------

def _ass_timestamp(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    centis = int(round((secs - int(secs)) * 100))
    if centis == 100:  # rounding guard
        secs, centis = int(secs) + 1, 0
    return f"{int(hours)}:{int(minutes):02d}:{int(secs):02d}.{centis:02d}"


def _escape_ass(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("{", "(")
        .replace("}", ")")
        .replace("\n", "\\N")
    )


def _style_line(style: str, size: str, position: str, accent: str, font: str, effect: str) -> str:
    font_size = _FONT_SIZES[size]
    alignment = _ALIGNMENT[position]
    margin_v = _MARGIN_V[position]
    white = "&H00FFFFFF"
    black = "&H00000000"

    if style == "punch":
        # Heavy outline, strong shadow: reads on any footage.
        fields = ("Arial", font_size + 6, white, white, black, "&H80000000",
                  -1, 0, 0, 0, 100, 100, 0, 0, 1, 4.5, 2.0)
    elif style in ("accent", "neon"):
        # Opaque accent box behind the text (BorderStyle 3).
        fields = ("Arial", font_size, white, white, _hex_to_ass(accent),
                  _hex_to_ass(accent), -1, 0, 0, 0, 100, 100, 0, 0, 3, 2.4, 0.0)
    else:  # clean / minimal
        fields = ("Arial", font_size, white, white, black, "&HA0000000",
                  0, 0, 0, 0, 100, 100, 0, 0, 1, 2.0 if style == "clean" else 0.8, 1.2 if style == "clean" else 0.0)

    if effect == "shadow":
        fields = (*fields[:-1], max(float(fields[-1]), 3.0))
    elif effect == "outline":
        fields = (*fields[:-2], max(float(fields[-2]), 4.0), fields[-1])
    elif effect == "highlight":
        fields = (*fields[:14], 3, 2.4, 0.0)

    (_style_font, size_px, primary, secondary, outline_c, back_c, bold, italic,
     underline, strike, scale_x, scale_y, spacing, angle, border_style,
     outline, shadow) = fields

    return (
        f"Style: Fastclip,{SUBTITLE_FONTS[font]},{size_px},{primary},{secondary},{outline_c},{back_c},"
        f"{bold},{italic},{underline},{strike},{scale_x},{scale_y},{spacing},{angle},"
        f"{border_style},{outline},{shadow},{alignment},60,60,{margin_v},1"
    )


def build_ass(
    cues: list[Cue],
    style: str = "clean",
    size: str = "medium",
    position: str = "bottom",
    accent: str = "#FF8A3D",
    width: int | None = None,
    height: int | None = None,
    font: str = "sans",
    effect: str = "none",
    time_scale: float = 1.0,
) -> str:
    style = normalise_style(style)
    size = normalise_size(size)
    position = normalise_position(position)
    font = normalise_font(font)
    effect = normalise_effect(effect)

    header = [
        "[Script Info]",
        "ScriptType: v4.00+",
        # 0 = smart wrapping inside the margins. WrapStyle 2 disables
        # wrapping entirely, which lets a long cue run off both edges.
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: TV.601",
        f"PlayResX: {width or settings.export_width}",
        f"PlayResY: {height or settings.export_height}",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, "
        "ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, "
        "MarginL, MarginR, MarginV, Encoding",
        _style_line(style, size, position, accent, font, effect),
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    lines = list(header)
    for cue in cues:
        text = cue.text.upper() if style == "punch" else cue.text
        lines.append(
            f"Dialogue: 0,{_ass_timestamp(cue.start * time_scale)},{_ass_timestamp(cue.end * time_scale)},"
            f"Fastclip,,0,0,0,,{_escape_ass(text)}"
        )
    return "\n".join(lines) + "\n"


# --- SRT (downloadable sidecar) --------------------------------------------

def _srt_timestamp(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    millis = int(round((secs - int(secs)) * 1000))
    if millis == 1000:
        secs, millis = int(secs) + 1, 0
    return f"{int(hours):02d}:{int(minutes):02d}:{int(secs):02d},{millis:03d}"


def build_srt(cues: list[Cue], time_scale: float = 1.0) -> str:
    blocks = []
    for index, cue in enumerate(cues, start=1):
        blocks.append(
            f"{index}\n{_srt_timestamp(cue.start * time_scale)} --> {_srt_timestamp(cue.end * time_scale)}\n"
            f"{cue.text}\n"
        )
    return "\n".join(blocks)
