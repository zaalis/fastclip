"""Mistral analysis service.

Only the transcript and its timestamps leave the machine - never the video,
never the audio. The model must answer with strict JSON containing exactly
three clip proposals, and every proposal is validated against the real
transcript before it reaches the user, so a hallucinated timestamp cannot slip
through.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from ..config import settings

logger = logging.getLogger("fastclip.ai")

TARGET_MIN_SECONDS = 20.0
TARGET_MAX_SECONDS = 60.0
REQUIRED_CLIPS = 3
_MAX_TRANSCRIPT_CHARS = 44_000


class MistralNotConfigured(RuntimeError):
    """No API key. The UI must say so plainly rather than fake a result."""


class MistralError(RuntimeError):
    """The call failed or returned something unusable."""


SYSTEM_PROMPT = """Tu es un monteur expert en contenu court (Shorts, Reels, TikTok).
On te donne la transcription horodatée d'une vidéo longue.
Ta mission : repérer les TROIS meilleurs extraits courts à fort potentiel.

Règles imperatives :
- Durée de chaque extrait : entre 20 et 60 secondes.
- Chaque extrait doit exister réellement dans la transcription fournie.
- N'inventé jamais un passage, une phrase ou un horodatage absent.
- Utilise uniquement des horodatages presents dans la plage de la transcription.
- Evite les silences prolongés et les extraits sans contexte.
- Privilégie : accroche rapide, idée claire, émotion, punchline, conseil concret,
  conclusion forte.
- Ajoute quelques secondes de contexte avant ou après si l'extrait en a besoin.
- Donne un score sur 100 et une justification transparente et concrète.
- Écris tous les textes en français, sauf si la transcription est dans une autre
  langue : dans ce cas, ecris dans la langue de la transcription.

Réponds UNIQUEMENT avec un objet JSON strict, sans texte autour, au format :
{
  "clips": [
    {
      "start_seconds": 102.4,
      "end_seconds": 139.8,
      "score": 92,
      "category": "Conseil utile",
      "title": "L'erreur qui bloque la progression",
      "hook": "Le début doit retenir l'attention immédiatement.",
      "reason": "Le passage est autonome, clair, énergique et apporte une réponse concrète.",
      "suggested_caption": "L'erreur qui fait perdre du temps à presque tout le monde.",
      "hashtags": ["#conseil", "#créateur", "#shorts"]
    }
  ]
}
Le tableau "clips" doit contenir exactement 3 éléments, triés du meilleur au moins bon."""


def is_configured(api_key: str | None) -> bool:
    return bool(api_key and api_key.strip())


def engine_info(api_key: str | None, model: str | None = None) -> dict[str, Any]:
    return {
        "configured": is_configured(api_key) and bool(model),
        "model": model if is_configured(api_key) and model else None,
        "heuristic_fallback": settings.allow_heuristic_fallback,
    }


def available_models(api_key: str) -> list[str]:
    """Return the chat models the provider exposes to this exact credential."""
    try:
        response = httpx.get(
            f"{settings.mistral_base_url.rstrip('/')}/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=min(settings.mistral_timeout_seconds, 20),
        )
    except httpx.TimeoutException as exc:
        raise MistralError(
            "Mistral ne répond pas pour le moment. Réessaie dans quelques instants."
        ) from exc
    except httpx.HTTPError as exc:
        raise MistralError(
            "Impossible de vérifier la clé auprès de Mistral. Vérifie ta connexion."
        ) from exc

    if response.status_code == 401:
        raise MistralError("Cette clé API Mistral n’est pas valide.")
    if response.status_code == 403:
        raise MistralError("Cette clé ne permet pas d’accéder aux modèles Mistral.")
    if response.status_code == 429:
        raise MistralError("Mistral refuse temporairement la vérification. Réessaie plus tard.")
    if response.status_code >= 400:
        raise MistralError(
            f"Mistral n’a pas pu vérifier la clé (erreur {response.status_code})."
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise MistralError("Mistral a renvoyé une liste de modèles illisible.") from exc

    items = payload.get("data", []) if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        raise MistralError("Mistral a renvoyé une liste de modèles inattendue.")

    models: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id")
        capabilities = item.get("capabilities")
        if not isinstance(model_id, str) or not model_id or len(model_id) > 128:
            continue
        if isinstance(capabilities, dict) and capabilities.get("completion_chat") is False:
            continue
        models.append(model_id)

    # Mistral may expose aliases and dated versions for the same model. Keep a
    # deterministic, de-duplicated provider order for the settings selector.
    return list(dict.fromkeys(models))


def preferred_model(models: list[str]) -> str | None:
    """Choose a sensible provider default only when an explicit fallback is needed."""
    priorities = (
        "mistral-small-latest",
        "mistral-medium-latest",
        "mistral-large-latest",
        settings.mistral_model,
    )
    for candidate in priorities:
        if candidate in models:
            return candidate
    return models[0] if models else None


def verify_api_key(api_key: str) -> list[str]:
    """Validate a credential and return Mistral's advertised chat models."""
    models = available_models(api_key)
    if not models:
        raise MistralError(
            "Cette clé est valide, mais Mistral ne renvoie aucun modèle de conversation."
        )
    return models


