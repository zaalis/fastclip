/** Formatting helpers. All user-facing strings are English. */

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

/** Timeline scrubber label with tenths, e.g. 1:04.3 */
export function formatPrecise(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.0'
  const minutes = Math.floor(seconds / 60)
  const rest = seconds - minutes * 60
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 MB'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** index
  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)} ${units[index]}`
}

export function formatSavedTime(seconds: number): string {
  if (seconds <= 0) return '0 min'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  const hours = seconds / 3600
  return `${hours.toFixed(hours >= 10 ? 0 : 1)} h`
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '-' : DATE_FORMAT.format(date)
}

export function formatRelative(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  const deltaSeconds = (date.getTime() - Date.now()) / 1000
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [604800, 'day'],
  ]
  let previous = 1
  for (const [limit, unit] of steps) {
    if (Math.abs(deltaSeconds) < limit) {
      return RELATIVE.format(Math.round(deltaSeconds / previous), unit)
    }
    previous = limit
  }
  return formatDate(iso)
}

/** Relative labels for the 24-hour retention countdown. */
export function formatExpiry(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const hours = (date.getTime() - Date.now()) / 3_600_000
  if (hours <= 0) return 'imminent'
  if (hours < 1) return `in ${Math.max(1, Math.round(hours * 60))} min`
  return `in ${Math.round(hours)} h`
}

export function languageLabel(code: string | null): string {
  if (!code) return 'Not detected'
  const names: Record<string, string> = {
    fr: 'French', en: 'English', es: 'Spanish', de: 'German', it: 'Italian',
    pt: 'Portuguese', nl: 'Dutch', ar: 'Arabic', ja: 'Japanese', zh: 'Chinese',
  }
  return names[code] ?? code.toUpperCase()
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}
