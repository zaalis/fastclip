/** Session, system capabilities and toast notifications. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { api, ApiError, type SystemStatus, type User } from '../lib/api'
import { Icon } from '../components/Icon'

export type AppLanguage = 'en' | 'fr'

interface LanguageValue {
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
}

const LanguageContext = createContext<LanguageValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>(() => {
    try {
      return localStorage.getItem('fastclip.language') === 'fr' ? 'fr' : 'en'
    } catch {
      return 'en'
    }
  })

  useEffect(() => {
    document.documentElement.lang = language
    try {
      localStorage.setItem('fastclip.language', language)
    } catch {
      // Language choice remains active for this session.
    }
  }, [language])

  const value = useMemo(() => ({ language, setLanguage }), [language])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageValue {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider')
  return context
}

// --- Auth -------------------------------------------------------------------

interface AuthValue {
  user: User | null
  status: SystemStatus | null
  loading: boolean
  setUser: (user: User | null) => void
  login: (email: string, password: string, remember: boolean) => Promise<void>
  register: (
    email: string,
    username: string,
    password: string,
    remember: boolean,
  ) => Promise<void>
  logout: () => Promise<void>
  refreshStatus: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.status())
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      const [me] = await Promise.allSettled([api.auth.me(), refreshStatus()])
      if (!active) return
      if (me.status === 'fulfilled') setUser(me.value.user ?? null)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [refreshStatus])

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    const { user: next } = await api.auth.login(email, password, remember)
    setUser(next)
    await refreshStatus()
  }, [refreshStatus])

  const register = useCallback(
    async (email: string, username: string, password: string, remember: boolean) => {
      const { user: next } = await api.auth.register(email, username, password, remember)
      setUser(next)
      await refreshStatus()
    },
    [refreshStatus],
  )

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, status, loading, setUser, login, register, logout, refreshStatus }),
    [user, status, loading, login, register, logout, refreshStatus],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

// --- Toasts -----------------------------------------------------------------

type ToastTone = 'success' | 'error' | 'info'
interface Toast {
  id: number
  tone: ToastTone
  message: string
}

interface ToastValue {
  notify: (message: string, tone?: ToastTone) => void
  /** Turns any thrown ApiError into a human sentence. */
  notifyError: (error: unknown, fallback?: string) => void
}

const ToastContext = createContext<ToastValue | null>(null)
let nextToastId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextToastId++
      setToasts((current) => [...current.slice(-2), { id, tone, message }])
      window.setTimeout(() => dismiss(id), tone === 'error' ? 6500 : 4000)
    },
    [dismiss],
  )

  const notifyError = useCallback(
    (error: unknown, fallback = 'Une erreur est survenue.') => {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error && error.message
            ? error.message
            : fallback
      notify(message, 'error')
    },
    [notify],
  )

  const value = useMemo(() => ({ notify, notifyError }), [notify, notifyError])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Polite live region: announced without stealing focus. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        {toasts.map((toast) => {
          const config = {
            success: {
              cls: 'border-positive-500/50 bg-ink-700 text-positive-500',
              icon: 'check' as const,
            },
            error: {
              cls: 'border-negative-600/60 bg-ink-700 text-negative-500',
              icon: 'alert' as const,
            },
            info: { cls: 'border-blue-500/50 bg-ink-700 text-blue-400', icon: 'info' as const },
          }[toast.tone]
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex w-full max-w-md animate-fade-up items-start
                gap-3 rounded-xl border p-3.5 shadow-lifted ${config.cls}`}
            >
              <Icon name={config.icon} size={18} className="mt-0.5" />
              <p className="flex-1 text-sm leading-relaxed text-chalk">{toast.message}</p>
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="Fermer la notification"
                className="rounded-md p-1 text-muted transition-colors hover:bg-ink-600 hover:text-chalk"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
