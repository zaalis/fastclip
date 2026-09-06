import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Icon } from '../components/Icon'
import { ScoreBreakdown } from '../components/ScoreBreakdown'
import {
  Alert,
  Button,
  IconButton,
  Modal,
  ProgressBar,
  Skeleton,
  StatusBadge,
} from '../components/ui'
import { useAuth, useToast } from '../context/AppContext'
import { api, type Clip, type Project, type Suggestion } from '../lib/api'
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatExpiry,
  formatPrecise,
  languageLabel,
} from '../lib/format'
import { statusMeta } from '../lib/status'

function SourceBadge({ source }: { source: 'mistral' | 'heuristic' }) {
  if (source === 'mistral') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-2xs font-medium text-blue-400">
        <Icon name="sparkle" size={10} />
        Analyse IA
      </span>
    )
  }
  // Never dressed up as AI: this is the documented local test mode.
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-ink-400 bg-ink-600 px-2 py-0.5 text-2xs font-medium text-muted">
      <Icon name="gauge" size={10} />
      Mode test local (non-IA)
    </span>
  )
}

function SuggestionCard({
  suggestion,
  isBest,
  projectId,
}: {
  suggestion: Suggestion
  isBest: boolean
  projectId: string
}) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)

  return (
    <article
      className={`panel flex flex-col p-5 transition-colors duration-150
        ${isBest ? 'border-flame-500/50 shadow-glow' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isBest && (
              <span className="inline-flex items-center gap-1 rounded-full bg-flame-500 px-2 py-0.5 text-2xs font-semibold text-ink-900">
                <Icon name="bolt" size={10} />
                Meilleur score
              </span>
            )}
            <SourceBadge source={suggestion.source} />
          </div>
          <p className="mt-2.5 text-2xs font-medium uppercase tracking-wide text-muted">
            {suggestion.category}
          </p>
          <h3 className="mt-1 text-base font-semibold leading-snug text-chalk">
            {suggestion.title}
          </h3>
        </div>

        <div className="shrink-0 text-right">
          <p
            className={`text-3xl font-extrabold leading-none tabular-nums ${
              isBest ? 'text-flame-500' : 'text-blue-400'
            }`}
          >
            {suggestion.score}
          </p>
          <p className="text-2xs text-muted">/ 100</p>
        </div>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-muted">
        <span className="inline-flex items-center gap-1">
          <Icon name="scissors" size={11} />
          {formatPrecise(suggestion.start_seconds)} - {formatPrecise(suggestion.end_seconds)}
        </span>
        <span aria-hidden="true">&middot;</span>
        <span>{Math.round(suggestion.duration_seconds)} s</span>
      </p>

      {suggestion.hook && (
        <p className="mt-3 rounded-lg border border-ink-500 bg-ink-900/60 p-3 text-sm italic leading-relaxed text-chalk/90">
          « {suggestion.hook} »
        </p>
      )}

      {suggestion.reason && (
        <div className="mt-3">
          <p
            className={`text-sm leading-relaxed text-muted ${expanded ? '' : 'line-clamp-3'}`}
          >
            {suggestion.reason}
          </p>
          {suggestion.reason.length > 150 && (
            <button
              onClick={() => setExpanded((value) => !value)}
              className="mt-1 text-xs font-medium text-blue-400 hover:underline"
            >
              {expanded ? 'Réduire' : 'Lire la justification complète'}
            </button>
          )}
        </div>
      )}

      <div className="mt-4">
        <ScoreBreakdown breakdown={suggestion.score_breakdown} />
      </div>

      {suggestion.hashtags.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {suggestion.hashtags.map((tag) => (
            <li
              key={tag}
              className="rounded-md bg-ink-600 px-2 py-1 text-2xs text-muted"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}

      <Button
        className="mt-5"
        variant={isBest ? 'accent' : 'primary'}
        icon="scissors"
        block
        onClick={() =>
          navigate(`/app/projets/${projectId}/editeur?suggestion=${suggestion.id}`)
        }
      >
        Ouvrir dans l’éditeur
      </Button>
    </article>
  )
}

function ClipResult({
  clip,
  onDelete,
  onRetry,
  projectId,
}: {
  clip: Clip
  onDelete: (clip: Clip) => void
  onRetry: (clip: Clip) => void
  projectId: string
}) {
  const { notify, notifyError } = useToast()
  const navigate = useNavigate()
  const meta = statusMeta(clip.status)

  const copyCaption = async () => {
    const text = [clip.caption, clip.hashtags.join(' ')].filter(Boolean).join('\n\n')
    if (!text.trim()) {
      notify('Aucune légende à copier pour ce clip.', 'info')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      notify('Légende copiée dans le presse-papiers.')
    } catch (error) {
      notifyError(error, 'Copie impossible. Sélectionné le texte manuellement.')
    }
  }

  return (
    <article className="panel overflow-hidden">
      <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,13rem)_1fr]">
        <div className="mx-auto w-full max-w-[13rem]">
          {clip.video_url ? (
            <video
              src={clip.video_url}
              controls
              playsInline
              preload="metadata"
              className="aspect-[9/16] w-full rounded-lg border border-ink-500 bg-ink-900"
              aria-label={`Lecteur du Short ${clip.title}`}
            />
          ) : (
            <div className="grid aspect-[9/16] w-full place-items-center rounded-lg border border-ink-500 bg-ink-900 text-center">
              {meta.busy ? (
                <div className="px-4">
                  <Icon name="film" size={26} className="mx-auto animate-pulse-ring text-flame-500" />
                  <p className="mt-3 text-xs text-muted">
                    {clip.stage_detail ?? 'Génération en cours'}
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-chalk">
                    {clip.progress}%
                  </p>
                </div>
              ) : (
                <Icon name="film" size={26} className="text-ink-400" />
              )}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={clip.status} size="sm" />
            <span className="text-xs tabular-nums text-muted">
              {formatPrecise(clip.start_seconds)} - {formatPrecise(clip.end_seconds)} &middot;{' '}
              {Math.round(clip.duration_seconds)} s
            </span>
            {clip.output_size_bytes > 0 && (
              <span className="text-xs text-muted">
                &middot; {formatBytes(clip.output_size_bytes)}
              </span>
            )}
          </div>

          <h3 className="mt-2.5 truncate text-base font-semibold text-chalk" title={clip.title}>
            {clip.title || 'Short sans titre'}
          </h3>

          {meta.busy && (
            <div className="mt-3 max-w-sm">
              <ProgressBar
                value={clip.progress}
                tone="flame"
                label={`Génération de ${clip.title}`}
              />
              <p className="mt-1.5 text-xs text-muted">{clip.stage_detail}</p>
            </div>
          )}

          {clip.status === 'failed' && clip.error_message && (
            <div className="mt-3">
              <Alert tone="error" title="Export échoué">
                {clip.error_message}
              </Alert>
            </div>
          )}

          {clip.caption && (
            <p className="mt-3 whitespace-pre-line rounded-lg border border-ink-500 bg-ink-900/60 p-3 text-sm leading-relaxed text-muted">
              {clip.caption}
            </p>
          )}

          {clip.hashtags.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {clip.hashtags.map((tag) => (
                <li key={tag} className="rounded-md bg-ink-600 px-2 py-1 text-2xs text-muted">
                  {tag}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {clip.status === 'completed' && clip.download_url && (
              <>
                <a href={clip.download_url} download>
                  <Button variant="accent" icon="download" size="sm">
                    Télécharger le MP4
                  </Button>
                </a>
                {clip.srt_url && (
                  <a href={clip.srt_url} download>
                    <Button variant="secondary" icon="captions" size="sm">
                      Télécharger les sous-titres
                    </Button>
                  </a>
                )}
                <Button variant="secondary" icon="copy" size="sm" onClick={copyCaption}>
                  Copier la légende
                </Button>
                <Button
                  variant="ghost"
                  icon="plus"
                  size="sm"
                  onClick={() => navigate(`/app/projets/${projectId}/editeur`)}
                >
                  Créer un autre clip
                </Button>
              </>
            )}
            {clip.status === 'failed' && (
              <Button variant="secondary" icon="refresh" size="sm" onClick={() => onRetry(clip)}>
                Relancer l’export
              </Button>
            )}
            {!meta.busy && (
              <IconButton
                icon="trash"
                label={`Supprimer le clip ${clip.title}`}
                size="sm"
                onClick={() => onDelete(clip)}
              />
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>()
  const { status } = useAuth()
  const { notify, notifyError } = useToast()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [working, setWorking] = useState(false)
  const [deletingClip, setDeletingClip] = useState<Clip | null>(null)

  const load = useCallback(
    async (quiet = false) => {
      if (!projectId) return
      try {
        const { project: next } = await api.projects.get(projectId)
        setProject(next)
      } catch (error) {
        if (!quiet) {
          setNotFound(true)
          notifyError(error, 'Projet introuvable.')
        }
      } finally {
        setLoading(false)
      }
    },
    [projectId, notifyError],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!project) return
    const busy =
      statusMeta(project.status).busy ||
      (project.clips ?? []).some((clip) => statusMeta(clip.status).busy)
    if (!busy) return
    const timer = window.setInterval(() => void load(true), 1500)
    return () => window.clearInterval(timer)
  }, [project, load])

  const run = async (action: () => Promise<unknown>, success: string, failure: string) => {
    setWorking(true)
    try {
      await action()
      notify(success)
      await load(true)
    } catch (error) {
      notifyError(error, failure)
    } finally {
      setWorking(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-80" />
          ))}
        </div>
      </div>
    )
  }

  if (notFound || !project) {
    return (
      <Alert tone="error" title="Projet introuvable">
        Ce projet n’existe plus ou ne t’appartient pas.
        <div className="mt-3">
          <Link to="/app/projets">
            <Button variant="secondary" size="sm" icon="chevron-left">
              Retour aux projets
            </Button>
          </Link>
        </div>
      </Alert>
    )
  }

  const meta = statusMeta(project.status)
  const suggestions = project.suggestions ?? []
  const clips = project.clips ?? []
  const bestScore = suggestions.reduce((max, item) => Math.max(max, item.score), 0)
  const expiry = formatExpiry(project.expires_at)

  return (
    <div className="space-y-6">
      {/* --- Header --- */}
      <header className="panel p-5">
        <div className="flex flex-wrap items-start gap-5">
          <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-lg border border-ink-500 bg-ink-900">
            {project.thumbnail_url ? (
              <img src={project.thumbnail_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full place-items-center text-ink-400">
                <Icon name="film" size={24} />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <Link
              to="/app/projets"
              className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-chalk"
            >
              <Icon name="chevron-left" size={13} />
              Mes projets
            </Link>
            <h1 className="mt-1.5 truncate text-xl font-bold tracking-tight text-chalk sm:text-2xl">
              {project.name}
            </h1>
            <dl className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Statut</dt>
                <dd>
                  <StatusBadge status={project.status} size="sm" />
                </dd>
              </div>
              <div>
                <dt className="sr-only">Durée</dt>
                <dd className="tabular-nums">{formatDuration(project.duration_seconds)}</dd>
              </div>
              <div>
                <dt className="sr-only">Poids</dt>
                <dd>{formatBytes(project.size_bytes)}</dd>
              </div>
              <div>
                <dt className="sr-only">Résolution</dt>
                <dd className="tabular-nums">
                  {project.width} x {project.height}
                </dd>
              </div>
              <div>
                <dt className="sr-only">Langue</dt>
                <dd>{languageLabel(project.language)}</dd>
              </div>
              <div>
                <dt className="sr-only">Date</dt>
                <dd>{formatDate(project.created_at)}</dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-wrap gap-2">
            {meta.busy && (
              <Button
                variant="secondary"
                icon="stop"
                loading={working}
                onClick={() =>
                  run(
                    () => api.projects.cancel(project.id),
                    'Annulation demandée.',
                    'Annulation impossible.',
                  )
                }
              >
                Annuler
              </Button>
            )}
            {(project.status === 'failed' || project.status === 'cancelled') && (
              <Button
                variant="secondary"
                icon="refresh"
                loading={working}
                onClick={() =>
                  run(
                    () => api.projects.retry(project.id),
                    'Tâche relancée.',
                    'Relance impossible.',
                  )
                }
              >
                Relancer le traitement
              </Button>
            )}
            {suggestions.length > 0 && !meta.busy && (
              <Button
                icon="scissors"
                onClick={() => navigate(`/app/projets/${project.id}/editeur`)}
              >
                Ouvrir l’éditeur
              </Button>
            )}
          </div>
        </div>

        {meta.busy && (
          <div className="mt-5 rounded-lg border border-ink-500 bg-ink-900/60 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-chalk">
                <Icon
                  name={meta.icon}
                  size={16}
                  className={`animate-pulse-ring ${
                    project.status === 'rendering' ? 'text-flame-500' : 'text-blue-400'
                  }`}
                />
                {project.stage_detail ?? meta.description}
              </span>
              <span className="font-semibold tabular-nums text-chalk">{project.progress}%</span>
            </div>
            <div className="mt-2.5">
              <ProgressBar
                value={project.progress}
                tone={project.status === 'rendering' ? 'flame' : 'blue'}
                label="Progression du projet"
              />
            </div>
            <ol className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
              {(
                [
                  ['transcribing', 'Transcription'],
                  ['analyzing', 'Analyse'],
                  ['rendering', 'Export'],
                ] as const
              ).map(([key, label]) => {
                const order = ['queued', 'transcribing', 'analyzing', 'rendering']
                const current = order.indexOf(project.status)
                const own = order.indexOf(key)
                const state = current > own ? 'done' : current === own ? 'active' : 'pending'
                return (
                  <li key={key} className="flex items-center gap-1.5">
                    <Icon
                      name={state === 'done' ? 'check' : state === 'active' ? 'clock' : 'draft'}
                      size={12}
                      className={
                        state === 'done'
                          ? 'text-positive-500'
                          : state === 'active'
                            ? 'text-blue-400'
                            : 'text-ink-400'
                      }
                    />
                    <span className={state === 'pending' ? 'text-muted/60' : 'text-chalk'}>
                      {label}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        {project.status === 'failed' && project.error_message && (
          <div className="mt-5">
            <Alert
              tone="error"
              title="Le traitement a échoué"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  icon="refresh"
                  loading={working}
                  onClick={() =>
                    run(
                      () => api.projects.retry(project.id),
                      'Tâche relancée.',
                      'Relance impossible.',
                    )
                  }
                >
                  Relancer
                </Button>
              }
            >
              {project.error_message}
            </Alert>
          </div>
        )}

        {project.status === 'cancelled' && (
          <div className="mt-5">
            <Alert tone="info" title="Tâche annulée">
              Le traitement a été interrompu. Tu peux le relancer quand tu veux.
            </Alert>
          </div>
        )}

        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
          <Icon name="shield" size={13} className="text-positive-500" />
          {project.files_purged
            ? 'Les fichiers de ce projet ont été supprimés automatiquement après 24 h.'
            : expiry
              ? `Suppression automatique des fichiers ${expiry}.`
              : 'Suppression automatique après 24 h.'}
        </p>
      </header>

      {/* --- AI status --- */}
      {project.analysis_error && (
        <Alert tone="warning" title="Analyse IA non disponible">
          {project.analysis_error}
        </Alert>
      )}

      {status && !status.ai.configured && suggestions.length === 0 && !meta.busy && (
        <Alert
          tone="warning"
          title="Connexion Mistral requise"
          action={
            <Button size="sm" variant="secondary" icon="settings" onClick={() => navigate('/app/parametres?section=connexion')}>
              Configurer maintenant
            </Button>
          }
        >
          {status.ai.message ?? 'Ajoute ta clé API Mistral depuis les paramètres de ton compte.'}
        </Alert>
      )}

      {/* --- Suggestions --- */}
      {suggestions.length > 0 && (
        <section aria-label="Propositions d’extraits">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-chalk">
                {suggestions.length} propositions d’extraits
              </h2>
              <p className="mt-1 text-sm text-muted">
                {project.analysis_source === 'mistral'
                  ? `Analysées par ${status?.ai.model ?? 'Mistral'} à partir de la transcription seule.`
                  : 'Générées par l’heuristique locale de Fastclip. Ce n’est pas une analyse IA.'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon="refresh"
              loading={working}
              onClick={() =>
                run(
                  () => api.projects.retry(project.id),
                  'Nouvelle analyse lancée.',
                  'Relance impossible.',
                )
              }
            >
              Relancer l’analyse
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                isBest={suggestion.score === bestScore}
                projectId={project.id}
              />
            ))}
          </div>
        </section>
      )}

      {/* --- Exported clips --- */}
      {clips.length > 0 && (
        <section aria-label="Shorts générés" className="space-y-4">
          <h2 className="text-base font-semibold text-chalk">
            Shorts générés ({clips.length})
          </h2>
          {clips.map((clip) => (
            <ClipResult
              key={clip.id}
              clip={clip}
              projectId={project.id}
              onDelete={setDeletingClip}
              onRetry={(target) =>
                run(
                  () => api.clips.retry(target.id),
                  'Export relance.',
                  'Relance impossible.',
                )
              }
            />
          ))}
        </section>
      )}

      <Modal
        open={deletingClip !== null}
        onClose={() => setDeletingClip(null)}
        title="Supprimer ce Short ?"
        description="Le fichier MP4 et son fichier de sous-titres seront supprimés du serveur."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingClip(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              icon="trash"
              loading={working}
              onClick={async () => {
                if (!deletingClip) return
                await run(
                  () => api.clips.remove(deletingClip.id),
                  'Short supprimé.',
                  'Suppression impossible.',
                )
                setDeletingClip(null)
              }}
            >
              Supprimer
            </Button>
          </>
        }
      />
    </div>
  )
}
