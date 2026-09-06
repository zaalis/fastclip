/** Shared UI primitives: logo, buttons, badges, progress, fields, modal, states. */
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { Link } from 'react-router-dom'

import { Icon, type IconName } from './Icon'
import { statusMeta, TONE_CLASSES } from '../lib/status'

// --- Logo -------------------------------------------------------------------

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="relative grid place-items-center rounded-[10px] bg-ink-700 ring-1 ring-inset ring-ink-500"
      style={{ width: size, height: size }}
    >
      {/* Provisional mark: a fast-cut bolt. Replaced when the real logo lands. */}
      <svg
        viewBox="0 0 24 24"
        width={size * 0.62}
        height={size * 0.62}
        aria-hidden="true"
        focusable="false"
      >
        {/* Flat fill on purpose: a gradient would need a document-unique id,
            and the mark is rendered several times per page. */}
        <path d="M13.9 2 4.6 13.4h5.2L9.3 22l9.3-11.4h-5.2L13.9 2Z" fill="#FF8A3D" />
      </svg>
      <span className="pointer-events-none absolute inset-0 rounded-[10px] ring-1 ring-inset ring-flame-500/20" />
    </span>
  )
}

export function Logo({
  size = 'md',
  to = '/',
  asLink = true,
}: {
  size?: 'sm' | 'md' | 'lg'
  to?: string
  asLink?: boolean
}) {
  const dims = { sm: 26, md: 32, lg: 40 }[size]
  const text = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' }[size]

  const inner = (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={dims} />
      <span className={`font-extrabold tracking-tight text-chalk ${text}`}>
        Fast<span className="text-blue-400">clip</span>
      </span>
    </span>
  )

  if (!asLink) return inner
  return (
    <Link to={to} className="rounded-lg" aria-label="Fastclip, accueil">
      {inner}
    </Link>
  )
}

// --- Button -----------------------------------------------------------------

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  // Orange is the main creative action; blue remains the structural colour.
  primary:
    'bg-gradient-to-br from-flame-500 to-flame-600 text-ink-900 font-semibold shadow-orange ring-1 ring-inset ring-flame-300/35 hover:from-flame-300 hover:to-flame-500 active:from-flame-600 active:to-flame-700',
  // A warmer, brighter orange for exports and final publishing actions.
  accent:
    'bg-gradient-to-br from-flame-300 to-flame-500 text-ink-900 font-semibold shadow-orange ring-1 ring-inset ring-white/20 hover:from-[#ffc09a] hover:to-flame-500 active:from-flame-500 active:to-flame-700',
  secondary:
    'bg-ink-600 text-chalk hover:bg-ink-500 active:bg-ink-500 ring-1 ring-inset ring-ink-400',
  ghost: 'text-muted hover:bg-ink-600 hover:text-chalk',
  danger:
    'bg-negative-700 text-negative-500 hover:bg-negative-600 hover:text-white ring-1 ring-inset ring-negative-600/60',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-[0.95rem] gap-2.5 rounded-xl',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: IconName
  iconRight?: IconName
  loading?: boolean
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon,
    iconRight,
    loading = false,
    block = false,
    className = '',
    children,
    disabled,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading
  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`inline-flex select-none items-center justify-center font-medium
        transition-[background-color,color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
        hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50
        ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === 'sm' ? 13 : 15} />
      ) : (
        icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />
      )}
      {children}
      {iconRight && !loading && <Icon name={iconRight} size={size === 'sm' ? 15 : 17} />}
    </button>
  )
})

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  className = '',
  ...rest
}: Omit<ButtonProps, 'icon' | 'children'> & { icon: IconName; label: string }) {
  const box = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  return (
    <button
      title={label}
      aria-label={label}
      className={`inline-grid place-items-center rounded-lg transition-colors duration-150
        disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${box} ${className}`}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 16 : 18} />
    </button>
  )
}

export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`animate-spin ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

// --- Status badge -----------------------------------------------------------

export function StatusBadge({
  status,
  size = 'md',
  showIcon = true,
}: {
  status: string
  size?: 'sm' | 'md'
  showIcon?: boolean
}) {
  const meta = statusMeta(status)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium
        ${TONE_CLASSES[meta.tone]}
        ${size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs'}`}
      title={meta.description}
    >
      {showIcon && (
        <Icon
          name={meta.icon}
          size={size === 'sm' ? 11 : 13}
          className={meta.busy ? 'animate-pulse-ring' : ''}
        />
      )}
      {meta.label}
    </span>
  )
}

// --- Progress ---------------------------------------------------------------

export function ProgressBar({
  value,
  tone = 'blue',
  label,
  size = 'md',
}: {
  value: number
  tone?: 'blue' | 'flame' | 'positive'
  label?: string
  size?: 'sm' | 'md'
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  const fill = {
    blue: 'bg-blue-500',
    flame: 'bg-flame-500',
    positive: 'bg-positive-500',
  }[tone]
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progression'}
      className={`w-full overflow-hidden rounded-full bg-ink-900 ring-1 ring-inset ring-ink-500
        ${size === 'sm' ? 'h-1.5' : 'h-2'}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out ${fill}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

// --- Fields -----------------------------------------------------------------

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string | null
  icon?: IconName
  trailing?: ReactNode
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, icon, trailing, className = '', id, required, ...rest },
  ref,
) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`

  return (
    <div className={className}>
      <label htmlFor={fieldId} className="label">
        {label}
        {required && (
          <span className="ml-1 text-flame-500" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (obligatoire)</span>}
      </label>
      <div className="relative">
        {icon && (
          <Icon
            name={icon}
            size={17}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
        )}
        <input
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={`field ${icon ? 'pl-10' : ''} ${trailing ? 'pr-11' : ''}
            ${error ? 'field-error' : ''}`}
          {...rest}
        />
        {trailing && (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</div>
        )}
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-xs text-negative-500">
          <Icon name="alert" size={13} className="mt-px" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="hint">
          {hint}
        </p>
      ) : null}
    </div>
  )
})

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
  error?: string | null
}

