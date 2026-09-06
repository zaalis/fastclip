import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Icon } from '../components/Icon'
import {
  Alert,
  Button,
  EmptyState,
  ProgressBar,
  Skeleton,
  Stat,
  StatusBadge,
} from '../components/ui'
import { useAuth, useToast } from '../context/AppContext'
import { api, type DashboardData, type Project } from '../lib/api'
import { formatBytes, formatDuration, formatRelative, formatSavedTime } from '../lib/format'
import { statusMeta } from '../lib/status'

export function ProjectRow({ project }: { project: Project }) {
  const meta = statusMeta(project.status)
  return (
    <li>
      <Link
        to={`/app/projets/${project.id}`}
        className="group flex items-center gap-4 rounded-xl border border-ink-500 bg-ink-800 p-3
          transition-colors duration-150 hover:border-ink-400 hover:bg-ink-600"
      >
        <span className="relative grid h-14 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-500 bg-ink-900">
          {project.thumbnail_url ? (
            <img
              src={project.thumbnail_url}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              width={96}
              height={56}
            />
          ) : (
            <Icon name="film" size={20} className="text-ink-400" />
          )}
          {project.duration_seconds > 0 && (
            <span className="absolute bottom-1 right-1 rounded bg-ink-900/85 px-1 py-0.5 text-2xs tabular-nums text-chalk">
              {formatDuration(project.duration_seconds)}
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-chalk">{project.name}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>{formatRelative(project.created_at)}</span>
            {project.clip_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <Icon name="film" size={11} />
                {project.clip_count} clip{project.clip_count > 1 ? 's' : ''}
              </span>
            )}
          </span>
          {meta.busy && (
            <span className="mt-2 block max-w-xs">
              <ProgressBar
                value={project.progress}
                size="sm"
                tone={project.status === 'rendering' ? 'flame' : 'blue'}
                label={`Progression de ${project.name}`}
              />
            </span>
          )}
        </span>

        <StatusBadge status={project.status} size="sm" />
        <span className="hidden items-center gap-1 text-xs font-medium text-blue-400 sm:inline-flex">
          Ouvrir
          <Icon
            name="chevron-right"
            size={14}
            className="transition-transform duration-150 group-hover:translate-x-0.5"
          />
        </span>
      </Link>
    </li>
  )
}

export default function Dashboard() {
  const { user, status } = useAuth()
  const { notifyError } = useToast()
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    async (quiet = false) => {
      try {
        const next = await api.dashboard()
        setData(next)
        return next
      } catch (error) {
        if (!quiet) notifyError(error, 'Impossible de charger le tableau de bord.')
        return null
      } finally {
        setLoading(false)
      }
    },
    [notifyError],
  )

  useEffect(() => {
    void load()
  }, [load])

  // Refresh while something is processing so the states move on their own.
  useEffect(() => {
    const busy =
      data?.recent_projects.some((project) => statusMeta(project.status).busy) ?? false
    if (!busy) return
    const timer = window.setInterval(() => void load(true), 2000)
    return () => window.clearInterval(timer)
  }, [data, load])

  const stats = data?.stats
  const projects = data?.recent_projects ?? []
  const storagePercent = stats
    ? Math.round((stats.storage_bytes / Math.max(1, stats.storage_limit_bytes)) * 100)
    : 0

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Tableau de bord</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-chalk sm:text-3xl">
            Bonjour, {user?.username}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Importe une vidéo, choisis parmi trois extraits, exporte ton Short.
          </p>
        </div>
        <Button size="lg" variant="accent" icon="upload" onClick={() => navigate('/app/nouveau')}>
          Importer une vidéo
        </Button>
      </header>

      {status && !status.ai.configured && (
        <Alert
          tone="warning"
          title="Connecte Mistral pour lancer tes analyses"
          action={
            <Button size="sm" variant="secondary" icon="settings" onClick={() => navigate('/app/parametres?section=connexion')}>
              Ouvrir les paramètres
            </Button>
          }
        >
          {status.ai.message ??
            'Ajoute ta clé API Mistral depuis les paramètres de ton compte.'}{' '}
          La transcription et l’export fonctionnent normalement.
          {status.ai.heuristic_fallback && (
            <span className="mt-2 block">
              Le mode test local (non-IA) est actif : les propositions seront
              générées par une heuristique et signalées comme telles.
            </span>
          )}
        </Alert>
      )}

      {status && !status.ffmpeg.available && (
        <Alert tone="error" title="FFmpeg introuvable">
          Le serveur n’a pas trouve FFmpeg. L’import et l’export sont désactivés
          tant qu’il n’est pas installe.
        </Alert>
      )}

      {/* Stats */}
      <section aria-label="Statistiques" className="stagger-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[9.5rem]" />
          ))
        ) : (
          <>
            <Stat
              icon="folder"
              label="Projets créés"
              value={String(stats?.projects ?? 0)}
              hint="Depuis la création du compte"
            />
            <Stat
              icon="film"
              label="Clips exportés"
              value={String(stats?.clips_exported ?? 0)}
              tone="flame"
              hint="MP4 verticaux générés"
            />
            <Stat
              icon="clock"
              label="Temps économisé (estimé)"
              value={formatSavedTime(stats?.seconds_saved ?? 0)}
              tone="positive"
              hint="Base sur ~8x la durée de chaque clip monté à la main"
            />
            <div className="panel p-5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-500/10 text-blue-400 ring-1 ring-inset ring-blue-500/25">
                <Icon name="layers" size={18} />
              </span>
              <p className="mt-4 text-2xl font-bold tracking-tight tabular-nums text-chalk">
                {formatBytes(stats?.storage_bytes ?? 0)}
              </p>
              <p className="mt-0.5 text-sm text-muted">Stockage utilisé</p>
              <div className="mt-3">
                <ProgressBar
                  value={storagePercent}
                  size="sm"
                  tone={storagePercent > 85 ? 'flame' : 'blue'}
                  label="Stockage utilisé"
                />
                <p className="mt-2 text-xs text-muted">
                  {storagePercent}% de {formatBytes(stats?.storage_limit_bytes ?? 0)}
                </p>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Queue */}
      {data && data.queue.items.length > 0 && (
        <section className="panel p-5" aria-label="File d’attente">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-chalk">File d’attente</h2>
            <span className="text-xs text-muted">
              1 tâche traitée à la fois &middot; {data.queue.pending_total} au total
            </span>
          </div>
          <ul className="mt-4 space-y-3">
            {data.queue.items.map((item) => (
              <li
                key={item.job_id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-ink-500 bg-ink-800 p-3"
              >
                <StatusBadge status={item.stage} size="sm" />
                <span className="min-w-0 flex-1">
                  <Link
                    to={`/app/projets/${item.project_id}`}
                    className="block truncate text-sm font-medium text-chalk hover:text-blue-400"
                  >
                    {item.project_name}
                  </Link>
                  <span className="text-xs text-muted">
                    {item.status === 'running'
                      ? (item.stage_detail ?? 'Traitement en cours')
                      : `Position ${item.position + 1} dans la file`}
                  </span>
                </span>
                <span className="w-full sm:w-48">
                  <ProgressBar
                    value={item.progress}
                    size="sm"
                    tone={item.kind === 'export' ? 'flame' : 'blue'}
                    label={`Progression de ${item.project_name}`}
                  />
                </span>
                <span className="w-10 text-right text-xs font-semibold tabular-nums text-chalk">
                  {item.progress}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent projects */}
      <section aria-label="Derniers projets">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-chalk">Derniers projets</h2>
          {projects.length > 0 && (
            <Link to="/app/projets" className="link text-sm">
              Voir tout
            </Link>
          )}
        </div>

        {loading ? (
          <ul className="stagger-grid space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <li key={index}>
                <Skeleton className="h-[5.25rem]" />
              </li>
            ))}
          </ul>
        ) : projects.length === 0 ? (
          <EmptyState
            icon="upload"
            title="Ton premier clip commence ici"
            description="Importe une vidéo de 10 minutes maximum. Fastclip extrait l’audio, transcrit chaque mot, puis te propose trois extraits à fort potentiel. Tu ajustes, tu exportes."
            action={
              <Button size="lg" variant="accent" icon="upload" onClick={() => navigate('/app/nouveau')}>
                Importer une vidéo
              </Button>
            }
          >
            <ol className="mt-8 grid w-full max-w-2xl gap-3 text-left sm:grid-cols-3">
              {[
                { icon: 'upload' as const, label: 'MP4, MOV ou WebM', hint: '10 min / 250 Mo max' },
                { icon: 'sparkle' as const, label: '3 propositions', hint: 'Score + justification' },
                { icon: 'film' as const, label: 'Export 9:16', hint: 'MP4 + sous-titres .srt' },
              ].map((step, index) => (
                <li
                  key={step.label}
                  className="rounded-lg border border-ink-500 bg-ink-800 p-3.5"
                >
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-ink-600 text-2xs font-semibold text-blue-400">
                      {index + 1}
                    </span>
                    <Icon name={step.icon} size={14} className="text-blue-400" />
                  </span>
                  <p className="mt-2 text-sm font-medium text-chalk">{step.label}</p>
                  <p className="text-xs text-muted">{step.hint}</p>
                </li>
              ))}
            </ol>
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {projects.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
