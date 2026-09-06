import { useEffect, useRef } from 'react'

interface SlicedWavesProps {
  color1?: string
  color2?: string
  color3?: string
  columns?: number
  rows?: number
  speed?: number
  mouseInteraction?: boolean
  mouseStrength?: number
  mouseRadius?: number
  opacity?: number
  grain?: boolean
  grainIntensity?: number
  className?: string
}

function hexToRgb(hex: string) {
  const value = hex.replace('#', '')
  const complete = value.length === 3 ? value.split('').map((char) => char + char).join('') : value
  const parsed = Number.parseInt(complete, 16)
  return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 }
}

function mix(a: string, b: string, amount: number, alpha: number) {
  const first = hexToRgb(a)
  const second = hexToRgb(b)
  const t = Math.max(0, Math.min(1, amount))
  return `rgba(${Math.round(first.r + (second.r - first.r) * t)}, ${Math.round(first.g + (second.g - first.g) * t)}, ${Math.round(first.b + (second.b - first.b) * t)}, ${alpha})`
}

/**
 * Lightweight canvas interpretation of sliced waves. It is pointer-reactive,
 * DPR-capped and draws only transforms/pixels, keeping the auth forms responsive.
 */
export default function SlicedWaves({
  color1 = '#246BFD',
  color2 = '#FF8A3D',
  color3 = '#6EA8FF',
  columns = 14,
  rows = 8,
  speed = 0.35,
  mouseInteraction = true,
  mouseStrength = 1,
  mouseRadius = 0.3,
  opacity = 0.62,
  grain = true,
  grainIntensity = 0.035,
  className = '',
}: SlicedWavesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0 }
    let width = 0
    let height = 0
    let frame = 0
    let start = performance.now()
    let previousFrame = start

    const resize = () => {
      const box = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      width = Math.max(1, box.width)
      height = Math.max(1, box.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!mouseInteraction) return
      const box = canvas.getBoundingClientRect()
      pointer.tx = (event.clientX - box.left) / Math.max(1, box.width)
      pointer.ty = (event.clientY - box.top) / Math.max(1, box.height)
      pointer.active = 1
    }
    const onPointerLeave = () => {
      pointer.tx = 0.5
      pointer.ty = 0.5
      pointer.active = 0
    }

    const draw = (now: number) => {
      context.clearRect(0, 0, width, height)
      // Time-based easing keeps the cursor influence calm on all displays.
      const elapsed = Math.min(50, Math.max(0, now - previousFrame))
      previousFrame = now
      const easing = 1 - Math.exp((-elapsed / 1000) * 1.15)
      pointer.x += (pointer.tx - pointer.x) * easing
      pointer.y += (pointer.ty - pointer.y) * easing

      const time = reducedMotion.matches ? 0.8 : ((now - start) / 1000) * speed
      const columnWidth = width / Math.max(1, columns)
      const rowHeight = height / Math.max(1, rows)

      for (let row = 0; row < rows; row += 1) {
        for (let column = -1; column <= columns; column += 1) {
          const nx = (column + 0.5) / columns
          const ny = (row + 0.5) / rows
          const dx = nx - pointer.x
          const dy = ny - pointer.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          const influence = Math.max(0, 1 - distance / Math.max(0.05, mouseRadius))
          const wave =
            Math.sin(column * 0.72 + time * 2.1 + row * 0.88) * rowHeight * 0.26 +
            Math.cos(column * 0.28 - time * 1.25 + row) * rowHeight * 0.13
          const lift = influence * mouseStrength * rowHeight * 0.9 * (dy > 0 ? 1 : -1)
          const x = column * columnWidth
          const y = row * rowHeight + wave + lift
          const tilt = Math.sin(column * 0.5 + row + time) * rowHeight * 0.18
          const gap = Math.max(1.5, columnWidth * 0.11)

          context.beginPath()
          context.moveTo(x + gap, y)
          context.lineTo(x + columnWidth - gap, y + tilt)
          context.lineTo(x + columnWidth - gap, y + rowHeight * 0.58 + tilt)
          context.lineTo(x + gap, y + rowHeight * 0.58)
          context.closePath()

          const blend = (Math.sin(column * 0.42 + row * 0.7 + time) + 1) / 2
          const base = row % 3 === 0 ? color3 : color1
          context.fillStyle = mix(base, color2, blend * 0.82, opacity * (0.34 + influence * 0.4))
          context.shadowColor = mix(color1, color2, blend, 0.22)
          context.shadowBlur = 18 + influence * 20
          context.fill()
        }
      }

      context.shadowBlur = 0
      if (grain && grainIntensity > 0) {
        const count = Math.round(width * height * grainIntensity * 0.0012)
        context.fillStyle = 'rgba(255,255,255,0.14)'
        for (let index = 0; index < count; index += 1) {
          const seed = index * 91.73 + Math.floor(time * 8) * 17.1
          const x = (Math.sin(seed) * 0.5 + 0.5) * width
          const y = (Math.sin(seed * 1.618) * 0.5 + 0.5) * height
          context.fillRect(x, y, 0.7, 0.7)
        }
      }

      if (!reducedMotion.matches) frame = window.requestAnimationFrame(draw)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('blur', onPointerLeave)
    resize()
    draw(start)

    return () => {
      observer.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('blur', onPointerLeave)
      window.cancelAnimationFrame(frame)
      start = 0
    }
  }, [color1, color2, color3, columns, rows, speed, mouseInteraction, mouseStrength, mouseRadius, opacity, grain, grainIntensity])

  return (
    <canvas
      ref={canvasRef}
      className={`h-full w-full ${className}`}
      aria-hidden="true"
    />
  )
}