export function TextArea({ label, hint, error, className = '', id, ...rest }: TextAreaProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="label">
        {label}
      </label>
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={`field min-h-[84px] resize-y leading-relaxed ${error ? 'field-error' : ''}`}
        {...rest}
      />
      {error ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-negative-500">
          <Icon name="alert" size={13} className="mt-px" />
          {error}
        </p>
      ) : hint ? (
        <p className="hint">{hint}</p>
      ) : null}
    </div>
  )
}

/** Accessible segmented control used for subtitle style/size/position. */
export function SegmentedControl<T extends string>({
  legend,
  value,
  options,
  onChange,
  columns = 3,
}: {
  legend: string
  value: T
  options: { value: T; label: ReactNode; hint?: string }[]
  onChange: (value: T) => void
  columns?: number
}) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              title={option.hint}
              className={`rounded-lg border px-3 py-2 text-left text-xs font-medium
                transition-colors duration-150
                ${
                  active
                    ? 'border-blue-500 bg-blue-500/12 text-blue-400'
                    : 'border-ink-500 bg-ink-900/50 text-muted hover:border-ink-400 hover:text-chalk'
                }`}
            >
              <span className="flex items-center gap-1.5">
                {active && <Icon name="check" size={12} />}
                {option.label}
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

// --- Feedback surfaces ------------------------------------------------------

export function Alert({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success'
  title?: string
  children: ReactNode
  action?: ReactNode
}) {
  const config = {
    info: { cls: 'border-blue-500/40 bg-blue-500/8 text-blue-400', icon: 'info' as IconName },
    warning: {
      cls: 'border-flame-500/40 bg-flame-500/8 text-flame-500',
      icon: 'alert' as IconName,
    },
    error: {
      cls: 'border-negative-600/50 bg-negative-600/8 text-negative-500',
      icon: 'alert' as IconName,
    },
    success: {
      cls: 'border-positive-500/40 bg-positive-500/8 text-positive-500',
      icon: 'check' as IconName,
    },
  }[tone]

  return (
    <div className={`flex gap-3 rounded-xl border p-3.5 ${config.cls}`} role="status">
      <Icon name={config.icon} size={18} className="mt-0.5" />
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        <div className={`leading-relaxed text-chalk/90 ${title ? 'mt-1' : ''}`}>{children}</div>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: IconName
  title: string
  description: string
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="panel flex flex-col items-center px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-ink-500 bg-ink-800 text-blue-400">
        <Icon name={icon} size={26} />
      </span>
      <h3 className="mt-5 text-lg font-semibold text-chalk">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-6">{action}</div>}
      {children}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />
}

// --- Modal ------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  width?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      // Keep focus inside the dialog.
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
      )
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => {
      const panel = panelRef.current
      if (!panel) return
      // A form field is the useful landing spot; the close button is the
      // fallback for dialogs that only ask for a confirmation.
      const target =
        panel.querySelector<HTMLElement>('input:not([type="hidden"]),textarea,select') ??
        panel.querySelector<HTMLElement>('button:not([data-autofocus-skip])')
      target?.focus()
    }, 30)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
      window.clearTimeout(timer)
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 animate-fade-in bg-ink-900/80 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`panel relative w-full animate-fade-up shadow-lifted ${width}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-500 p-5">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-chalk">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
            )}
          </div>
          <IconButton icon="close" label="Fermer" size="sm" onClick={onClose} />
        </div>
        {children && <div className="p-5">{children}</div>}
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-ink-500 p-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Misc -------------------------------------------------------------------

export function Avatar({
  user,
  size = 36,
}: {
  user: { username: string; avatar_url: string | null }
  size?: number
}) {
  const initials = user.username.trim().slice(0, 2).toUpperCase() || '?'
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover ring-1 ring-ink-500"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="grid place-items-center rounded-full bg-blue-600 font-semibold text-white ring-1 ring-blue-400/30"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  )
}

export function Stat({
  icon,
  label,
  value,
  hint,
  tone = 'blue',
}: {
  icon: IconName
  label: string
  value: string
  hint?: string
  tone?: 'blue' | 'flame' | 'positive'
}) {
  const toneCls = {
    blue: 'text-blue-400 bg-blue-500/10 ring-blue-500/25',
    flame: 'text-flame-500 bg-flame-500/10 ring-flame-500/25',
    positive: 'text-positive-500 bg-positive-500/10 ring-positive-500/25',
  }[tone]
  return (
    <div className="panel p-5">
      <span className={`grid h-9 w-9 place-items-center rounded-lg ring-1 ring-inset ${toneCls}`}>
        <Icon name={icon} size={18} />
      </span>
      <p className="mt-4 text-2xl font-bold tracking-tight text-chalk tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm text-muted">{label}</p>
      {hint && <p className="mt-2 text-xs text-muted/80">{hint}</p>}
    </div>
  )
}