def verify_model_access(api_key: str, model: str) -> None:
    """Validate one user-selected model without triggering a rate-limit burst."""
    try:
        response = httpx.post(
            f"{settings.mistral_base_url.rstrip('/')}/chat/completions",
            json={
                "model": model,
                "messages": [{"role": "user", "content": "OK"}],
                "max_tokens": 1,
                "temperature": 0,
            },
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=min(settings.mistral_timeout_seconds, 20),
        )
    except httpx.TimeoutException as exc:
        raise MistralError(
            "Mistral met trop de temps à vérifier ce modèle. Réessaie dans un instant."
        ) from exc
    except httpx.HTTPError as exc:
        raise MistralError("Impossible de vérifier ce modèle auprès de Mistral.") from exc

    if response.status_code == 200:
        return
    if response.status_code == 401:
        raise MistralError("Cette clé API Mistral n’est pas valide.")
    if response.status_code == 403:
        raise MistralError(
            "Ce modèle n’est pas inclus dans l’abonnement associé à cette clé."
        )
    if response.status_code == 429:
        raise MistralError("Mistral limite temporairement la vérification. Réessaie dans un instant.")
    raise MistralError(
        f"Mistral n’a pas pu vérifier ce modèle (erreur {response.status_code})."
    )


# --- Transcript packaging ---------------------------------------------------

def build_transcript_text(segments: list[dict]) -> str:
    """Compact `[mm:ss.s -> mm:ss.s] text` lines: cheap in tokens, precise in time."""
    lines: list[str] = []
    for segment in segments:
        text = (segment.get("text") or "").strip()
        if not text:
            continue
        lines.append(
            f"[{float(segment['start']):.1f} -> {float(segment['end']):.1f}] {text}"
        )
    joined = "\n".join(lines)
    if len(joined) > _MAX_TRANSCRIPT_CHARS:
        # A 10-minute cap makes this rare; truncating the tail beats a 413.
        joined = joined[:_MAX_TRANSCRIPT_CHARS] + "\n[... transcription tronquee ...]"
    return joined


# --- Public entry point -----------------------------------------------------

def analyse_transcript(
    transcript: dict, duration: float, *, api_key: str, model: str
) -> list[dict[str, Any]]:
    """Ask Mistral for three clips and return validated proposals."""
    if not is_configured(api_key):
        raise MistralNotConfigured(
            "Ajoute ta clé API Mistral dans les paramètres pour lancer l’analyse IA."
        )

    segments = transcript.get("segments") or []
    if not segments:
        raise MistralError(
            "La transcription est vide : aucune parole détectée dans cette vidéo."
        )

    payload_text = build_transcript_text(segments)
    raw = _call_mistral(payload_text, duration, api_key=api_key, model=model)
    clips = _validate_clips(raw, segments, duration)
    for clip in clips:
        clip["source"] = "mistral"
    return clips


