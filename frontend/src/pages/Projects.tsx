import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ProjectRow } from './Dashboard'
import { Icon } from '../components/Icon'
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Modal,
  ProgressBar,
  Skeleton,
  StatusBadge,
} from '../components/ui'
import { useToast } from '../context/AppContext'
import { api, type Project } from '../lib/api'
import { formatDate, formatDuration, formatExpiry } from '../lib/format'
import { statusMeta } from '../lib/status'

type View = 'grid' | 'list'

function ProjectCard({
  project,
  onRename,
  onDelete,
}: {
  project: Project
  onRename: (project: Project) => void
  onDelete: (project: Project) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const meta = statusMeta(project.status)
  const expiry = formatExpiry(project.expires_at)

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <article className="panel group relative flex flex-col overflow-visible transition-colors duration-150 hover:border-ink-400">
      <Link
        to={`/app/projets/${project.id}`}
        className="relative block aspect-video overflow-hidden rounded-t-xl bg-ink-900"
      >
        {project.thumbnail_url ? (
          <img
            src={project.thumbnail_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="grid h-full place-items-center text-ink-400">
            <Icon name="film" size={30} />
          </span>
        )}
        <span className="absolute left-2 top-2">
          <StatusBadge status={project.status} size="sm" />
        </span>
        {project.duration_seconds > 0 && (
          <span className="absolute bottom-2 right-2 rounded bg-ink-900/85 px-1.5 py-0.5 text-2xs tabular-nums text-chalk">
            {formatDuration(project.duration_seconds)}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1">
            <Link
              to={`/app/projets/${project.id}`}
              className="block truncate text-sm font-semibold text-chalk hover:text-blue-400"
              title={project.name}
            >
              {project.name}
            </Link>
          </h3>

          <div className="relative" ref={menuRef}>
            <IconButton
              icon="more"
              label={`Actions for ${project.name}`}
              size="sm"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((value) => !value)}
            />
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-9 z-50 w-44 animate-fade-in overflow-hidden rounded-lg border border-ink-500 bg-ink-700 py-1 shadow-lifted"
              >
                {[
                  {
                    label: 'Open',
                    icon: 'arrow-right' as const,
                    onClick: () => navigate(`/app/projets/${project.id}`),
                  },
                  {
                    label: 'Rename',
                    icon: 'edit' as const,
                    onClick: () => onRename(project),
                  },
                ].map((action) => (
                  <button
                    key={action.label}
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      action.onClick()
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-chalk transition-colors hover:bg-ink-600"
                  >
                    <Icon name={action.icon} size={15} className="text-muted" />
                    {action.label}
                  </button>
                ))}
                <div className="my-1 border-t border-ink-500" />
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onDelete(project)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-negative-500 transition-colors hover:bg-negative-700/40"
                >
                  <Icon name="trash" size={15} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        <dl className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <div className="flex items-center gap-1">
            <dt className="sr-only">Date</dt>
            <dd>{formatDate(project.created_at)}</dd>
          </div>
          <span aria-hidden="true">&middot;</span>
          <div className="flex items-center gap-1">
            <dt className="sr-only">Clips created</dt>
            <Icon name="film" size={11} />
            <dd>
              {project.clip_count} clip{project.clip_count > 1 ? 's' : ''}
            </dd>
          </div>
        </dl>

        {meta.busy && (
          <div className="mt-3">
            <ProgressBar
              value={project.progress}
              size="sm"
              tone={project.status === 'rendering' ? 'flame' : 'blue'}
              label={`${project.name} progress`}
            />
            <p className="mt-1.5 text-xs text-muted">
              {project.stage_detail ?? meta.description}
            </p>
          </div>
        )}

        {project.status === 'failed' && project.error_message && (
          <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-negative-500">
            {project.error_message}
          </p>
        )}

        {project.files_purged ? (
          <p className="mt-auto pt-3 text-2xs text-muted">
            Files deleted automatically
          </p>
        ) : expiry ? (
          <p className="mt-auto flex items-center gap-1 pt-3 text-2xs text-muted">
            <Icon name="clock" size={11} />
            Deletion {expiry}
          </p>
        ) : null}
      </div>
    </article>
  )
}

export default function Projects() {
  const { notify, notifyError } = useToast()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('grid')
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<Project | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<Project | null>(null)
  const [working, setWorking] = useState(false)

  const load = useCallback(
    async (quiet = false) => {
      try {
        const { projects: next } = await api.projects.list()
        setProjects(next)
      } catch (error) {
        if (!quiet) notifyError(error, 'Unable to load projects.')
      } finally {
        setLoading(false)
      }
    },
    [notifyError],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!projects.some((project) => statusMeta(project.status).busy)) return
    const timer = window.setInterval(() => void load(true), 2500)
    return () => window.clearInterval(timer)
  }, [projects, load])

  const submitRename = async () => {
    if (!renaming) return
    setWorking(true)
    try {
      await api.projects.rename(renaming.id, renameValue.trim())
      notify('Project renamed.')
      setRenaming(null)
      await load(true)
    } catch (error) {
      notifyError(error, 'Unable to rename project.')
    } finally {
      setWorking(false)
    }
  }

  const submitDelete = async () => {
    if (!deleting) return
    setWorking(true)
    try {
      await api.projects.remove(deleting.id)
      notify('Project moved to trash.')
      setDeleting(null)
      await load(true)
    } catch (error) {
      notifyError(error, 'Unable to delete project.')
    } finally {
      setWorking(false)
    }
  }

  const filtered = query.trim()
    ? projects.filter((project) =>
        project.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : projects

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Library</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-chalk sm:text-3xl">
            My projects
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {projects.length} project{projects.length > 1 ? 's' : ''} &middot; files
            are deleted automatically after 24 h
          </p>
        </div>
        <Button variant="accent" icon="upload" onClick={() => navigate('/app/nouveau')}>
          Upload a video
        </Button>
      </header>

      {projects.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[14rem] flex-1">
            <label htmlFor="project-search" className="sr-only">
              Search projects
            </label>
            <div className="relative">
              <Icon
                name="folder"
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                id="project-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search projects"
                className="field pl-10"
              />
            </div>
          </div>

          <div
            className="flex rounded-lg border border-ink-500 bg-ink-800 p-1"
            role="group"
            aria-label="View"
          >
            {(
              [
                ['grid', 'dashboard', 'Grid'],
                ['list', 'menu', 'List'],
              ] as const
            ).map(([value, icon, label]) => (
              <button
                key={value}
                onClick={() => setView(value)}
                aria-pressed={view === value}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors
                  ${view === value ? 'bg-ink-600 text-chalk' : 'text-muted hover:text-chalk'}`}
              >
                <Icon name={icon} size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-64" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon="folder"
          title="No projects yet"
          description="Every uploaded video becomes a project: transcript, clip suggestions, and exported shorts stay together in one place."
          action={
            <Button size="lg" variant="accent" icon="upload" onClick={() => navigate('/app/nouveau')}>
              Upload my first video
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="folder"
          title="No results"
          description={`No project matches "${query}".`}
          action={
            <Button variant="secondary" onClick={() => setQuery('')}>
              Clear search
            </Button>
          }
        />
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onRename={(target) => {
                setRenaming(target)
                setRenameValue(target.name)
              }}
              onDelete={setDeleting}
            />
          ))}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </ul>
      )}

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename project"
        description="This name is also used as the basis for exported file names."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              onClick={submitRename}
              loading={working}
              disabled={!renameValue.trim()}
            >
              Save
            </Button>
          </>
        }
      >
        <Field
          label="Project name"
          value={renameValue}
          maxLength={140}
          onChange={(event) => setRenameValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && renameValue.trim()) void submitRename()
          }}
        />
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this project?"
        description="The project, transcript, suggestions, and exported clips will be permanently deleted."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon="trash" onClick={submitDelete} loading={working}>
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="rounded-lg border border-negative-600/40 bg-negative-700/20 p-3.5 text-sm text-chalk">
          <span className="font-semibold">{deleting?.name}</span> and all associated files
          will be erased from the server. This action cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
