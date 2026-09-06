import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { Icon } from '../components/Icon'
import { ScoreBreakdown } from '../components/ScoreBreakdown'
import { StyleSwatch, SubtitleOverlay } from '../components/SubtitlePreview'
import {
  Alert,
  Button,
  Field,
  IconButton,
  Modal,
  ProgressBar,
  SegmentedControl,
  Skeleton,
  TextArea,
} from '../components/ui'
import { useToast } from '../context/AppContext'
import {
  api,
  type CaptionTemplate,
  type Project,
  type Suggestion,
  type Transcript,
} from '../lib/api'
import { buildCues, cueAt, snapToSentence } from '../lib/cues'
import { formatPrecise } from '../lib/format'
import {
  SUBTITLE_POSITION_LABELS,
  SUBTITLE_SIZE_LABELS,
  SUBTITLE_STYLE_LABELS,
} from '../lib/status'

const MIN_CLIP = 3
const MAX_CLIP = 180

const ADVANCED_STYLES = [
  { value: 'clean', label: 'Classique' }, { value: 'punch', label: 'Impact' },
  { value: 'accent', label: 'Accent' }, { value: 'minimal', label: 'Minimal' },
  { value: 'neon', label: 'Néon' },
] as const
const FONTS = [
  { value: 'sans', label: 'Sans' }, { value: 'bold', label: 'Gras' },
  { value: 'serif', label: 'Sérif' }, { value: 'mono', label: 'Mono' },
] as const
const EFFECTS = [
  { value: 'none', label: 'Aucun' }, { value: 'shadow', label: 'Ombre' },
  { value: 'outline', label: 'Contour' }, { value: 'highlight', label: 'Surlignage' },
] as const
const SPEEDS = ['0.5', '0.75', '1', '1.25', '1.5', '2'] as const

const EXPORT_FORMATS = {
  vertical_hd: { label: 'Vertical HD', dimensions: '1080 × 1920', ratio: '9:16', aspect: '9 / 16' },
  vertical: { label: 'Vertical léger', dimensions: '720 × 1280', ratio: '9:16', aspect: '9 / 16' },
  square: { label: 'Carré', dimensions: '1080 × 1080', ratio: '1:1', aspect: '1 / 1' },
  landscape_hd: { label: 'Paysage HD', dimensions: '1920 × 1080', ratio: '16:9', aspect: '16 / 9' },
} as const
type ExportFormat = keyof typeof EXPORT_FORMATS