def _call_mistral(
    transcript_text: str, duration: float, *, api_key: str, model: str
) -> Any:
    user_prompt = (
        f"Durée totale de la vidéo : {duration:.1f} secondes.\n"
        f"Transcription horodatée (secondes) :\n\n{transcript_text}"
    )
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
    }

    try:
        response = httpx.post(
            f"{settings.mistral_base_url.rstrip('/')}/chat/completions",
            json=body,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=settings.mistral_timeout_seconds,
        )
    except httpx.TimeoutException as exc:
        raise MistralError(
            "L'analyse IA a dépassé le temps imparti. Relance la tâche."
        ) from exc
    except httpx.HTTPError as exc:
        raise MistralError(
            "Impossible de joindre l'API Mistral. Vérifie la connexion du serveur."
        ) from exc

    if response.status_code == 401:
        raise MistralError("Ta clé Mistral a été refusée. Mets-la à jour dans les paramètres.")
    if response.status_code == 429:
        raise MistralError("Quota Mistral atteint (429). Réessaie dans un moment.")
    if response.status_code >= 400:
        logger.error("Mistral %s: %s", response.status_code, response.text[:500])
        raise MistralError(
            f"L'API Mistral a répondu avec une erreur {response.status_code}."
        )

    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as exc:
        raise MistralError("Réponse inattendue de l'API Mistral.") from exc

    return _parse_json_payload(content)


def _parse_json_payload(content: str) -> Any:
    content = (content or "").strip()
    if content.startswith("```"):
        content = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", content).strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError as exc:
                raise MistralError(
                    "L'IA n'a pas renvoyé un JSON exploitable."
                ) from exc
        raise MistralError("L'IA n'a pas renvoyé un JSON exploitable.")


# --- Validation against the real transcript --------------------------------

def _validate_clips(raw: Any, segments: list[dict], duration: float) -> list[dict]:
    if isinstance(raw, list):
        raw = {"clips": raw}
    if not isinstance(raw, dict):
        raise MistralError("L'IA n'a pas renvoyé un objet JSON.")

    items = raw.get("clips")
    if not isinstance(items, list) or not items:
        raise MistralError("L'IA n'a proposé aucun extrait exploitable.")

    speech_start = min(float(s["start"]) for s in segments)
    speech_end = max(float(s["end"]) for s in segments)
    upper_bound = min(duration, speech_end) if duration > 0 else speech_end

    validated: list[dict] = []
    for index, item in enumerate(items):
        clip = _validate_one(item, segments, speech_start, upper_bound, index)
        if clip is not None:
            validated.append(clip)

    if not validated:
        raise MistralError(
            "Les extraits proposes ne correspondent a aucun passage de la "
            "transcription. Relance l'analyse."
        )

    validated.sort(key=lambda c: c["score"], reverse=True)
    validated = _deduplicate(validated)

    # The contract is exactly three. If the model gave fewer usable ones, fill
    # the remaining slots from the transcript itself and label them as such.
    if len(validated) < REQUIRED_CLIPS:
        for extra in _fallback_windows(segments, speech_start, upper_bound):
            if len(validated) >= REQUIRED_CLIPS:
                break
            if not _overlaps_any(extra, validated):
                validated.append(extra)
        validated.sort(key=lambda c: c["score"], reverse=True)

    for rank, clip in enumerate(validated[:REQUIRED_CLIPS]):
        clip["rank"] = rank
        clip["score_breakdown"] = compute_breakdown(clip, segments)
    return validated[:REQUIRED_CLIPS]


