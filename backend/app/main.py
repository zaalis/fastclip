"""Fastclip API entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import init_db
from .routers import account, auth, clips, projects, system
from .services import queue, video

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("fastclip")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    queue.recover_orphans()
    queue.start_workers()

    logger.info("Fastclip API ready")
    logger.info("  FFmpeg        : %s", video.ffmpeg_version())
    logger.info(
        "  Transcription : faster-whisper %s (%s/%s)",
        settings.whisper_model, settings.whisper_device, settings.whisper_compute_type,
    )
    logger.info("  Mistral       : clés chiffrées et liées aux comptes (%s)", settings.mistral_model)
    if settings.allow_heuristic_fallback:
        logger.warning(
            "  Mode test local actif : suggestions heuristiques NON-IA, "
            "explicitement signalées dans l'interface."
        )
    yield
    queue.stop_workers()


app = FastAPI(
    title="Fastclip API",
    version="1.0.0",
    description="Transforme une vidéo longue en Shorts verticaux sous-titres.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


@app.exception_handler(413)
async def payload_too_large(_request: Request, exc):  # pragma: no cover
    return JSONResponse(
        status_code=413,
        content={"detail": getattr(exc, "detail", "Fichier trop lourd.")},
    )


app.include_router(auth.router)
app.include_router(account.router)
app.include_router(projects.router)
app.include_router(clips.router)
app.include_router(system.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.app_name}


# --- Optional single-origin deployment -------------------------------------
# If the built frontend is present, serve it from the same origin. That is the
# recommended production layout on a single E2 VM: one process, no CORS,
# SameSite=Lax cookies that just work.
_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if _FRONTEND_DIST.is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=_FRONTEND_DIST / "assets"),
        name="assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Route inconnue."})
        candidate = _FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_FRONTEND_DIST / "index.html")