export default function Editor() {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams] = useSearchParams()
  const { notify, notifyError } = useToast()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [templates, setTemplates] = useState<CaptionTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // --- Clip parameters ---
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(30)
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [subtitleStyle, setSubtitleStyle] = useState('clean')
  const [subtitleSize, setSubtitleSize] = useState('medium')
  const [subtitlePosition, setSubtitlePosition] = useState('bottom')
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('vertical_hd')
  const [subtitleFont, setSubtitleFont] = useState('sans')
  const [subtitleEffect, setSubtitleEffect] = useState('none')
  const [playbackSpeed, setPlaybackSpeed] = useState('1')
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [cropX, setCropX] = useState(0)
  const [cropY, setCropY] = useState(0)
  const [cropZoom, setCropZoom] = useState(1)
  const [cropRotation, setCropRotation] = useState(0)
  const [activeSuggestion, setActiveSuggestion] = useState<Suggestion | null>(null)

  // --- Playback ---
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const cropStageRef = useRef<HTMLDivElement>(null)
  const cropDragRef = useRef<{ x: number; y: number; cropX: number; cropY: number } | null>(null)
  const cropResizeRef = useRef<{ x: number; zoom: number } | null>(null)
  const timelineDragRef = useRef<'selection' | 'playhead' | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [frameHeight, setFrameHeight] = useState(420)

  // --- Export ---
  const [exporting, setExporting] = useState(false)
  const [packExporting, setPackExporting] = useState(false)
  const [packInfoOpen, setPackInfoOpen] = useState(false)
  const [exportClipId, setExportClipId] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportStage, setExportStage] = useState('En attente dans la file')
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')

  const [accent, setAccent] = useState('#FF8A3D')
  const duration = end - start

  // --- Load ---------------------------------------------------------------
  useEffect(() => {
    let active = true
    if (!projectId) return

    ;(async () => {
      try {
        const [projectResponse, transcriptResponse, templatesResponse] = await Promise.all([
          api.projects.get(projectId),
          api.projects.transcript(projectId),
          api.templates.list().catch(() => ({ templates: [] })),
        ])
        if (!active) return

        const next = projectResponse.project
        setProject(next)
        setTranscript(transcriptResponse.transcript)
        setTemplates(templatesResponse.templates)

        const wanted = searchParams.get('suggestion')
        const suggestions = next.suggestions ?? []
        const chosen =
          suggestions.find((item) => item.id === wanted) ??
          suggestions.slice().sort((a, b) => b.score - a.score)[0] ??
          null

        if (chosen) {
          applySuggestion(chosen, next)
        } else {
          setEnd(Math.min(30, next.duration_seconds || 30))
          setTitle(next.name)
        }

        const preset = templatesResponse.templates.find((item) => item.is_default)
        if (preset) {
          setSubtitleStyle(preset.style)
          setSubtitleSize(preset.size)
          setSubtitlePosition(preset.position)
        }
      } catch (error) {
        if (active)
          setLoadError(
            error instanceof Error ? error.message : 'Impossible de charger le projet.',
          )
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  function applySuggestion(suggestion: Suggestion, source?: Project) {
    const total = (source ?? project)?.duration_seconds ?? suggestion.end_seconds
    setActiveSuggestion(suggestion)
    setStart(Math.max(0, suggestion.start_seconds))
    setEnd(Math.min(total, suggestion.end_seconds))
    setTitle(suggestion.title)
    setCaption(suggestion.suggested_caption)
    setHashtags(suggestion.hashtags.join(' '))
    seek(suggestion.start_seconds)
  }

  // --- Preview frame sizing ------------------------------------------------
  useLayoutEffect(() => {
    const element = frameRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) =>
      setFrameHeight(entry.contentRect.height || 420),
    )
    observer.observe(element)
    setFrameHeight(element.getBoundingClientRect().height || 420)
    return () => observer.disconnect()
  }, [loading])

  // The editing canvas owns the wheel: changing scale must never scroll the page.
  useEffect(() => {
    const stage = cropStageRef.current
    if (!stage) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const increment = event.deltaY < 0 ? 0.08 : -0.08
      setCropZoom((value) => Math.max(1, Math.min(2.5, Number((value + increment).toFixed(2)))))
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [loading])

  // --- Playback constrained to the trim window -----------------------------
  const seek = useCallback((time: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = time
    setCurrentTime(time)
  }, [])

  const beginCropDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = cropStageRef.current
    if (!stage) return
    event.currentTarget.setPointerCapture(event.pointerId)
    cropDragRef.current = { x: event.clientX, y: event.clientY, cropX, cropY }
  }
  const moveCropDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = cropStageRef.current
    const drag = cropDragRef.current
    if (!stage || !drag) return
    const rect = stage.getBoundingClientRect()
    setCropX(Math.max(-1, Math.min(1, drag.cropX - ((event.clientX - drag.x) / rect.width) * 2)))
    setCropY(Math.max(-1, Math.min(1, drag.cropY - ((event.clientY - drag.y) / rect.height) * 2)))
  }
  const endCropDrag = () => { cropDragRef.current = null }
  const beginCropResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    cropResizeRef.current = { x: event.clientX, zoom: cropZoom }
  }
  const moveCropResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const resize = cropResizeRef.current
    const stage = cropStageRef.current
    if (!resize || !stage) return
    setCropZoom(Math.max(1, Math.min(2.5, resize.zoom + ((event.clientX - resize.x) / stage.getBoundingClientRect().width) * 2)))
  }
  const moveTimeline = (event: React.PointerEvent<HTMLButtonElement>) => {
    const kind = timelineDragRef.current
    if (!kind) return
    const rect = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!rect) return
    const time = Math.max(0, Math.min(total, ((event.clientX - rect.left) / rect.width) * total))
    if (kind === 'playhead') seek(Math.max(start, Math.min(end, time)))
    else {
      const clipDuration = end - start
      const nextStart = Math.max(0, Math.min(total - clipDuration, time - clipDuration / 2))
      setStart(nextStart)
      setEnd(nextStart + clipDuration)
      seek(nextStart)
    }
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      if (video.currentTime >= end - 0.03) {
        video.pause()
        video.currentTime = start
        setPlaying(false)
      }
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
    }
  }, [start, end])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      if (video.currentTime < start || video.currentTime > end - 0.05) video.currentTime = start
      void video.play()
    } else {
      video.pause()
    }
  }

  // --- Derived -------------------------------------------------------------
  const segments = transcript?.segments ?? []
  const cues = useMemo(() => buildCues(segments, start, end), [segments, start, end])
  const relativeTime = Math.max(0, currentTime - start)
  const activeCue = subtitlesEnabled ? cueAt(cues, relativeTime) : null
  const total = project?.duration_seconds ?? 0
  const selectedFormat = EXPORT_FORMATS[exportFormat]

  const clampStart = (value: number) =>
    setStart(Math.max(0, Math.min(value, end - MIN_CLIP)))
  const clampEnd = (value: number) => setEnd(Math.min(total, Math.max(value, start + MIN_CLIP)))

  const durationError =
    duration < MIN_CLIP
      ? `Le clip doit durer au moins ${MIN_CLIP} secondes.`
      : duration > MAX_CLIP
        ? `Le clip ne peut pas dépasser ${MAX_CLIP / 60} minutes.`
        : null

  const durationTone =
    duration >= 20 && duration <= 60
      ? 'text-positive-500'
      : durationError
        ? 'text-negative-500'
        : 'text-flame-500'

  // --- Export --------------------------------------------------------------
  const generate = async () => {
    if (!project || durationError) return
    setExporting(true)
    setExportProgress(0)
    setExportStage('En attente dans la file')
    try {
      const { clip } = await api.clips.create(project.id, {
        suggestion_id: activeSuggestion?.id ?? null,
        start_seconds: Number(start.toFixed(2)),
        end_seconds: Number(end.toFixed(2)),
        title: title.trim() || project.name,
        caption: caption.trim(),
        hashtags: hashtags
          .split(/[\s,]+/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        subtitle_style: subtitleStyle,
        subtitle_size: subtitleSize,
        subtitle_position: subtitlePosition,
        subtitle_accent: accent,
        subtitles_enabled: subtitlesEnabled,
        export_format: exportFormat,
        subtitle_font: subtitleFont,
        subtitle_effect: subtitleEffect,
        playback_speed: Number(playbackSpeed),
        crop_x: cropX,
        crop_y: cropY,
        crop_zoom: cropZoom,
        crop_rotation: cropRotation,
      })
      setExportClipId(clip.id)
      notify('Génération lancée. Tu peux suivre la progression ici.')
    } catch (error) {
      setExporting(false)
      notifyError(error, 'Impossible de lancer la génération.')
    }
  }

  const generatePack = async () => {
    if (!project || durationError) return
    setPackExporting(true)
    const base = {
      suggestion_id: activeSuggestion?.id ?? null, start_seconds: Number(start.toFixed(2)), end_seconds: Number(end.toFixed(2)),
      title: title.trim() || project.name, caption: caption.trim(), hashtags: hashtags.split(/[\s,]+/).map((tag) => tag.trim()).filter(Boolean),
      subtitle_style: subtitleStyle, subtitle_size: subtitleSize, subtitle_position: subtitlePosition, subtitle_accent: accent,
      subtitles_enabled: subtitlesEnabled, subtitle_font: subtitleFont, subtitle_effect: subtitleEffect, playback_speed: Number(playbackSpeed),
      crop_x: cropX, crop_y: cropY, crop_zoom: cropZoom, crop_rotation: cropRotation,
    }
    try {
      await Promise.all((['vertical_hd', 'square', 'landscape_hd'] as const).map((export_format) => api.clips.create(project.id, { ...base, export_format })))
      notify('Pack complet lancé : vertical HD, carré et paysage HD sont dans la file.')
      navigate(`/app/projets/${project.id}`)
    } catch (error) {
      notifyError(error, 'Impossible de lancer le pack complet.')
    } finally { setPackExporting(false) }
  }

  useEffect(() => {
    if (!exportClipId) return
    const timer = window.setInterval(async () => {
      try {
        const { clip } = await api.clips.get(exportClipId)
        setExportProgress(clip.progress)
        setExportStage(clip.stage_detail ?? 'Traitement en cours')
        if (clip.status === 'completed') {
          window.clearInterval(timer)
          setExporting(false)
          notify('Ton Short est prêt !')
          navigate(`/app/projets/${clip.project_id}`)
        } else if (clip.status === 'failed' || clip.status === 'cancelled') {
          window.clearInterval(timer)
          setExporting(false)
          setExportClipId(null)
          notifyError(
            new Error(clip.error_message ?? 'La génération a été interrompue.'),
            'La génération a échoué.',
          )
        }
      } catch {
        /* transient network hiccup: the next tick retries */
      }
    }, 1500)
    return () => window.clearInterval(timer)
  }, [exportClipId, navigate, notify, notifyError])

  const cancelExport = async () => {
    if (!exportClipId) return
    try {
      await api.clips.cancel(exportClipId)
      notify('Annulation demandée.')
    } catch (error) {
      notifyError(error, 'Annulation impossible.')
    }
  }

  const saveTemplate = async () => {
    if (!templateName.trim()) return
    try {
      const { template } = await api.templates.create({
        name: templateName.trim(),
        style: subtitleStyle,
        size: subtitleSize,
        position: subtitlePosition,
        accent_color: accent,
        is_default: false,
      })
      setTemplates((current) => [...current, template])
      setSaveTemplateOpen(false)
      setTemplateName('')
      notify('Modèle de sous-titres enregistré.')
    } catch (error) {
      notifyError(error, 'Enregistrement impossible.')
    }
  }

  // --- Render --------------------------------------------------------------
  if (loading) {
    return (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <Skeleton className="h-[32rem]" />
        <Skeleton className="h-[32rem]" />
      </div>
    )
  }

  if (loadError || !project) {
    return (
      <Alert tone="error" title="Éditeur indisponible">
        {loadError ?? 'Projet introuvable.'}
        <div className="mt-3">
          <Link to="/app/projets">
            <Button variant="secondary" size="sm" icon="chevron-left">
              Retour aux projets
            </Button>
          </Link>
        </div>
      </Alert>
    )
  }

  if (!project.video_url) {
    return (
      <Alert tone="warning" title="Vidéo source indisponible">
        Le fichier source de ce projet a été supprimé automatiquement après 24
        heures. Réimporte la vidéo pour créer un nouveau Short.
        <div className="mt-3">
          <Link to="/app/nouveau">
            <Button variant="secondary" size="sm" icon="upload">
              Importer une vidéo
            </Button>
          </Link>
        </div>
      </Alert>
    )
  }

  const suggestions = project.suggestions ?? []

  return (
    <div className="space-y-5">
      {/* --- Header --- */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/app/projets/${project.id}`}
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-chalk"
          >
            <Icon name="chevron-left" size={13} />
            {project.name}
          </Link>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-chalk sm:text-2xl">
            Éditeur de clip
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-400 sm:inline-flex">
            <Icon name="target" size={13} />
            {selectedFormat.ratio} &middot; {selectedFormat.dimensions}
          </span>
        </div>
      </header>

      {/* Editor is desktop-first: say so rather than degrading silently. */}
      <div className="xl:hidden">
        <Alert tone="info" title="Éditeur pensé pour le desktop">
          Tu peux ajuster les réglages ici, mais la timeline et la transcription
          synchronisée sont bien plus confortables sur un grand écran.
        </Alert>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Proposition :</span>
          {suggestions
            .slice()
            .sort((a, b) => a.rank - b.rank)
            .map((suggestion, index) => {
              const active = activeSuggestion?.id === suggestion.id
              return (
                <button
                  key={suggestion.id}
                  onClick={() => applySuggestion(suggestion)}
                  aria-pressed={active}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors
                    ${
                      active
                        ? 'border-blue-500 bg-blue-500/12 text-blue-400'
                        : 'border-ink-500 bg-ink-800 text-muted hover:border-ink-400 hover:text-chalk'
                    }`}
                >
                  {active && <Icon name="check" size={12} />}
                  <span>#{index + 1}</span>
                  <span className="max-w-[10rem] truncate">{suggestion.title}</span>
                  <span className="tabular-nums opacity-70">{suggestion.score}</span>
                </button>
              )
            })}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
        {/* --- Preview + timeline --- */}
        <div className="space-y-5">
          <section className="panel p-5">
            <div className="flex flex-col gap-5">
              {/* WYSIWYG frame for the selected export format */}
              <div className="mx-auto w-full max-w-[48rem] shrink-0">
                <div
                  ref={cropStageRef}
                  className="relative max-h-[32rem] overscroll-contain overflow-hidden rounded-xl border border-ink-500 bg-ink-800 shadow-lifted"
                  style={{ aspectRatio: `${project.width || 16} / ${project.height || 9}` }}
                >
                  <video
                    src={project.video_url}
                    playsInline muted preload="metadata"
                    className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-35 blur-[2px]"
                    aria-hidden="true"
                  />
                  <div
                    ref={frameRef}
                    onPointerDown={beginCropDrag}
                    onPointerMove={moveCropDrag}
                    onPointerUp={endCropDrag}
                    onPointerCancel={endCropDrag}
                    className="absolute left-1/2 top-1/2 cursor-grab touch-none overflow-hidden border-2 border-blue-400 shadow-[0_0_0_999px_rgba(4,8,15,.10)] active:cursor-grabbing"
                    style={{ width: '72%', aspectRatio: selectedFormat.aspect, transform: `translate(-50%, -50%) rotate(${cropRotation}deg)` }}
                    role="slider" tabIndex={0} aria-label="Déplacer le cadrage"
                    aria-valuetext={`Cadrage horizontal ${Math.round(cropX * 100)}%, vertical ${Math.round(cropY * 100)}%`}
                    onKeyDown={(event) => {
                      const step = event.shiftKey ? 0.1 : 0.03
                      if (event.key === 'ArrowLeft') setCropX((value) => Math.max(-1, value - step))
                      if (event.key === 'ArrowRight') setCropX((value) => Math.min(1, value + step))
                      if (event.key === 'ArrowUp') setCropY((value) => Math.max(-1, value - step))
                      if (event.key === 'ArrowDown') setCropY((value) => Math.min(1, value + step))
                    }}
                  >
                    <video
                    ref={videoRef}
                    src={project.video_url}
                    playsInline
                    preload="metadata"
                    className="pointer-events-none h-full w-full object-cover"
                    style={{ objectPosition: `${50 + cropX * 50}% ${50 + cropY * 50}%`, transform: `scale(${cropZoom})` }}
                    onLoadedMetadata={() => seek(start)}
                    aria-label="Aperçu vertical du clip"
                  />
                  <SubtitleOverlay
                    text={activeCue?.text ?? null}
                    boxHeight={frameHeight}
                    appearance={{
                      style: subtitleStyle,
                      size: subtitleSize,
                      position: subtitlePosition,
                      accent,
                      font: subtitleFont,
                      effect: subtitleEffect,
                    }}
                  />
                  <span className="absolute left-2 top-2 rounded bg-ink-900/80 px-1.5 py-0.5 text-2xs font-medium text-chalk">
                    {selectedFormat.ratio}
                  </span>
                  {(['left-0 top-0', 'right-0 top-0', 'bottom-0 left-0', 'bottom-0 right-0'] as const).map((position) => (
                    <button key={position} type="button" aria-label="Redimensionner le cadrage" title="Glisser pour zoomer"
                      onPointerDown={beginCropResize} onPointerMove={moveCropResize} onPointerUp={() => { cropResizeRef.current = null }}
                      className={`absolute z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-full border-2 border-white bg-blue-500 shadow-sm focus-visible:ring-2 focus-visible:ring-blue-300 ${position}`} />
                  ))}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-ink-500 bg-ink-900/55 p-3 text-xs text-muted">
                  <label className="min-w-0"><span className="flex items-center justify-between"><span>Zoom</span><output className="font-semibold tabular-nums text-chalk">{Math.round(cropZoom * 100)} %</output></span><input aria-label="Zoom vidéo" type="range" min="1" max="2.5" step="0.01" value={cropZoom} onChange={(event) => setCropZoom(Number(event.target.value))} className="mt-2 w-full" /></label>
                  <label className="min-w-0"><span className="flex items-center justify-between"><span>Rotation</span><output className="font-semibold tabular-nums text-chalk">{cropRotation}°</output></span><input aria-label="Rotation vidéo" type="range" min="-20" max="20" step="1" value={cropRotation} onChange={(event) => setCropRotation(Number(event.target.value))} className="mt-2 w-full" /></label>
                </div>
                <p className="mt-2 text-center text-2xs text-muted">Molette : zoomer ou dézoomer · Glisser le cadre : déplacer · Poignées : zoomer</p>

                <div className="mt-3 flex items-center justify-center gap-2">
                  <IconButton
                    icon="chevron-left"
                    label="Reculer d’une seconde"
                    size="sm"
                    variant="secondary"
                    onClick={() => seek(Math.max(start, currentTime - 1))}
                  />
                  <Button
                    icon={playing ? 'pause' : 'play'}
                    onClick={togglePlay}
                    aria-label={playing ? 'Mettre en pause' : 'Lire l’extrait'}
                  >
                    {playing ? 'Pause' : 'Lire'}
                  </Button>
                  <IconButton
                    icon="chevron-right"
                    label="Avancer d’une seconde"
                    size="sm"
                    variant="secondary"
                    onClick={() => seek(Math.min(end, currentTime + 1))}
                  />
                </div>
                <p className="mt-2 text-center text-xs tabular-nums text-muted">
                  {formatPrecise(relativeTime)} / {formatPrecise(duration)}
                </p>
              </div>

              {/* Trim controls */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-chalk">Limites de l’extrait</h2>
                  <span className={`text-sm font-bold tabular-nums ${durationTone}`}>
                    {duration.toFixed(1)} s
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Durée idéale pour un Short : 20 à 60 secondes.
                </p>

                {/* Timeline */}
                <div className="mt-4">
                  <div className="relative h-20 overflow-hidden rounded-lg border border-ink-500 bg-ink-900">
                    {/* Speech blocks give the timeline real meaning. */}
                    {segments.map((segment) => (
                      <span
                        key={segment.id}
                        className="absolute top-1/2 h-6 -translate-y-1/2 rounded-sm bg-ink-500"
                        style={{
                          left: `${(segment.start / Math.max(1, total)) * 100}%`,
                          width: `${Math.max(
                            0.35,
                            ((segment.end - segment.start) / Math.max(1, total)) * 100,
                          )}%`,
                        }}
                        aria-hidden="true"
                      />
                    ))}
                    {/* Selection */}
                    <button
                      type="button"
                      aria-label="Déplacer la sélection bleue"
                      title="Glisser pour déplacer l’extrait"
                      onPointerDown={(event) => { timelineDragRef.current = 'selection'; event.currentTarget.setPointerCapture(event.pointerId) }}
                      onPointerMove={moveTimeline}
                      onPointerUp={() => { timelineDragRef.current = null }}
                      className="absolute inset-y-1 z-10 cursor-grab rounded border-x-2 border-blue-400 bg-blue-500/20 shadow-[0_0_18px_rgba(59,130,246,.28)] active:cursor-grabbing"
                      style={{
                        left: `${(start / Math.max(1, total)) * 100}%`,
                        width: `${((end - start) / Math.max(1, total)) * 100}%`,
                      }}
                    ><span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-blue-500 px-1.5 py-0.5 text-2xs font-semibold text-white">Extrait</span></button>
                    {/* Playhead */}
                    <button type="button" aria-label="Déplacer le curseur orange" title="Glisser la tête de lecture"
                      onPointerDown={(event) => { timelineDragRef.current = 'playhead'; event.currentTarget.setPointerCapture(event.pointerId) }}
                      onPointerMove={moveTimeline} onPointerUp={() => { timelineDragRef.current = null }}
                      className="absolute inset-y-0 z-20 w-3 -translate-x-1/2 cursor-ew-resize"
                      style={{ left: `${(currentTime / Math.max(1, total)) * 100}%` }}
                    ><span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-flame-500 shadow-[0_0_8px_rgba(255,138,61,.9)]" /></button>
                    <button
                      className="absolute inset-0 z-[1] cursor-pointer"
                      aria-label="Déplacer la lecture dans la timeline"
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect()
                        const ratio = (event.clientX - rect.left) / rect.width
                        seek(Math.max(start, Math.min(end, ratio * total)))
                      }}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-2xs tabular-nums text-muted">
                    <span>0:00</span>
                    <span>{formatPrecise(total)}</span>
                  </div>
                </div>

                {/* Handles: sliders are keyboard-operable by default. */}
                <div className="mt-5 space-y-4">
                  {(
                    [
                      ['Début', start, clampStart, 'start'],
                      ['Fin', end, clampEnd, 'end'],
                    ] as const
                  ).map(([label, value, setter, edge]) => (
                    <div key={label}>
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor={`handle-${edge}`}
                          className="text-xs font-medium text-chalk"
                        >
                          {label}
                        </label>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs tabular-nums text-muted">
                            {formatPrecise(value)}
                          </span>
                          <button
                            onClick={() => setter(snapToSentence(segments, value, edge))}
                            title="Aligner sur la phrase la plus proche"
                            className="rounded-md border border-ink-500 px-1.5 py-0.5 text-2xs text-muted transition-colors hover:border-blue-500 hover:text-blue-400"
                          >
                            Aligner
                          </button>
                          <button
                            onClick={() => setter(currentTime)}
                            title="Utiliser la position de lecture actuelle"
                            className="rounded-md border border-ink-500 px-1.5 py-0.5 text-2xs text-muted transition-colors hover:border-blue-500 hover:text-blue-400"
                          >
                            Ici
                          </button>
                        </div>
                      </div>
                      <input
                        id={`handle-${edge}`}
                        type="range"
                        min={0}
                        max={Math.max(1, total)}
                        step={0.1}
                        value={value}
                        onChange={(event) => setter(Number(event.target.value))}
                        className="mt-2 w-full"
                        aria-valuetext={`${formatPrecise(value)} secondes`}
                      />
                    </div>
                  ))}
                </div>

                {durationError && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-negative-500">
                    <Icon name="alert" size={13} />
                    {durationError}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* --- Synced transcript --- */}
          <section className="panel">
            <div className="flex items-center justify-between border-b border-ink-500 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-chalk">Transcription synchronisée</h2>
              <span className="text-xs text-muted">
                Clic sur une phrase pour déplacer la lecture
              </span>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {segments.length === 0 ? (
                <p className="p-4 text-sm text-muted">
                  Aucune transcription disponible pour ce projet.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {segments.map((segment) => {
                    const inRange = segment.end > start && segment.start < end
                    const isActive =
                      currentTime >= segment.start && currentTime <= segment.end
                    return (
                      <li key={segment.id}>
                        <div
                          className={`group flex gap-3 rounded-lg px-3 py-2 transition-colors
                            ${isActive ? 'bg-blue-500/12' : inRange ? 'bg-ink-800' : ''}`}
                        >
                          <button
                            onClick={() => seek(segment.start)}
                            className={`shrink-0 text-2xs tabular-nums transition-colors
                              ${isActive ? 'text-blue-400' : 'text-muted hover:text-blue-400'}`}
                          >
                            {formatPrecise(segment.start)}
                          </button>
                          <p
                            className={`flex-1 text-sm leading-relaxed
                              ${inRange ? 'text-chalk' : 'text-muted/70'}`}
                          >
                            {segment.text}
                          </p>
                          <span className="flex shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                            <button
                              onClick={() => clampStart(segment.start)}
                              className="rounded border border-ink-500 px-1.5 py-0.5 text-2xs text-muted hover:border-blue-500 hover:text-blue-400"
                              title="Démarrer le clip ici"
                            >
                              Début
                            </button>
                            <button
                              onClick={() => clampEnd(segment.end)}
                              className="rounded border border-ink-500 px-1.5 py-0.5 text-2xs text-muted hover:border-blue-500 hover:text-blue-400"
                              title="Terminer le clip ici"
                            >
                              Fin
                            </button>
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* --- Settings rail --- */}
        <aside className="space-y-5">
          {activeSuggestion && (
            <section className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xs font-medium uppercase tracking-wide text-muted">
                    {activeSuggestion.category}
                  </p>
                  <h2 className="mt-1 text-sm font-semibold leading-snug text-chalk">
                    {activeSuggestion.title}
                  </h2>
                </div>
                <span className="text-2xl font-extrabold tabular-nums text-blue-400">
                  {activeSuggestion.score}
                </span>
              </div>
              {activeSuggestion.reason && (
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  {activeSuggestion.reason}
                </p>
              )}
              <div className="mt-4">
                <ScoreBreakdown breakdown={activeSuggestion.score_breakdown} />
              </div>
            </section>
          )}

          <section className="panel space-y-5 p-5">
            <div>
              <h2 className="text-sm font-semibold text-chalk">Format d’export</h2>
              <p className="mt-1 text-xs text-muted">Le cadrage et la résolution de l’export suivent ce choix.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(Object.entries(EXPORT_FORMATS) as [ExportFormat, (typeof EXPORT_FORMATS)[ExportFormat]][]).map(([value, format]) => {
                  const active = exportFormat === value
                  return (
                    <button key={value} type="button" onClick={() => setExportFormat(value)} aria-pressed={active}
                      className={`rounded-lg border p-2 text-left transition-colors ${active ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-ink-500 text-muted hover:border-ink-400 hover:text-chalk'}`}>
                      <span className="block text-xs font-semibold">{format.label}</span>
                      <span className="mt-0.5 block text-2xs tabular-nums opacity-80">{format.ratio} · {format.dimensions}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="panel space-y-5 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-chalk">Sous-titres</h2>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={subtitlesEnabled}
                  onChange={(event) => setSubtitlesEnabled(event.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-ink-400 bg-ink-900 text-blue-600 focus:ring-2 focus:ring-blue-500/40"
                />
                Incruster
              </label>
            </div>

            {templates.length > 0 && (
              <div>
                <p className="label">Modèles enregistrés</p>
                <div className="flex flex-wrap gap-1.5">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => {
                        setSubtitleStyle(template.style)
                        setSubtitleSize(template.size)
                        setSubtitlePosition(template.position)
                        notify(`Modèle « ${template.name} » applique.`)
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-2xs text-muted transition-colors hover:border-blue-500 hover:text-blue-400"
                    >
                      {template.is_default && <Icon name="check" size={10} />}
                      {template.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <fieldset disabled={!subtitlesEnabled} className="space-y-4 disabled:opacity-50">
              <div>
                <p className="label">Style</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['clean', 'punch', 'accent'] as const).map((value) => {
                    const active = subtitleStyle === value
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSubtitleStyle(value)}
                        aria-pressed={active}
                        title={SUBTITLE_STYLE_LABELS[value].hint}
                        className={`rounded-lg border p-2 text-left transition-colors
                          ${
                            active
                              ? 'border-blue-500 bg-blue-500/10'
                              : 'border-ink-500 hover:border-ink-400'
                          }`}
                      >
                        <StyleSwatch style={value} accent={accent} />
                        <span
                          className={`mt-1.5 flex items-center gap-1 text-2xs font-medium ${
                            active ? 'text-blue-400' : 'text-muted'
                          }`}
                        >
                          {active && <Icon name="check" size={10} />}
                          {SUBTITLE_STYLE_LABELS[value].name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <SegmentedControl
                legend="Taille"
                value={subtitleSize}
                onChange={setSubtitleSize}
                options={(['small', 'medium', 'large'] as const).map((value) => ({
                  value,
                  label: SUBTITLE_SIZE_LABELS[value],
                }))}
              />

              <Button variant="ghost" size="sm" icon="plus" block onClick={() => setCustomizeOpen(true)}>
                Plus de styles, polices et effets
              </Button>

              <SegmentedControl
                legend="Position"
                value={subtitlePosition}
                onChange={setSubtitlePosition}
                options={(['top', 'middle', 'bottom'] as const).map((value) => ({
                  value,
                  label: SUBTITLE_POSITION_LABELS[value],
                }))}
              />

              <Button
                variant="ghost"
                size="sm"
                icon="captions"
                block
                onClick={() => setSaveTemplateOpen(true)}
              >
                Enregistrer ce style
              </Button>
            </fieldset>
          </section>

          <section className="panel space-y-4 p-5">
            <h2 className="text-sm font-semibold text-chalk">Publication</h2>
            <Field
              label="Titre"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              hint="Sert aussi de nom au fichier téléchargé."
            />
            <TextArea
              label="Légende"
              value={caption}
              maxLength={2000}
              rows={4}
              onChange={(event) => setCaption(event.target.value)}
              hint="Copiable en un clic après la génération."
            />
            <Field
              label="Hashtags"
              value={hashtags}
              placeholder="#conseil #créateur #shorts"
              onChange={(event) => setHashtags(event.target.value)}
              hint="Séparés par des espaces."
            />
          </section>

          <section className="panel p-5">
            {exporting ? (
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-chalk">
                    <Icon name="film" size={16} className="animate-pulse-ring text-flame-500" />
                    Génération en cours
                  </span>
                  <span className="font-semibold tabular-nums text-chalk">
                    {exportProgress}%
                  </span>
                </div>
                <div className="mt-2.5">
                  <ProgressBar value={exportProgress} tone="flame" label="Génération du Short" />
                </div>
                <p className="mt-2 text-xs text-muted">{exportStage}</p>
                <Button
                  className="mt-4"
                  variant="secondary"
                  size="sm"
                  icon="stop"
                  block
                  onClick={cancelExport}
                >
                  Annuler la génération
                </Button>
              </div>
            ) : (
              <>
                <Button
                  variant="accent"
                  size="lg"
                  icon="bolt"
                  block
                  disabled={Boolean(durationError)}
                  onClick={generate}
                >
                  Générer mon Short
                </Button>
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="secondary" size="md" icon="layers" block loading={packExporting} disabled={Boolean(durationError)} onClick={generatePack}>
                    Pack complet
                  </Button>
                  <IconButton icon="info" label="À propos du pack complet" variant="secondary" onClick={() => setPackInfoOpen(true)} />
                </div>
                <ul className="mt-4 space-y-1.5 text-xs text-muted">
                  {[
                    `MP4 ${selectedFormat.ratio} · ${selectedFormat.dimensions}, H.264`,
                    subtitlesEnabled
                      ? `Sous-titres incrustés (${cues.length} blocs)`
                      : 'Sans sous-titres incrustés',
                    'Fichier .srt généré en plus',
                  ].map((line) => (
                    <li key={line} className="flex items-center gap-1.5">
                      <Icon name="check" size={12} className="text-positive-500" />
                      {line}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </aside>
      </div>

      <Modal
        open={packInfoOpen}
        onClose={() => setPackInfoOpen(false)}
        title="Pack complet"
        description="Un même montage, prêt pour les principaux placements sociaux."
        footer={<Button onClick={() => setPackInfoOpen(false)}>Compris</Button>}
      >
        <div className="space-y-3">
          {[
            ['Vertical HD', '1080 × 1920 · Reels, TikTok, Shorts'],
            ['Carré', '1080 × 1080 · Feed Instagram et LinkedIn'],
            ['Paysage HD', '1920 × 1080 · YouTube et X'],
          ].map(([name, detail]) => <div key={name} className="flex items-center gap-3 rounded-xl border border-ink-500 bg-ink-900/60 p-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-500/10 text-blue-400"><Icon name="film" size={17} /></span><p><span className="block text-sm font-semibold text-chalk">{name}</span><span className="text-xs text-muted">{detail}</span></p></div>)}
          <p className="text-xs leading-relaxed text-muted">Les trois exports reprennent ton découpage, ton cadrage et tes sous-titres actuels. Ils sont ajoutés l’un après l’autre à la file.</p>
        </div>
      </Modal>

      <Modal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        title="Personnaliser les sous-titres"
        description="Ces réglages restent synchronisés avec l’aperçu et l’export final."
        width="max-w-2xl"
        footer={<Button onClick={() => setCustomizeOpen(false)}>Terminé</Button>}
      >
        <div className="space-y-5">
          <fieldset>
            <legend className="label">Style</legend>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {ADVANCED_STYLES.map((item) => {
                const active = subtitleStyle === item.value
                const sampleStyle: React.CSSProperties = {
                  fontFamily: subtitleFont === 'serif' ? 'Georgia, serif' : subtitleFont === 'mono' ? 'monospace' : 'Arial, sans-serif',
                  fontWeight: item.value === 'punch' ? 800 : item.value === 'minimal' ? 500 : 700,
                  color: '#fff',
                  textShadow: item.value === 'neon' ? `0 0 10px ${accent}` : item.value === 'punch' ? '0 2px 0 #000' : undefined,
                  WebkitTextStroke: item.value === 'punch' ? '1.5px #000' : undefined,
                  backgroundColor: item.value === 'accent' || item.value === 'neon' ? accent : undefined,
                  borderRadius: item.value === 'accent' ? 5 : undefined,
                }
                return (
                  <button key={item.value} type="button" onClick={() => setSubtitleStyle(item.value)} aria-pressed={active}
                    className={`min-h-[72px] rounded-xl border p-2.5 text-left transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-blue-500 ${active ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,.18)]' : 'border-ink-500 bg-ink-900/60 hover:border-ink-400'}`}>
                    <span className="grid h-8 place-items-center overflow-hidden rounded-md bg-black/50 px-2 text-sm" style={sampleStyle}>{item.label}</span>
                    <span className={`mt-2 block text-2xs font-semibold ${active ? 'text-blue-400' : 'text-muted'}`}>{item.label}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>
          <SegmentedControl legend="Police" value={subtitleFont} onChange={setSubtitleFont} columns={4}
            options={FONTS.map((item) => ({
              value: item.value,
              label: <span style={{ fontFamily: item.value === 'serif' ? 'Georgia, serif' : item.value === 'mono' ? 'monospace' : 'Arial, sans-serif', fontWeight: item.value === 'bold' ? 800 : 500 }}>{item.label}</span>,
            }))} />
          <div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="subtitle-accent" className="label mb-0">Couleur d’accent</label>
              <span className="text-2xs text-muted">Aperçu instantané</span>
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-ink-500 bg-ink-900/60 p-2">
              <input id="subtitle-accent" type="color" value={accent} onChange={(event) => setAccent(event.target.value.toUpperCase())}
                aria-label="Choisir la couleur d’accent" className="h-10 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
              <input value={accent} onChange={(event) => /^#[0-9a-fA-F]{0,6}$/.test(event.target.value) && setAccent(event.target.value.toUpperCase())}
                aria-label="Code hexadécimal de la couleur" className="field h-10 flex-1 py-1 font-mono text-sm uppercase" maxLength={7} />
              {['#FF8A3D', '#3B82F6', '#A855F7', '#22C55E', '#F43F5E'].map((color) => (
                <button key={color} type="button" aria-label={`Utiliser ${color}`} title={color} onClick={() => setAccent(color)}
                  className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-blue-500 ${accent === color ? 'border-white' : 'border-transparent'}`} style={{ backgroundColor: color }} />
              ))}
            </div>
          </div>
          <SegmentedControl legend="Effet" value={subtitleEffect} onChange={setSubtitleEffect} columns={2}
            options={EFFECTS.map((item) => ({ value: item.value, label: item.label }))} />
          <SegmentedControl legend="Taille" value={subtitleSize} onChange={setSubtitleSize} columns={3}
            options={(['small', 'medium', 'large'] as const).map((value) => ({ value, label: SUBTITLE_SIZE_LABELS[value] }))} />
          <SegmentedControl legend="Position" value={subtitlePosition} onChange={setSubtitlePosition} columns={3}
            options={(['top', 'middle', 'bottom'] as const).map((value) => ({ value, label: SUBTITLE_POSITION_LABELS[value] }))} />
          <SegmentedControl legend="Vitesse de l’export" value={playbackSpeed} onChange={setPlaybackSpeed} columns={3}
            options={SPEEDS.map((value) => ({ value, label: `${value}×` }))} />
          <p className="text-xs text-muted">La vitesse modifie aussi le son et les horodatages des sous-titres afin de rester synchronisés.</p>
        </div>
      </Modal>

      <Modal
        open={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        title="Enregistrer ce style de sous-titres"
        description="Retrouve-le en un clic dans l’éditeur pour tes prochains clips."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveTemplateOpen(false)}>
              Annuler
            </Button>
            <Button onClick={saveTemplate} disabled={!templateName.trim()}>
              Enregistrer
            </Button>
          </>
        }
      >
        <Field
          label="Nom du modèle"
          value={templateName}
          maxLength={80}
          placeholder="Ex : Punch orange bas"
          onChange={(event) => setTemplateName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && templateName.trim()) void saveTemplate()
          }}
        />
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-ink-500 bg-ink-900/60 p-3">
          <div className="w-20">
            <StyleSwatch style={subtitleStyle} accent={accent} />
          </div>
          <p className="text-xs text-muted">
            {SUBTITLE_STYLE_LABELS[subtitleStyle]?.name} &middot;{' '}
            {SUBTITLE_SIZE_LABELS[subtitleSize]} &middot;{' '}
            {SUBTITLE_POSITION_LABELS[subtitlePosition]}
          </p>
        </div>
      </Modal>
    </div>
  )
}
