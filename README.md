# Fastclip

**Transforme une vidéo longue en Shorts verticaux sous-titrés, en quelques minutes.**

Fastclip importe une vidéo, en extrait l'audio, la transcrit avec horodatages,
fait analyser la transcription par une IA, propose **exactement trois extraits**
à fort potentiel, puis laisse le créateur ajuster les limites et exporter un MP4
vertical 720 × 1280 avec sous-titres incrustés et un fichier `.srt`.

L'IA propose, explique et accélère. **La décision finale reste humaine.**

---

## Sommaire

- [Aperçu du flux](#aperçu-du-flux)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Variables d'environnement](#variables-denvironnement)
- [Lancement local](#lancement-local)
- [Structure du projet](#structure-du-projet)
- [Contraintes et choix d'architecture](#contraintes-et-choix-darchitecture)
- [Sécurité](#sécurité)
- [Limites connues](#limites-connues)
- [Déploiement sur une VM Google Cloud E2](#déploiement-sur-une-vm-google-cloud-e2)

---

## Aperçu du flux

```
Import  ─▶  Extraction audio  ─▶  Transcription  ─▶  Analyse IA  ─▶  Éditeur  ─▶  Export
(MP4/MOV     (mono 16 kHz,        (faster-whisper,   (Mistral,       (limites,   (FFmpeg :
 /WebM,       FFmpeg)              int8, CPU,         JSON strict,    styles,     découpe,
 ≤ 10 min,                         timestamps         3 extraits      légende)    9:16, sous-
 ≤ 250 Mo)                         mot à mot)         vérifiés)                   titres, H.264)
```

Statuts d'un projet : `Brouillon` · `Téléversement` · `En attente` · `Transcription`
· `Analyse IA` · `Génération du Short` · `Terminé` · `Échec` · `Annulé`.

---

## Prérequis

| Composant | Version | Note |
|---|---|---|
| Python | 3.11 – 3.13 | back-end FastAPI |
| Node.js | 18+ | front-end Vite |
| FFmpeg | 4.2+ avec `libx264`, `aac`, `libass` | **voir ci-dessous** |

### FFmpeg

Fastclip cherche FFmpeg dans cet ordre :

1. le chemin donné par `FFMPEG_PATH` ;
2. un `ffmpeg` présent dans le `PATH` ;
3. **le binaire statique fourni par le paquet Python `imageio-ffmpeg`**, installé
   automatiquement avec les dépendances.

Autrement dit, l'application fonctionne sans installation système de FFmpeg.
En production, un FFmpeg système récent reste préférable :

```bash
sudo apt-get update && sudo apt-get install -y ffmpeg
```

Le build utilisé doit inclure `libx264` (encodage H.264) et `libass`
(incrustation des sous-titres). Vérification rapide :

```bash
ffmpeg -encoders | grep libx264 && ffmpeg -filters | grep " ass "
```

---

## Installation

```bash
git clone <votre-remote> fastclip && cd fastclip
```

### Back-end

```bash
cd backend
python -m venv .venv
# Linux / macOS
source .venv/bin/activate
# Windows
.venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env
```

### Front-end

```bash
cd frontend
npm install
```

---

## Variables d'environnement

Toute la configuration vit dans `backend/.env`, qui **n'est jamais versionné**
(`.gitignore`). Le fichier `backend/.env.example` liste toutes les clés sans
aucune valeur secrète.

### À renseigner en priorité

| Variable | Défaut | Rôle |
|---|---|---|
| `MISTRAL_MODEL` | `mistral-large-latest` | Modèle d'analyse. |
| `SECRET_KEY` | *(auto)* | Générer en production : `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Si vide, une clé est générée et conservée dans `backend/data/.secret_key`. |
| `COOKIE_SECURE` | `false` | **À passer à `true` derrière HTTPS.** |
| `CORS_ORIGINS` | `http://localhost:5173,…` | Inutile si le front est servi par le même hôte (voir déploiement). |

### Transcription

| Variable | Défaut | Rôle |
|---|---|---|
| `WHISPER_MODEL` | `small` | `tiny`, `base`, `small`, `medium`, `large-v3`. `base` est un bon compromis sur 2 vCPU ; `tiny` pour un premier lancement rapide. |
| `WHISPER_DEVICE` | `cpu` | |
| `WHISPER_COMPUTE_TYPE` | `int8` | Quantification CPU. |
| `WHISPER_CPU_THREADS` | `2` | Aligné sur 2 vCPU. |
| `WHISPER_LANGUAGE` | *(vide)* | Vide = détection automatique. Forcer `fr` améliore nettement la qualité si le contenu est toujours francophone. |

### Limites, rétention, export

| Variable | Défaut |
|---|---|
| `MAX_UPLOAD_MB` | `250` |
| `MAX_DURATION_SECONDS` | `600` (10 min) |
| `MAX_STORAGE_PER_USER_MB` | `2048` |
| `ALLOWED_EXTENSIONS` | `.mp4,.mov,.webm` |
| `RETENTION_HOURS` | `24` |
| `CLEANUP_INTERVAL_MINUTES` | `15` |
| `EXPORT_WIDTH` / `EXPORT_HEIGHT` | `720` / `1280` |
| `EXPORT_CRF` / `EXPORT_PRESET` | `23` / `veryfast` |
| `FFMPEG_THREADS` | `2` |
| `RATE_LIMIT_UPLOADS_PER_HOUR` | `12` |
| `RATE_LIMIT_ANALYSES_PER_HOUR` | `30` |
| `RATE_LIMIT_EXPORTS_PER_HOUR` | `40` |

### Mode test interne (non-IA)

`FASTCLIP_ALLOW_HEURISTIC_FALLBACK=false` par défaut.

Quand un compte n'a pas encore connecté sa clé Mistral **et** que cette option vaut `true`, Fastclip
génère des propositions par une heuristique locale (densité de parole, rythme,
durée cible, autonomie). **Ce n'est pas de l'IA et ce n'est jamais présenté comme
telle :** chaque proposition porte `source = "heuristic"` et l'interface affiche
un badge « Mode test local (non-IA) » à la place du badge « Analyse IA ».
Réservé au développement et aux tests.

Sans clé et sans ce mode, le projet passe en `Échec` avec un message explicite :
l'application ne fabrique jamais de faux résultats d'IA.

---

## Lancement local

Deux terminaux.

**Terminal 1 — back-end**

```bash
cd backend
.venv/Scripts/activate      # Windows  (source .venv/bin/activate sur Linux/macOS)
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 — front-end**

```bash
cd frontend
npm run dev
```

Ouvre <http://localhost:5173>. Le serveur Vite proxifie `/api` vers le port 8000,
donc tout est en même origine et le cookie de session fonctionne sans CORS.

### Vérifier l'installation sans passer par l'interface

```bash
cd backend
python scripts/pipeline_check.py ../samples/mavideo.mp4
```

Ce script enchaîne sonde → extraction audio → transcription → sélection des
extraits → rendu d'un Short, et affiche les temps de chaque étape. Idéal pour
valider un déploiement.

Un échantillon de test peut être généré sous Windows :

```powershell
backend\scripts\make_sample.ps1
```

---

## Structure du projet

```
fastclip/
├─ backend/
│  ├─ app/
│  │  ├─ main.py             # entrée FastAPI, middlewares, service du front en prod
│  │  ├─ config.py           # toute la configuration, pilotée par .env
│  │  ├─ database.py         # SQLite + WAL, sessions
│  │  ├─ models.py           # User, Project, ClipSuggestion, Clip, Job, CaptionTemplate
│  │  ├─ schemas.py          # modèles de requête + sérialiseurs
│  │  ├─ security.py         # Argon2id, sessions opaques
│  │  ├─ deps.py             # dépendances FastAPI (auth, ownership)
│  │  ├─ responses.py        # streaming de fichiers avec HTTP Range
│  │  ├─ routers/
│  │  │  ├─ auth.py          # inscription, connexion, session, reset (stub)
│  │  │  ├─ account.py       # profil, avatar, mot de passe, données, suppression
│  │  │  ├─ projects.py      # import, cycle de vie, médias
│  │  │  ├─ clips.py         # création d'export, suivi, téléchargements
│  │  │  └─ system.py        # état, file d'attente, dashboard, modèles de sous-titres
│  │  └─ services/
│  │     ├─ video.py         # FFmpeg : sonde, audio, miniature, rendu 9:16
│  │     ├─ transcription.py # faster-whisper (CPU / int8)
│  │     ├─ ai.py            # Mistral + validation stricte + score expliqué
│  │     ├─ subtitles.py     # découpage en blocs, ASS (incrustation), SRT
│  │     ├─ queue.py         # file à un seul créneau + purge 24 h
│  │     ├─ storage.py       # arborescence, quotas, rétention
│  │     └─ ratelimit.py     # limite de débit en mémoire
│  ├─ scripts/
│  │  ├─ pipeline_check.py   # test de bout en bout hors API
│  │  └─ make_sample.ps1     # génère une vidéo de test (Windows)
│  ├─ requirements.txt
│  └─ .env.example
├─ frontend/
│  └─ src/
│     ├─ pages/              # Landing, Login, Register, ForgotPassword,
│     │                      # Dashboard, NewProject, Projects, ProjectDetail,
│     │                      # Editor, Templates, Help, Settings
│     ├─ components/         # AppShell, AuthLayout, Icon, ui, ScoreBreakdown,
│     │                      # SubtitlePreview
│     ├─ context/AppContext  # session + notifications
│     └─ lib/                # client API typé, formats, statuts, blocs de sous-titres
└─ .gitignore
```

### Base de données

SQLite en mode WAL, fichier `backend/data/fastclip.db`. Les tables sont créées au
démarrage. Pour repartir de zéro en développement : arrête le serveur et supprime
`backend/data/`.

---

## Contraintes et choix d'architecture

Fastclip est dimensionné pour une **`e2-standard-2` (2 vCPU / 8 Go)**.

| Décision | Raison |
|---|---|
| **Une seule tâche à la fois** | Un encodage FFmpeg et une transcription Whisper en parallèle sur 2 vCPU se ralentissent mutuellement. La file est persistée en base et affichée à l'utilisateur (position, étape, progression réelle). |
| **10 min / 250 Mo max** | Garde les temps de traitement prévisibles et la file courte. |
| **Audio mono 16 kHz avant transcription** | Format exact attendu par Whisper : moins de RAM, moins de CPU, aucune perte utile. |
| **`int8` sur CPU** | Quantification CTranslate2 : mémoire divisée, vitesse multipliée. |
| **Export 720 × 1280, CRF 23, preset `veryfast`** | Qualité suffisante pour les plateformes courtes, encodage rapide. |
| **Aucun fichier chargé en mémoire** | L'upload est écrit sur disque par blocs de 1 Mio ; la lecture se fait en streaming avec support des requêtes `Range`. |
| **Modèle Whisper chargé une seule fois** | Singleton de processus : un seul modèle résident, cohérent avec la file à un créneau. |
| **Suppression automatique après 24 h** | Un thread de maintenance efface sources et exports. Les projets restent visibles, marqués « fichiers supprimés ». |
| **Seule la transcription part à l'IA** | Ni la vidéo, ni l'audio ne quittent le serveur. |

### Extension prévue : recadrage intelligent

Le recadrage V1 est centré et **isolé dans une seule fonction**,
`build_vertical_filter()` dans `backend/app/services/video.py`. Ajouter un suivi
automatique du visage revient à remplacer l'expression `crop` par une expression
pilotée par des positions détectées, sans toucher au reste du pipeline.

---

## Sécurité

- **Mots de passe** hachés avec **Argon2id** (64 Mo, 2 passes, parallélisme 2).
- **Sessions** : jeton aléatoire opaque en cookie **HttpOnly**, `SameSite=Lax`,
  `Secure` en production. La base ne stocke que son empreinte SHA-256.
- **Validations serveur** sur chaque import : extension, taille (coupée pendant
  l'écriture), durée réelle mesurée par FFmpeg, présence d'une piste audio, quota
  de stockage.
- **Limites de débit** par utilisateur sur les imports, analyses et exports ;
  par adresse IP sur l'inscription, la connexion et la réinitialisation.
- **Cloisonnement** : chaque route média vérifie que le projet appartient bien à
  l'utilisateur connecté.
- **Clé Mistral par compte.** Elle est vérifiée avant enregistrement, chiffrée
  avec AES-GCM et liée à l'identifiant du compte. L'API ne renvoie qu'une version
  masquée et la clé n'est jamais placée dans un fichier de configuration.
- **`.gitignore`** exclut `.env`, `backend/data/`, les vidéos, les exports, la
  base locale et les `node_modules`.
- En-têtes `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.

---

## Limites connues

- **Réinitialisation de mot de passe** : pas d'infrastructure d'envoi d'email.
  La page existe et le dit explicitement ; c'est la prochaine évolution.
- **Détection de langue** : sur des voix de synthèse ou un audio bruité, les
  petits modèles Whisper peuvent se tromper de langue. Renseigner
  `WHISPER_LANGUAGE=fr` supprime le problème quand le contenu est connu.
- **Recadrage centré uniquement** : pas encore de suivi de visage (voir plus haut).
- **Limite de débit en mémoire** : suffisante pour un processus unique ; à
  déplacer vers Redis si Fastclip tourne sur plusieurs workers.
- **Sous-titres** : la police d'incrustation est Arial (présente sur Windows et
  sur la plupart des images Linux via `ttf-mscorefonts` ou une substitution
  fontconfig). Sur une image minimale, installer une police :
  `sudo apt-get install -y fonts-dejavu-core`.
- **Un seul worker** : c'est un choix, mais cela signifie qu'une transcription
  longue retarde les exports en attente. La file l'indique clairement.

---

## Déploiement sur une VM Google Cloud E2

Cible : `e2-standard-2` (2 vCPU, 8 Go), Debian 12, disque 30 Go.

### 1. Machine et dépendances

```bash
gcloud compute instances create fastclip \
  --machine-type=e2-standard-2 \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=30GB --tags=http-server,https-server

gcloud compute ssh fastclip
sudo apt-get update
sudo apt-get install -y python3-venv python3-pip ffmpeg nginx git fonts-dejavu-core
```

### 2. Application

```bash
sudo adduser --system --group --home /opt/fastclip fastclip
sudo -u fastclip git clone <votre-remote> /opt/fastclip/app
cd /opt/fastclip/app/backend
sudo -u fastclip python3 -m venv .venv
sudo -u fastclip .venv/bin/pip install -r requirements.txt
sudo -u fastclip cp .env.example .env
sudo -u fastclip nano .env      # SECRET_KEY, COOKIE_SECURE=true
```

### 3. Front-end servi par le même processus

```bash
cd /opt/fastclip/app/frontend
npm ci && npm run build
```

Quand `frontend/dist/` existe, le back-end le sert automatiquement : une seule
origine, pas de CORS, cookie `SameSite=Lax` sans réglage particulier.

### 4. Service systemd

```ini
# /etc/systemd/system/fastclip.service
[Unit]
Description=Fastclip
After=network.target

[Service]
User=fastclip
Group=fastclip
WorkingDirectory=/opt/fastclip/app/backend
ExecStart=/opt/fastclip/app/backend/.venv/bin/uvicorn app.main:app \
          --host 127.0.0.1 --port 8000 --workers 1
Restart=always
RestartSec=5
# Un seul worker : la file à un créneau vit dans le processus.
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now fastclip
```

> **Important :** garder `--workers 1`. Plusieurs workers signifieraient plusieurs
> files et plusieurs modèles Whisper résidents — exactement ce que la machine ne
> peut pas absorber.

### 5. Nginx

```nginx
server {
    listen 80;
    server_name fastclip.example.com;

    # Doit dépasser MAX_UPLOAD_MB.
    client_max_body_size 300M;
    client_body_timeout 300s;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_request_buffering off;   # streaming des uploads
    }
}
```

```bash
sudo certbot --nginx -d fastclip.example.com   # puis COOKIE_SECURE=true
sudo systemctl restart fastclip
```

### 6. Mémoire

Ajouter 2 Go de swap évite qu'un pic pendant le chargement d'un modèle
`medium` ne fasse tomber le service :

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 7. Sauvegarde

Seul `backend/data/fastclip.db` mérite une sauvegarde : les médias sont
volontairement éphémères (24 h).

```bash
sqlite3 /opt/fastclip/app/backend/data/fastclip.db ".backup '/var/backups/fastclip-$(date +%F).db'"
```
