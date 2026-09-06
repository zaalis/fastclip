"""Range-aware file streaming.

The clip editor scrubs through the source video, so partial requests are not
optional: without `Accept-Ranges` a browser has to download the whole file
before it can seek. Files are streamed from disk in fixed-size chunks - a
250 MB source never lands in RAM.
"""
from __future__ import annotations

import re
from collections.abc import Iterator
from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

_RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")
CHUNK_SIZE = 512 * 1024


def _iter_file(path: Path, start: int, end: int) -> Iterator[bytes]:
    remaining = end - start + 1
    with path.open("rb") as handle:
        handle.seek(start)
        while remaining > 0:
            chunk = handle.read(min(CHUNK_SIZE, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def range_file_response(
    request: Request,
    path: Path,
    media_type: str,
    *,
    filename: str | None = None,
    download: bool = False,
    missing_detail: str = "Fichier introuvable.",
):
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail=missing_detail)

    file_size = path.stat().st_size
    disposition = "attachment" if download else "inline"
    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=0, must-revalidate",
    }
    if filename:
        headers["Content-Disposition"] = f'{disposition}; filename="{filename}"'

    range_header = request.headers.get("range")
    if not range_header:
        if download:
            return FileResponse(path, media_type=media_type, headers=headers)
        return StreamingResponse(
            _iter_file(path, 0, file_size - 1),
            media_type=media_type,
            headers={**headers, "Content-Length": str(file_size)},
        )

    match = _RANGE_RE.match(range_header.strip())
    if not match:
        raise HTTPException(status_code=416, detail="Plage de lecture invalide.")

    raw_start, raw_end = match.groups()
    if raw_start:
        start = int(raw_start)
        end = int(raw_end) if raw_end else file_size - 1
    else:  # suffix range: last N bytes
        length = int(raw_end or 0)
        start = max(0, file_size - length)
        end = file_size - 1

    if start >= file_size or start > end:
        raise HTTPException(
            status_code=416,
            detail="Plage de lecture invalide.",
            headers={"Content-Range": f"bytes */{file_size}"},
        )
    end = min(end, file_size - 1)

    return StreamingResponse(
        _iter_file(path, start, end),
        status_code=206,
        media_type=media_type,
        headers={
            **headers,
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(end - start + 1),
        },
    )