def _validate_one(
    item: Any, segments: list[dict], lower: float, upper: float, index: int
) -> dict | None:
    if not isinstance(item, dict):
        return None
    try:
        start = float(item.get("start_seconds"))
        end = float(item.get("end_seconds"))
    except (TypeError, ValueError):
        return None
    if not (end > start):
        return None

    # Clamp inside the transcript, then snap to real speech boundaries so the
    # clip never starts mid-word.
    start = max(lower, min(start, upper))
    end = max(lower, min(end, upper))
    start, end = _snap_to_segments(start, end, segments)
    start, end = _enforce_duration(start, end, lower, upper)

    if end - start < 5.0:
        return None
    if not _has_speech(start, end, segments):
        return None

    hashtags = item.get("hashtags")
    if not isinstance(hashtags, list):
        hashtags = []
    hashtags = [
        ("#" + str(tag).lstrip("#").strip()).lower()
        for tag in hashtags[:6]
        if str(tag).strip()
    ]

    try:
        score = int(round(float(item.get("score", 0))))
    except (TypeError, ValueError):
        score = 0

    return {
        "start_seconds": round(start, 2),
        "end_seconds": round(end, 2),
        "score": max(0, min(100, score)),
        "category": str(item.get("category") or "Extrait").strip()[:80],
        "title": str(item.get("title") or f"Extrait {index + 1}").strip()[:200],
        "hook": str(item.get("hook") or "").strip()[:600],
        "reason": str(item.get("reason") or "").strip()[:1200],
        "suggested_caption": str(item.get("suggested_caption") or "").strip()[:600],
        "hashtags": hashtags,
        "source": "mistral",
    }


def _snap_to_segments(start: float, end: float, segments: list[dict]) -> tuple[float, float]:
    """Pull the boundaries onto the nearest segment edges (max 2.5 s of drift)."""
    starts = [float(s["start"]) for s in segments]
    ends = [float(s["end"]) for s in segments]

    nearest_start = min(starts, key=lambda v: abs(v - start))
    if abs(nearest_start - start) <= 2.5:
        start = nearest_start
    nearest_end = min(ends, key=lambda v: abs(v - end))
    if abs(nearest_end - end) <= 2.5:
        end = nearest_end
    return start, end


def _enforce_duration(
    start: float, end: float, lower: float, upper: float
) -> tuple[float, float]:
    span = end - start
    if span < TARGET_MIN_SECONDS:
        missing = TARGET_MIN_SECONDS - span
        start = max(lower, start - missing / 2)
        end = min(upper, start + TARGET_MIN_SECONDS)
        if end - start < TARGET_MIN_SECONDS:
            start = max(lower, end - TARGET_MIN_SECONDS)
    elif span > TARGET_MAX_SECONDS:
        end = start + TARGET_MAX_SECONDS
    return round(start, 2), round(min(end, upper), 2)


def _has_speech(start: float, end: float, segments: list[dict]) -> bool:
    spoken = sum(
        max(0.0, min(end, float(s["end"])) - max(start, float(s["start"])))
        for s in segments
        if (s.get("text") or "").strip()
    )
    # At least a third of the window must actually contain speech.
    return spoken >= (end - start) * 0.33


def _overlaps_any(candidate: dict, existing: list[dict]) -> bool:
    for clip in existing:
        overlap = min(candidate["end_seconds"], clip["end_seconds"]) - max(
            candidate["start_seconds"], clip["start_seconds"]
        )
        if overlap > 0.4 * (candidate["end_seconds"] - candidate["start_seconds"]):
            return True
    return False


def _deduplicate(clips: list[dict]) -> list[dict]:
    kept: list[dict] = []
    for clip in clips:
        if not _overlaps_any(clip, kept):
            kept.append(clip)
    return kept


# --- Score transparency (computed by Fastclip, not by the model) -----------

