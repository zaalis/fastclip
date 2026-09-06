/**
 * Single stroke-based SVG icon set (1.75 stroke, 24px grid, round caps).
 * No emoji anywhere in the product: emoji render differently per platform and
 * cannot be themed or given an accessible name.
 */
import type { SVGProps } from 'react'

export type IconName =
  | 'bolt'
  | 'draft'
  | 'upload'
  | 'clock'
  | 'wave'
  | 'sparkle'
  | 'film'
  | 'check'
  | 'alert'
  | 'stop'
  | 'dashboard'
  | 'plus'
  | 'folder'
  | 'captions'
  | 'help'
  | 'settings'
  | 'logout'
  | 'user'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'close'
  | 'play'
  | 'pause'
  | 'download'
  | 'copy'
  | 'trash'
  | 'edit'
  | 'more'
  | 'scissors'
  | 'shield'
  | 'arrow-right'
  | 'refresh'
  | 'menu'
  | 'lock'
  | 'mail'
  | 'eye'
  | 'eye-off'
  | 'image'
  | 'gauge'
  | 'target'
  | 'layers'
  | 'info'
  | 'language'

const PATHS: Record<IconName, JSX.Element> = {
  bolt: <path d="M13.5 3 5 13.5h5L9.5 21 18 10.5h-5L13.5 3Z" />,
  draft: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4 16v2a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  wave: (
    <>
      <path d="M4 12h1.5" />
      <path d="M8 8v8" />
      <path d="M12 5v14" />
      <path d="M16 8.5v7" />
      <path d="M19.5 11v2" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4L4.5 10.8 10.2 9 12 3.5Z" />
      <path d="M18.5 16.5 19.3 19l2.2.8-2.2.8-.8 2.4-.8-2.4-2.2-.8 2.2-.8.8-2.5Z" />
    </>
  ),
  film: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M8.5 4.5v15M15.5 4.5v15M3.5 12h17M3.5 8.2h5M3.5 15.8h5M15.5 8.2h5M15.5 15.8h5" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.8 3.8 19h16.4L12 4.8Z" />
      <path d="M12 10v3.6" />
      <path d="M12 16.4h.01" />
    </>
  ),
  stop: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.2" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  folder: (
    <path d="M3.5 7.2A2.2 2.2 0 0 1 5.7 5h3.1l2 2.4h7.5a2.2 2.2 0 0 1 2.2 2.2v7.2a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2V7.2Z" />
  ),
  captions: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M9.5 10.5a2.4 2.4 0 1 0 0 3M17 10.5a2.4 2.4 0 1 0 0 3" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.8 9.6a2.2 2.2 0 1 1 2.9 2.1c-.5.2-.8.7-.8 1.2v.5" />
      <path d="M12 16.6h.01" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="2.8" />
      <path d="M19.2 14.4a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1.5 1.5 0 0 0-2.5 1v.3a1.8 1.8 0 1 1-3.6 0v-.2a1.5 1.5 0 0 0-2.6-1l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.5 1.5 0 0 0-1-2.5H4.5a1.8 1.8 0 1 1 0-3.6h.2a1.5 1.5 0 0 0 1-2.6l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4V4.5a1.8 1.8 0 1 1 3.6 0v.2a1.5 1.5 0 0 0 2.5 1l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.5 1.5 0 0 0 1 2.5h.3a1.8 1.8 0 1 1 0 3.6h-.2a1.5 1.5 0 0 0-1.4.9Z" />
    </>
  ),
  logout: (
    <>
      <path d="M14.5 16.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6.5a2 2 0 0 1 2 2v2.5" />
      <path d="M10 12h10M17 9l3 3-3 3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  'chevron-left': <path d="m14.5 6-6 6 6 6" />,
  'chevron-right': <path d="m9.5 6 6 6-6 6" />,
  'chevron-down': <path d="m6 9.5 6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" />,
  pause: <path d="M9 5.5v13M15 5.5v13" />,
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4.5 18.5h15" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.2" />
      <path d="M15.5 5.6A2.1 2.1 0 0 0 13.4 4H6.6A2.6 2.6 0 0 0 4 6.6v6.8c0 .9.6 1.7 1.5 2" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.8h15" />
      <path d="M9.5 6.8V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2v1.6" />
      <path d="M6.8 6.8 7.7 19a1.6 1.6 0 0 0 1.6 1.5h5.4a1.6 1.6 0 0 0 1.6-1.5l.9-12.2" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </>
  ),
  edit: (
    <>
      <path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-3-3l-10 10v3Z" />
      <path d="m14.5 6.5 3 3" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5.5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="18.5" r="1.4" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <path d="M8.7 8.2 20 18M8.7 15.8 20 6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 5 6v5.5c0 4.4 2.9 7.6 7 9 4.1-1.4 7-4.6 7-9V6l-7-2.5Z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </>
  ),
  'arrow-right': <path d="M4.5 12h15M14 6.5l5.5 5.5L14 17.5" />,
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4.5V10h-5.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
      <path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.4" />
      <path d="m4.5 7.5 6.4 4.6a2 2 0 0 0 2.2 0l6.4-4.6" />
    </>
  ),
  eye: (
    <>
      <path d="M2.8 12S6 6.5 12 6.5 21.2 12 21.2 12 18 17.5 12 17.5 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M4 4.5 20 20" />
      <path d="M9.7 9.8a2.8 2.8 0 0 0 3.9 3.9" />
      <path d="M6.4 6.7C4.2 8.2 2.8 12 2.8 12s3.2 5.5 9.2 5.5c1.5 0 2.9-.4 4-.9" />
      <path d="M18.4 15.3c1.6-1.4 2.8-3.3 2.8-3.3S18 6.5 12 6.5c-.6 0-1.2.1-1.8.2" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.4" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4.5 17.5 4.6-4.3a1.8 1.8 0 0 1 2.4 0l4.3 4.3M14.5 14.2l1.6-1.5a1.8 1.8 0 0 1 2.4 0l1.9 1.8" />
    </>
  ),
  gauge: (
    <>
      <path d="M4.5 17.5a8.5 8.5 0 1 1 15 0" />
      <path d="m12 13 3.5-3.5" />
      <circle cx="12" cy="14" r="1.4" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3.5 8.5 4.7-8.5 4.7-8.5-4.7L12 3.5Z" />
      <path d="m4 12.5 8 4.4 8-4.4" />
      <path d="m4 16.5 8 4.4 8-4.4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.2" />
      <path d="M12 7.9h.01" />
    </>
  ),
  language: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.8 12h16.4M12 3.5c2.1 2.3 3.2 5.1 3.2 8.5S14.1 18.2 12 20.5C9.9 18.2 8.8 15.4 8.8 12S9.9 5.8 12 3.5Z" />
    </>
  ),
}

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
  /** Give a label when the icon is the only content; otherwise it stays decorative. */
  label?: string
}

export function Icon({ name, size = 20, label, className = '', ...rest }: IconProps) {
  const decorative = !label
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : 'img'}
      aria-label={label}
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
