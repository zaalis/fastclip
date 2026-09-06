# Fastclip

**Turn long videos into captioned vertical clips in minutes.**

Fastclip imports a video, extracts its audio, creates a timestamped transcript, analyses that transcript with AI, proposes exactly three high-potential clips, and lets the creator refine each selection before exporting a vertical MP4 with burned-in captions and an `.srt` file.

AI suggests, explains, and speeds up the workflow. **The final decision always stays with the creator.**

## Contents

- [Workflow](#workflow)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [Architecture decisions](#architecture-decisions)
- [Security](#security)
- [Known limitations](#known-limitations)
- [Google Cloud VM deployment](#google-cloud-vm-deployment)

## Workflow

```
Upload → Audio extraction → Transcription → AI analysis → Editor → Export
(MP4/MOV/WebM)  (FFmpeg)        (faster-whisper)  (Mistral)  (captions)  (H.264 MP4 + SRT)
```

Projects progress through `Draft`, `Uploading`, `Queued`, `Transcribing`, `Analysing`, `Rendering`, `Completed`, `Failed`, or `Cancelled`.

## Requirements

| Component | Version | Purpose |
|---|---:|---|
| Python | 3.11 – 3.13 | FastAPI backend |
| Node.js | 18+ | Vite frontend build |
| FFmpeg | 4.2+ with `libx264`, `aac`, and `libass` | Media processing and captions |

Fastclip finds FFmpeg from `FFMPEG_PATH`, then the system `PATH`, then the static binary shipped by `imageio-ffmpeg`. A system FFmpeg is recommended in production:

```bash
sudo apt-get update && sudo apt-get install -y ffmpeg
ffmpeg -encoders | grep libx264
ffmpeg -filters | grep ' ass '
```

## Installation

```bash
git clone https://github.com/zaalis/fastclip.git fastclip
cd fastclip
```

### Backend

```bash
cd backend
python -m venv .venv
# Linux / macOS
source .venv/bin/activate
# Windows PowerShell
.venv\Scripts\Activate.ps1

pip install -r requirements.txt
cp .env.example .env
```

### Frontend

```bash
cd frontend
npm install
```

## Environment variables

Runtime configuration belongs in `backend/.env`, which is never committed. `backend/.env.example` documents every setting without containing a real secret.

| Variable | Default | Purpose |
|---|---|---|
| `MISTRAL_MODEL` | `mistral-large-latest` | Mistral model used for analysis. |
| `SECRET_KEY` | generated automatically | Generate a production key with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. If empty, Fastclip persists one in `backend/data/.secret_key`. |
| `COOKIE_SECURE` | `false` | Set to `true` only when the site is available through HTTPS. |
| `WHISPER_MODEL` | `small` | `tiny`, `base`, `small`, `medium`, or `large-v3`. Use `base` on a 4-GB VM. |
| `WHISPER_DEVICE` | `cpu` | CPU or a supported accelerator. |
| `WHISPER_COMPUTE_TYPE` | `int8` | Efficient CPU quantization. |
| `MAX_UPLOAD_MB` | `250` | Per-upload limit. |
| `RETENTION_HOURS` | `24` | Source and export retention period. |
| `EXPORT_WIDTH` / `EXPORT_HEIGHT` | `720` / `1280` | Default export dimensions. |

`FASTCLIP_ALLOW_HEURISTIC_FALLBACK=false` by default. When enabled without a connected Mistral key, Fastclip creates explicitly labeled local heuristic suggestions for development only. It never presents those results as AI output.

## Local development

Run the backend and frontend in separate terminals:

```bash
# Terminal 1
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2
cd frontend
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to port 8000, keeping development requests same-origin.

### Pipeline verification

```bash
cd backend
python scripts/pipeline_check.py ../samples/your-video.mp4
```

The script runs probing, audio extraction, transcription, clip selection, and an export, then reports timing for every stage. On Windows, a sample video can be created with:

```powershell
backend\scripts\make_sample.ps1
```

## Project structure

```
fastclip/
├─ backend/
│  ├─ app/
│  │  ├─ main.py             # FastAPI entry point and production frontend serving
│  │  ├─ config.py           # Environment-driven configuration
│  │  ├─ database.py         # SQLite + WAL setup
│  │  ├─ models.py           # Users, projects, clips, jobs, and templates
│  │  ├─ security.py         # Argon2id passwords and opaque sessions
│  │  ├─ routers/            # Auth, account, project, clip, and system endpoints
│  │  └─ services/           # Video, transcription, AI, captions, queue, and storage
│  ├─ scripts/
│  ├─ requirements.txt
│  └─ .env.example
├─ frontend/
│  └─ src/                   # React pages, components, context, and API client
└─ README.md
```

SQLite uses WAL mode at `backend/data/fastclip.db`. Do not delete `backend/data/` in production: it holds user data, project records, encrypted AI keys, and the generated session secret.

## Architecture decisions

Fastclip is designed for a small 2-vCPU VM.

| Decision | Reason |
|---|---|
| One processing job at a time | Prevents FFmpeg and Whisper from competing for limited CPU and memory. The persistent queue exposes real position, stage, and progress. |
| 10-minute / 250-MB uploads | Keeps processing time and queue length predictable. |
| Mono 16-kHz audio | Matches Whisper input and reduces memory use. |
| CPU `int8` inference | Keeps transcription practical on a small VM. |
| 720 × 1280, CRF 23, `veryfast` | Produces platform-ready clips with reasonable encoding time. |
| Streaming media | Avoids loading complete uploads into memory. |
| One resident Whisper model | Avoids duplicated model memory. |
| 24-hour retention | Sources and exports are automatically removed; project records remain visible. |
| Transcript-only AI requests | Video and audio never leave the Fastclip server. |

The V1 crop is centered and isolated in `build_vertical_filter()` in `backend/app/services/video.py`, so face tracking can be added later without changing the rest of the pipeline.

## Security

- Passwords use **Argon2id**.
- Sessions use random opaque `HttpOnly`, `SameSite=Lax` cookies; the database stores only token hashes.
- The server validates extension, streamed size, real duration, audio availability, and per-user storage quota.
- Every media route verifies project ownership.
- Each Mistral key is verified, AES-GCM encrypted, and only returned masked.
- `.gitignore` excludes secrets, local data, videos, exports, databases, and dependencies.
- Responses include `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` headers.

## Known limitations

- Password reset email delivery is not implemented yet.
- V1 uses a centered crop; face tracking is not included yet.
- In-memory rate limiting is for a single process; use Redis when scaling horizontally.
- One worker means a long transcription delays queued exports.
- Install `fonts-dejavu-core` on minimal Linux hosts for subtitle fonts.

## Google Cloud VM deployment

Fastclip runs in production as one FastAPI process behind Nginx. When `frontend/dist` exists, FastAPI serves it directly, so requests and session cookies remain same-origin.

### 1. Install dependencies

```bash
sudo apt-get update
sudo apt-get install -y python3-venv python3-pip ffmpeg nginx git nodejs npm fonts-dejavu-core
```

### 2. Install Fastclip

```bash
sudo adduser --system --group --home /opt/fastclip fastclip
sudo -u fastclip git clone https://github.com/zaalis/fastclip.git /opt/fastclip/app

cd /opt/fastclip/app/backend
sudo -u fastclip python3 -m venv .venv
sudo -u fastclip .venv/bin/pip install -r requirements.txt

cd /opt/fastclip/app/frontend
sudo -u fastclip npm install
sudo -u fastclip npm run build
```

Create `/opt/fastclip/app/backend/.env` with `ENVIRONMENT=production`. Use `WHISPER_MODEL=base` on a 4-GB VM. Set `COOKIE_SECURE=true` only after HTTPS is configured.

### 3. Create the service

Create `/etc/systemd/system/fastclip.service`:

```ini
[Unit]
Description=Fastclip video clip generator
After=network-online.target
Wants=network-online.target

[Service]
User=fastclip
Group=fastclip
WorkingDirectory=/opt/fastclip/app/backend
Environment=PYTHONUNBUFFERED=1
ExecStart=/opt/fastclip/app/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fastclip
```

Keep `--workers 1`: additional workers create additional queues and Whisper models in memory.

### 4. Configure Nginx

```nginx
server {
    listen 80;
    server_name fastclip.example.com;
    client_max_body_size 300M;
    client_body_timeout 300s;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_request_buffering off;
    }
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Enable HTTPS and back up data

After a domain points to the VM:

```bash
sudo certbot --nginx -d fastclip.example.com
```

Set `COOKIE_SECURE=true` in `backend/.env`, then restart Fastclip. Back up `backend/data/fastclip.db`; uploaded media and generated exports are deliberately temporary.
