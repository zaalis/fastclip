import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Icon } from '../components/Icon'
import { Alert, Button, Field, ProgressBar } from '../components/ui'
import { useAuth, useToast } from '../context/AppContext'
import { api } from '../lib/api'
import { formatBytes, formatDuration } from '../lib/format'

type Phase = 'idle' | 'checking' | 'ready' | 'uploading' | 'done'

interface Candidate {
  file: File
  duration: number
  previewUrl: string
}

/** Reads duration client-side so an oversized video is refused before upload. */
function inspect(file: File): Promise<{ duration: number; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const element = document.createElement('video')
    element.preload = 'metadata'
    element.muted = true

    const cleanup = () => {
      element.onloadedmetadata = null
      element.onerror = null
    }
    element.onloadedmetadata = () => {
      cleanup()
      resolve({ duration: element.duration || 0, previewUrl: url })
    }
    element.onerror = () => {
      cleanup()
      URL.revokeObjectURL(url)
      reject(new Error('Ce fichier ne peut pas être lu comme une vidéo.'))
    }
    element.src = url
  })
}

export default function NewProject() {
  const { status } = useAuth()
  const { notify, notifyError } = useToast()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('idle')
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const limits = status?.limits
  const maxMb = limits?.max_upload_mb ?? 250
  const maxSeconds = limits?.max_duration_seconds ?? 600
  const extensions = limits?.allowed_extensions ?? ['.mp4', '.mov', '.webm']

  useEffect(
    () => () => {
      if (candidate) URL.revokeObjectURL(candidate.previewUrl)
      abortRef.current?.abort()
    },
    [candidate],
  )

  const reset = useCallback(() => {
    if (candidate) URL.revokeObjectURL(candidate.previewUrl)
    setCandidate(null)
    setName('')
    setProgress(0)
    setError(null)
    setPhase('idle')
    if (inputRef.current) inputRef.current.value = ''
  }, [candidate])

  const accept = useCallback(
    async (file: File) => {
      setError(null)
      const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`

      if (!extensions.includes(extension)) {
        setError(
          `Format non supporté. Formats acceptés : ${extensions
            .map((value) => value.replace('.', '').toUpperCase())
            .join(', ')}.`,
        )
        return
      }
      if (file.size > maxMb * 1024 * 1024) {
        setError(
          `Fichier trop lourd (${formatBytes(file.size)}). Limite : ${maxMb} Mo.`,
        )
        return
      }

      setPhase('checking')
      try {
        const { duration, previewUrl } = await inspect(file)
        if (duration > maxSeconds + 0.5) {
          URL.revokeObjectURL(previewUrl)
          setError(
            `Vidéo trop longue (${formatDuration(duration)}). Limite : ${Math.round(
              maxSeconds / 60,
            )} minutes.`,
          )
          setPhase('idle')
          return
        }
        setCandidate({ file, duration, previewUrl })
        setName(file.name.replace(/\.[^.]+$/, '').slice(0, 140))
        setPhase('ready')
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Fichier illisible.')
        setPhase('idle')
      }
    },
    [extensions, maxMb, maxSeconds],
  )

  const upload = async () => {
    if (!candidate) return
    setPhase('uploading')
    setProgress(0)
    setError(null)
    abortRef.current = new AbortController()

    try {
      const { project } = await api.projects.upload(
        candidate.file,
        name.trim() || candidate.file.name,
        setProgress,
        abortRef.current.signal,
      )
      setPhase('done')
      notify('Vidéo importée. Le traitement démarre.')
      navigate(`/app/projets/${project.id}`)
    } catch (caught) {
      setPhase('ready')
      setProgress(0)
      setError(caught instanceof Error ? caught.message : 'Import impossible.')
      notifyError(caught, 'Import impossible.')
    }
  }

  const ffmpegMissing = status ? !status.ffmpeg.available : false

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="eyebrow">Nouveau projet</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-chalk sm:text-3xl">
          Importer une vidéo
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {maxSeconds / 60} minutes et {maxMb} Mo maximum. Ces limites gardent le
          traitement rapide sur une petite machine et evitent les files d’attente
          interminables.
        </p>
      </header>

      {ffmpegMissing && (
        <Alert tone="error" title="FFmpeg introuvable sur le serveur">
          L’import est désactivé. Installe FFmpeg (ou le paquet Python
          imageio-ffmpeg) puis relance le back-end.
        </Alert>
      )}

      {error && (
        <div role="alert">
          <Alert tone="error" title="Import refusé">
            {error}
          </Alert>
        </div>
      )}

      {phase === 'idle' || phase === 'checking' ? (
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const file = event.dataTransfer.files?.[0]
            if (file) void accept(file)
          }}
          className={`panel flex flex-col items-center px-6 py-14 text-center transition-colors duration-200
            ${dragging ? 'border-blue-500 bg-blue-500/8' : ''}`}
        >
          <span className="grid h-16 w-16 place-items-center rounded-2xl border border-ink-500 bg-ink-800 text-blue-400">
            <Icon name="upload" size={28} />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-chalk">
            {phase === 'checking' ? 'Lecture du fichier...' : 'Dépose ta vidéo ici'}
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Formats acceptés :{' '}
            {extensions.map((value) => value.replace('.', '').toUpperCase()).join(', ')}.
            Le fichier est vérifié avant l’envoi.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept={extensions.join(',')}
            className="sr-only"
            id="video-input"
            disabled={ffmpegMissing || phase === 'checking'}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void accept(file)
            }}
          />
          <Button
            className="mt-6"
            size="lg"
            icon="folder"
            loading={phase === 'checking'}
            disabled={ffmpegMissing}
            onClick={() => inputRef.current?.click()}
          >
            Choisir un fichier
          </Button>

          <dl className="mt-8 grid w-full max-w-lg grid-cols-3 gap-3 text-left">
            {[
              ['Durée max', `${maxSeconds / 60} min`],
              ['Poids max', `${maxMb} Mo`],
              ['Export', `${limits?.export.width ?? 720} x ${limits?.export.height ?? 1280}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-ink-500 bg-ink-800 p-3">
                <dt className="text-2xs uppercase tracking-wide text-muted">{label}</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-chalk">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        candidate && (
          <div className="panel overflow-hidden">
            <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,15rem)_1fr]">
              <video
                src={candidate.previewUrl}
                className="aspect-video w-full rounded-lg border border-ink-500 bg-ink-900 object-cover"
                muted
                playsInline
                preload="metadata"
                aria-label="Aperçu de la vidéo sélectionnée"
              />

              <div className="min-w-0">
                <Field
                  label="Nom du projet"
                  value={name}
                  maxLength={140}
                  disabled={phase === 'uploading'}
                  onChange={(event) => setName(event.target.value)}
                  hint="Modifiable à tout moment depuis la page du projet."
                />

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  {[
                    ['Fichier', candidate.file.name],
                    ['Durée', formatDuration(candidate.duration)],
                    ['Poids', formatBytes(candidate.file.size)],
                    ['Type', candidate.file.type || 'video'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="mt-0.5 truncate font-medium text-chalk" title={value}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            {phase === 'uploading' && (
              <div className="border-t border-ink-500 px-5 py-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-chalk">
                    <Icon name="upload" size={15} className="text-blue-400" />
                    Téléversement en cours
                  </span>
                  <span className="font-semibold tabular-nums text-chalk">{progress}%</span>
                </div>
                <div className="mt-2.5">
                  <ProgressBar value={progress} label="Téléversement" />
                </div>
                <p className="mt-2 text-xs text-muted">
                  Ne ferme pas cet onglet. Le traitement démarrera automatiquement une
                  fois le transfert termine.
                </p>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-ink-500 p-4">
              {phase === 'uploading' ? (
                <Button
                  variant="secondary"
                  icon="close"
                  onClick={() => {
                    abortRef.current?.abort()
                    setPhase('ready')
                    setProgress(0)
                  }}
                >
                  Annuler l’envoi
                </Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={reset}>
                    Changer de fichier
                  </Button>
                  <Button variant="accent" icon="bolt" onClick={upload} disabled={ffmpegMissing}>
                    Lancer le traitement
                  </Button>
                </>
              )}
            </div>
          </div>
        )
      )}

      <div className="panel-quiet flex gap-3 p-4">
        <Icon name="shield" size={18} className="mt-0.5 shrink-0 text-positive-500" />
        <p className="text-xs leading-relaxed text-muted">
          Ta vidéo est traitée sur le serveur Fastclip puis supprimée
          automatiquement après {limits?.retention_hours ?? 24} heures. Seule la
          transcription texte est envoyée au modèle d’analyse : le fichier vidéo ne
          quitte jamais le serveur.
        </p>
      </div>
    </div>
  )
}