def compute_breakdown(clip: dict, segments: list[dict]) -> dict[str, int]:
    """Deterministic, measurable sub-scores shown next to the model's score.

    These are Fastclip's own measurements of the selected window. The UI labels
    them as such so they are never mistaken for the model's reasoning.
    """
    start, end = clip["start_seconds"], clip["end_seconds"]
    span = max(0.1, end - start)

    window_words: list[dict] = []
    spoken = 0.0
    for segment in segments:
        s_start, s_end = float(segment["start"]), float(segment["end"])
        if s_end <= start or s_start >= end:
            continue
        spoken += min(end, s_end) - max(start, s_start)
        for word in segment.get("words") or []:
            if float(word.get("end", 0)) > start and float(word.get("start", 0)) < end:
                window_words.append(word)

    # 1. Density: share of the window that actually contains speech.
    density = int(round(min(1.0, spoken / span) * 100))

    # 2. Rhythm: words per second, normalised against a 2.6 wps sweet spot.
    if window_words:
        wps = len(window_words) / span
    else:
        text_chars = sum(
            len((s.get("text") or ""))
            for s in segments
            if float(s["end"]) > start and float(s["start"]) < end
        )
        wps = (text_chars / 5.5) / span
    rhythm = int(round(max(0.0, min(1.0, wps / 2.6)) * 100))

    # 3. Format fit: how close the duration is to the 20-60 s sweet spot.
    if TARGET_MIN_SECONDS <= span <= TARGET_MAX_SECONDS:
        fit = 100
    else:
        distance = (
            TARGET_MIN_SECONDS - span if span < TARGET_MIN_SECONDS
            else span - TARGET_MAX_SECONDS
        )
        fit = int(round(max(0.0, 100 - distance * 4)))

    # 4. Autonomy: does the window start and end on a real segment boundary?
    starts = {round(float(s["start"]), 1) for s in segments}
    ends = {round(float(s["end"]), 1) for s in segments}
    autonomy = 40 + (30 if round(start, 1) in starts else 0) + (
        30 if round(end, 1) in ends else 0
    )

    return {
        "densite": max(0, min(100, density)),
        "rythme": max(0, min(100, rhythm)),
        "format": max(0, min(100, fit)),
        "autonomie": max(0, min(100, autonomy)),
    }


# --- Documented internal test mode (NOT AI) --------------------------------

def heuristic_clips(transcript: dict, duration: float) -> list[dict[str, Any]]:
    """Pure-Python window scoring used only when FASTCLIP_ALLOW_HEURISTIC=true.

    This is NOT artificial intelligence and never claims to be: every clip it
    returns carries `source = "heuristic"`, and the UI renders those with an
    explicit "mode test local" badge instead of the AI badge.
    """
    segments = transcript.get("segments") or []
    if not segments:
        raise MistralError("La transcription est vide : aucune parole détectée.")

    lower = min(float(s["start"]) for s in segments)
    upper = min(duration, max(float(s["end"]) for s in segments))

    candidates = _fallback_windows(segments, lower, upper, limit=12)
    kept = _deduplicate(candidates)[:REQUIRED_CLIPS]
    for rank, clip in enumerate(kept):
        clip["rank"] = rank
        clip["source"] = "heuristic"
        clip["score_breakdown"] = compute_breakdown(clip, segments)
    return kept


def _fallback_windows(
    segments: list[dict], lower: float, upper: float, limit: int = 6
) -> list[dict]:
    """Slide a 35 s window over the transcript and rank by measurable density."""
    window = 35.0
    step = 5.0
    results: list[dict] = []

    position = lower
    while position + TARGET_MIN_SECONDS <= upper:
        start, end = position, min(position + window, upper)
        if end - start >= TARGET_MIN_SECONDS and _has_speech(start, end, segments):
            snapped_start, snapped_end = _snap_to_segments(start, end, segments)
            snapped_start, snapped_end = _enforce_duration(
                snapped_start, snapped_end, lower, upper
            )
            breakdown = compute_breakdown(
                {"start_seconds": snapped_start, "end_seconds": snapped_end}, segments
            )
            score = int(
                round(
                    breakdown["densite"] * 0.35
                    + breakdown["rythme"] * 0.3
                    + breakdown["format"] * 0.2
                    + breakdown["autonomie"] * 0.15
                )
            )
            text = " ".join(
                (s.get("text") or "").strip()
                for s in segments
                if float(s["end"]) > snapped_start and float(s["start"]) < snapped_end
            ).strip()
            results.append(
                {
                    "start_seconds": snapped_start,
                    "end_seconds": snapped_end,
                    "score": score,
                    "category": "Segment dense",
                    "title": (text[:70] + "...") if len(text) > 70 else (text or "Extrait"),
                    "hook": "",
                    "reason": (
                        "Sélection locale sans IA : fenêtre choisie sur la densité de "
                        "parole, le rythme et la durée cible."
                    ),
                    "suggested_caption": "",
                    "hashtags": [],
                    "source": "heuristic",
                    "score_breakdown": breakdown,
                }
            )
        position += step

    results.sort(key=lambda c: c["score"], reverse=True)
    return results[:limit]
