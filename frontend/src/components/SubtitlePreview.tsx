/**
 * WYSIWYG subtitle overlay.
 *
 * Extra #3 - the 9:16 preview mirrors the export: the same centre crop, the
 * same cue grouping, and CSS that maps 1:1 onto the ASS styles FFmpeg burns in
 * (font size, outline, box, alignment). What you see here is what lands in the
 * MP4, without waiting for an encode.
 */
export interface SubtitleAppearance {
  style: string
  size: string
  position: string
  accent: string
  font?: string
  effect?: string
}

/** Font sizes below match the ASS PlayResY=1280 sizes, scaled to the preview box. */
const SIZE_RATIO: Record<string, number> = {
  small: 0.0344, // 44 / 1280
  medium: 0.0438, // 56 / 1280
  large: 0.0547, // 70 / 1280
}

const POSITION_CLASS: Record<string, string> = {
  top: 'items-start pt-[10%]',
  middle: 'items-center',
  bottom: 'items-end pb-[14%]',
}

export function SubtitleOverlay({
  text,
  appearance,
  boxHeight,
}: {
  text: string | null
  appearance: SubtitleAppearance
  /** Pixel height of the preview frame, used to scale the type like FFmpeg does. */
  boxHeight: number
}) {
  if (!text) return null

  const fontSize = Math.max(11, boxHeight * (SIZE_RATIO[appearance.size] ?? SIZE_RATIO.medium))
  const display = appearance.style === 'punch' ? text.toUpperCase() : text
  const fontFamily = {
    sans: 'DejaVu Sans, Arial, sans-serif', bold: 'DejaVu Sans, Arial, sans-serif',
    serif: 'DejaVu Serif, Georgia, serif', mono: 'DejaVu Sans Mono, monospace',
  }[appearance.font ?? 'sans']

  const common: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    lineHeight: 1.22,
    maxWidth: '84%',
    textAlign: 'center',
    fontFamily,
  }

  let style: React.CSSProperties
  if (appearance.style === 'punch') {
    style = {
      ...common,
      color: '#FFFFFF',
      fontWeight: 700,
      letterSpacing: '0.01em',
      WebkitTextStroke: `${Math.max(1.5, fontSize * 0.075)}px #000000`,
      paintOrder: 'stroke fill',
      textShadow: '0 3px 10px rgba(0,0,0,0.55)',
    }
  } else if (appearance.style === 'accent' || appearance.style === 'neon') {
    style = {
      ...common,
      color: '#FFFFFF',
      fontWeight: 700,
      backgroundColor: appearance.accent,
      padding: `${fontSize * 0.16}px ${fontSize * 0.34}px`,
      borderRadius: `${fontSize * 0.12}px`,
      boxDecorationBreak: 'clone',
      WebkitBoxDecorationBreak: 'clone',
    }
  } else {
    style = {
      ...common,
      color: '#FFFFFF',
      fontWeight: 500,
      WebkitTextStroke: `${Math.max(0.8, fontSize * 0.035)}px rgba(0,0,0,0.9)`,
      paintOrder: 'stroke fill',
      textShadow: '0 2px 8px rgba(0,0,0,0.6)',
    }
  }

  if (appearance.effect === 'shadow') style.textShadow = '0 5px 14px rgba(0,0,0,0.82)'
  if (appearance.effect === 'outline') {
    style.WebkitTextStroke = `${Math.max(2, fontSize * 0.065)}px #000000`
    style.paintOrder = 'stroke fill'
  }
  if (appearance.effect === 'highlight') {
    style.backgroundColor = appearance.accent
    style.padding = `${fontSize * 0.16}px ${fontSize * 0.34}px`
    style.borderRadius = `${fontSize * 0.12}px`
  }

  return (
    <div
      className={`pointer-events-none absolute inset-0 flex justify-center px-[6%] ${
        POSITION_CLASS[appearance.position] ?? POSITION_CLASS.bottom
      }`}
      aria-hidden="true"
    >
      <span style={style}>{display}</span>
    </div>
  )
}

/** Small static swatch used in the style picker and the templates page. */
export function StyleSwatch({
  style,
  accent = '#FF8A3D',
  label = 'Aa',
}: {
  style: string
  accent?: string
  label?: string
}) {
  const base = 'grid h-12 place-items-center rounded-md border border-ink-500 bg-ink-900'
  if (style === 'punch') {
    return (
      <div className={base}>
        <span
          className="text-sm font-bold text-white"
          style={{ WebkitTextStroke: '2px #000', paintOrder: 'stroke fill' }}
        >
          {label.toUpperCase()}
        </span>
      </div>
    )
  }
  if (style === 'accent') {
    return (
      <div className={base}>
        <span
          className="rounded px-2 py-0.5 text-sm font-bold text-white"
          style={{ backgroundColor: accent }}
        >
          {label}
        </span>
      </div>
    )
  }
  return (
    <div className={base}>
      <span
        className="text-sm font-medium text-white"
        style={{ WebkitTextStroke: '0.7px rgba(0,0,0,0.9)', paintOrder: 'stroke fill' }}
      >
        {label}
      </span>
    </div>
  )
}
