import { useCallback, useEffect, useState } from 'react'

import { Icon } from '../components/Icon'
import { Alert, Button, EmptyState, Skeleton } from '../components/ui'
import { useToast } from '../context/AppContext'
import { api, type Project } from '../lib/api'
import { formatDate, formatDuration } from '../lib/format'

export default function Trash() {
  const { notify, notifyError } = useToast()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await api.projects.trash()
      setProjects(response.projects)
    } catch (error) {
      notifyError(error, 'Unable to load trash.')
    } finally {
      setLoading(false)
    }
  }, [notifyError])

  useEffect(() => { void load() }, [load])

  const restore = async (project: Project) => {
    setBusy(project.id)
    try {
      await api.projects.restore(project.id)
      setProjects((items) => items.filter((item) => item.id !== project.id))
      notify('Project restored to My projects.')
    } catch (error) {
      notifyError(error, 'Unable to restore project.')
    } finally { setBusy(null) }
  }

  const permanentlyRemove = async (project: Project) => {
    if (!window.confirm(`Permanently delete “${project.name}” and its files?`)) return
    setBusy(project.id)
    try {
      await api.projects.permanentlyRemove(project.id)
      setProjects((items) => items.filter((item) => item.id !== project.id))
      notify('Project permanently deleted.')
    } catch (error) {
      notifyError(error, 'Unable to permanently delete project.')
    } finally { setBusy(null) }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Recovery</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-chalk sm:text-3xl">Trash</h1>
        <p className="mt-1.5 text-sm text-muted">Projects here can be restored until you permanently delete them.</p>
      </header>
      <Alert tone="info" title="Recoverable deletion">Deleting from My projects only moves a project here: its files are not erased.</Alert>
      {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div> : projects.length === 0 ? <EmptyState icon="trash" title="Trash is empty" description="Deleted projects will appear here and can be restored." /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <article key={project.id} className="panel overflow-hidden">
              <div className="flex aspect-video items-center justify-center bg-ink-900">
                {project.thumbnail_url ? <img src={project.thumbnail_url} alt="" className="h-full w-full object-cover opacity-60" /> : <Icon name="film" size={28} className="text-muted" />}
              </div>
              <div className="p-4"><h2 className="truncate text-sm font-semibold text-chalk">{project.name}</h2><p className="mt-1 text-xs text-muted">{formatDuration(project.duration_seconds)} · uploaded {formatDate(project.created_at)}</p>
                <div className="mt-4 grid grid-cols-2 gap-2"><Button size="sm" variant="secondary" icon="refresh" loading={busy === project.id} onClick={() => void restore(project)}>Restore</Button><Button size="sm" variant="danger" icon="trash" loading={busy === project.id} onClick={() => void permanentlyRemove(project)}>Erase</Button></div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
