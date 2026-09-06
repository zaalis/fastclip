"""Offline smoke test for the Fastclip media pipeline.

Runs audio extraction -> transcription -> clip scoring -> render on a local
file, without the API or the database. Useful to verify a deployment:

    python scripts/pipeline_check.py ../samples/sample-talk.mp4
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import ai, subtitles, transcription, video  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python scripts/pipeline_check.py <video>")
        return 2

    source = Path(sys.argv[1]).resolve()
    if not source.exists():
        print(f"not found: {source}")
        return 2

    workdir = source.parent / "_pipeline_check"
    workdir.mkdir(exist_ok=True)

    print(f"[1/5] probe            {source.name}")
    info = video.probe(source)
    print(f"      {info.duration:.1f}s  {info.width}x{info.height}  audio={info.has_audio}")

    print("[2/5] extract audio    mono 16 kHz")
    started = time.time()
    audio = workdir / "audio.wav"
    video.extract_audio(source, audio, info.duration)
    print(f"      {audio.stat().st_size / 1024:.0f} KB in {time.time() - started:.1f}s")

    print("[3/5] transcribe       faster-whisper")
    started = time.time()
    result = transcription.transcribe(audio, info.duration)
    words = sum(len(s.get("words") or []) for s in result["segments"])
    print(
        f"      lang={result['language']}  segments={len(result['segments'])}  "
        f"words={words}  in {time.time() - started:.1f}s"
    )
    print(f"      preview: {result['text'][:110]}...")
    (workdir / "transcript.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("[4/5] select clips")
    # Account credentials never live in scripts or environment files.
    clips = ai.heuristic_clips(result, info.duration)
    print(f"      source=heuristic / NOT AI ({len(clips)} clips)")
    for clip in clips:
        print(
            f"      #{clip['rank'] + 1} {clip['start_seconds']:.1f}-"
            f"{clip['end_seconds']:.1f}s  score={clip['score']}  "
            f"{clip['score_breakdown']}"
        )

    print("[5/5] render short     720x1280 H.264 + burned subtitles")
    best = clips[0]
    cues = subtitles.build_cues(
        result["segments"], best["start_seconds"], best["end_seconds"]
    )
    print(f"      {len(cues)} caption cues")
    ass_path = workdir / "subtitles.ass"
    ass_path.write_text(subtitles.build_ass(cues, "punch", "medium", "bottom"),
                        encoding="utf-8-sig")
    (workdir / "subtitles.srt").write_text(subtitles.build_srt(cues), encoding="utf-8")

    started = time.time()
    output = workdir / "short.mp4"
    video.render_short(
        source, output, best["start_seconds"], best["end_seconds"], subtitle_file=ass_path
    )
    print(
        f"      {output.name}  {output.stat().st_size / 1024:.0f} KB "
        f"in {time.time() - started:.1f}s"
    )
    print(f"\nOK - artifacts in {workdir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
