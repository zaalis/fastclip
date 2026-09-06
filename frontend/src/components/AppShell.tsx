import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { api, type QueueSnapshot } from '../lib/api'
import { statusMeta } from '../lib/status'
import { useAuth, useToast } from '../context/AppContext'
import { Icon, type IconName } from './Icon'
import { Avatar, Button, IconButton, Logo, LogoMark, ProgressBar } from './ui'

interface NavItem {
  to: string
  label: string
  icon: IconName
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/app', label: 'Tableau de bord', icon: 'dashboard', end: true },
  { to: '/app/nouveau', label: 'Nouveau projet', icon: 'plus' },
  { to: '/app/projets', label: 'Mes projets', icon: 'folder' },
  { to: '/app/modeles', label: 'Modèles de sous-titres', icon: 'captions' },
  { to: '/app/corbeille', label: 'Corbeille', icon: 'trash' },
  { to: '/app/aide', label: 'Aide', icon: 'help' },
]

/**
 * Polls the queue. Fast while something is running, lazy when idle - a 2 vCPU
 * VM should not spend its cycles answering an idle browser.
 */
export function useQueue() {
  const [queue, setQueue] = useState<QueueSnapshot | null>(null)
  const timer = useRef<number>()

  const poll = useCallback(async () => {
    try {
      const snapshot = await api.queue()
      setQueue(snapshot)
      return snapshot.items.some((item) => item.status === 'running' || item.status === 'queued')
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    let active = true
    const tick = async () => {
      const busy = await poll()
      if (!active) return
      timer.current = window.setTimeout(tick, busy ? 1500 : 8000)
    }
    tick()
    return () => {
      active = false
      window.clearTimeout(timer.current)
    }
  }, [poll])

  return { queue, refresh: poll }
}

function QueueIndicator({ queue }: { queue: QueueSnapshot | null }) {
  const navigate = useNavigate()
  const active = queue?.items.find((item) => item.status === 'running')
  const waiting = queue?.items.filter((item) => item.status === 'queued').length ?? 0

  if (!queue || queue.items.length === 0) {
    return (
      <span className="hidden items-center gap-2 rounded-lg border border-ink-500 bg-ink-800 px-3 py-1.5 text-xs text-muted sm:inline-flex">
        <span className="h-1.5 w-1.5 rounded-full bg-positive-500" aria-hidden="true" />
        File libre
      </span>
    )
  }

  return (
    <button
      onClick={() => active && navigate(`/app/projets/${active.project_id}`)}
      className="flex min-w-0 max-w-[22rem] items-center gap-3 rounded-lg border border-flame-500/40
        bg-flame-500/8 px-3 py-1.5 text-left transition-[background-color,border-color,transform,box-shadow] duration-[360ms]
        ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-px hover:border-flame-500/65 hover:bg-flame-500/15 hover:shadow-orange"
    >
      <Icon
        name={active ? statusMeta(active.stage).icon : 'clock'}
        size={15}
        className="text-flame-500"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-chalk">
          {active
            ? `${active.stage_detail ?? statusMeta(active.stage).label} - ${active.project_name}`
            : `${waiting} tâche${waiting > 1 ? 's' : ''} en attente`}
        </span>
        {active && (
          <span className="mt-1 block">
            <ProgressBar value={active.progress} size="sm" label="Progression de la tâche" />
          </span>
        )}
      </span>
      {active && (
        <span className="text-xs font-semibold tabular-nums text-flame-500">
          {active.progress}%
        </span>
      )}
    </button>
  )
}

function SidebarContent({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean
  onNavigate?: () => void
}) {
  const { user, logout } = useAuth()
  const { notifyError } = useToast()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/')
    } catch (error) {
      notifyError(error, 'Déconnexion impossible.')
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className={`flex h-16 items-center border-b border-ink-500 ${collapsed ? 'justify-center px-2' : 'px-5'}`}>
        {collapsed ? (
          <NavLink to="/app" aria-label="Fastclip, tableau de bord">
            <LogoMark size={30} />
          </NavLink>
        ) : (
          <Logo to="/app" size="sm" />
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Navigation principale">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              `app-nav-link group relative flex items-center rounded-lg text-sm font-medium
               transition-[background-color,color,transform,box-shadow] duration-[360ms] ease-[cubic-bezier(0.16,1,0.3,1)]
               hover:translate-x-0.5 active:translate-x-0
               ${collapsed ? 'h-11 justify-center' : 'gap-3 px-3 py-2.5'}
               ${
                 isActive
                   ? 'bg-gradient-to-r from-flame-500/18 via-flame-500/8 to-blue-500/6 text-chalk shadow-[inset_0_0_0_1px_rgba(255,138,61,.16),0_10px_22px_-18px_rgba(255,102,31,.7)]'
                   : 'text-muted hover:bg-flame-500/8 hover:text-chalk'
               }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`app-nav-indicator absolute left-0 h-6 w-[3px] rounded-r-full bg-flame-500 ${
                    isActive ? 'is-active' : ''
                  }`}
                  aria-hidden="true"
                />
                <Icon
                  name={item.icon}
                  size={19}
                  className={
                    isActive
                      ? 'text-flame-500 transition-colors duration-300'
                      : 'transition-colors duration-300 group-hover:text-flame-300'
                  }
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {collapsed && <span className="sr-only">{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-ink-500 p-3">
        {user && (
          <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'gap-3'}`}>
            <NavLink
              to="/app/parametres"
              onClick={onNavigate}
              title={collapsed ? user.username : undefined}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 transition-[background-color,transform] duration-[320ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:translate-x-0.5 hover:bg-flame-500/8"
            >
              <Avatar user={user} size={collapsed ? 30 : 34} />
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-chalk">
                    {user.username}
                  </span>
                  <span className="block truncate text-xs text-muted">{user.email}</span>
                </span>
              )}
              {collapsed && <span className="sr-only">Paramètres du compte</span>}
            </NavLink>
            {!collapsed && (
              <IconButton
                icon="settings"
                label="Paramètres"
                size="sm"
                onClick={() => {
                  onNavigate?.()
                  navigate('/app/parametres')
                }}
              />
            )}
          </div>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? 'Se déconnecter' : undefined}
          className={`mt-2 flex w-full items-center rounded-lg text-sm text-muted
            transition-[background-color,color,transform] duration-[320ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:translate-x-0.5 hover:bg-flame-500/8 hover:text-chalk
            ${collapsed ? 'h-10 justify-center' : 'gap-3 px-3 py-2'}`}
        >
          <Icon name="logout" size={18} />
          {collapsed ? <span className="sr-only">Se déconnecter</span> : 'Se déconnecter'}
        </button>
      </div>
    </div>
  )
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('fastclip.sidebar') === 'collapsed'
    } catch {
      return false
    }
  })
  const { queue } = useQueue()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => setDrawerOpen(false), [location.pathname])

  useEffect(() => {
    try {
      localStorage.setItem('fastclip.sidebar', collapsed ? 'collapsed' : 'expanded')
    } catch {
      /* private mode: the preference just does not persist */
    }
  }, [collapsed])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setDrawerOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  // Below xl the rail is always collapsed; above it the user decides.
  const railWidth = collapsed ? 'lg:w-[72px]' : 'lg:w-[248px]'

  return (
    <div className="min-h-dvh bg-ink-900">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70]
          focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Aller au contenu principal
      </a>

      {/* Desktop rail */}
      <aside
        className={`dashboard-rail fixed inset-y-0 left-0 z-40 hidden border-r border-ink-500 bg-ink-800
          transition-[width] duration-[520ms] ease-[cubic-bezier(0.16,1,0.3,1)] lg:block ${railWidth}`}
      >
        <SidebarContent collapsed={collapsed} />
        <button
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
          className="absolute -right-3 top-20 grid h-6 w-6 place-items-center rounded-full
            border border-ink-500 bg-ink-700 text-muted transition-[color,background-color,border-color,transform] duration-[320ms] ease-[cubic-bezier(0.16,1,0.3,1)]
            hover:scale-105 hover:border-flame-500 hover:bg-ink-600 hover:text-flame-300"
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={13} />
        </button>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-ink-900/80"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="dashboard-rail absolute inset-y-0 left-0 w-[264px] animate-drawer-in border-r border-ink-500 bg-ink-800"
          >
            <SidebarContent collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className={`transition-[padding] duration-[520ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-[248px]'}`}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-500 bg-ink-900/90 px-4 shadow-[0_1px_0_rgba(255,255,255,.02)] backdrop-blur sm:px-6">
          <IconButton
            icon="menu"
            label="Ouvrir la navigation"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
          />
          <div className="lg:hidden">
            <Logo to="/app" size="sm" />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <QueueIndicator queue={queue} />
            <Button
              variant="accent"
              size="sm"
              icon="upload"
              onClick={() => navigate('/app/nouveau')}
              className="hidden sm:inline-flex"
            >
              Importer
            </Button>
          </div>
        </header>

        <main id="contenu" className="mx-auto w-full max-w-[1360px] px-4 py-6 sm:px-6 lg:py-8">
          <div key={location.pathname} className="animate-page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
