import type { ProjectStatus } from './api'

/**
 * Status vocabulary.
 *
 * Every status carries a label, an icon name and a tone. Colour is never the
 * only signal: the badge always renders icon + text, so the state is readable
 * without colour perception and in a screenshot printed in greyscale.
 */
export interface StatusMeta {
  label: string
  icon: 'draft' | 'upload' | 'clock' | 'wave' | 'sparkle' | 'film' | 'check' | 'alert' | 'stop'
  tone: 'neutral' | 'progress' | 'positive' | 'negative' | 'accent'
  busy: boolean
  description: string
}

export const STATUS_META: Record<ProjectStatus, StatusMeta> = {
  draft: {
    label: 'Draft',
    icon: 'draft',
    tone: 'neutral',
    busy: false,
    description: 'Project created, no video uploaded.',
  },
  uploading: {
    label: 'Uploading',
    icon: 'upload',
    tone: 'progress',
    busy: true,
    description: 'The video is uploading to the server.',
  },
  queued: {
    label: 'Queued',
    icon: 'clock',
    tone: 'neutral',
    busy: true,
    description: 'The job is waiting in the queue.',
  },
  transcribing: {
    label: 'Transcription',
    icon: 'wave',
    tone: 'progress',
    busy: true,
    description: 'Extracting audio and creating a timestamped transcript.',
  },
  analyzing: {
    label: 'AI analysis',
    icon: 'sparkle',
    tone: 'progress',
    busy: true,
    description: 'The transcript is analyzed to find three clip suggestions.',
  },
  rendering: {
    label: 'Rendering clip',
    icon: 'film',
    tone: 'accent',
    busy: true,
    description: 'Trimming, vertical framing, captions, and encoding.',
  },
  completed: {
    label: 'Completed',
    icon: 'check',
    tone: 'positive',
    busy: false,
    description: 'Processing is complete.',
  },
  failed: {
    label: 'Failed',
    icon: 'alert',
    tone: 'negative',
    busy: false,
    description: 'Processing failed.',
  },
  cancelled: {
    label: 'Cancelled',
    icon: 'stop',
    tone: 'neutral',
    busy: false,
    description: 'The job was cancelled.',
  },
}

export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status as ProjectStatus] ?? STATUS_META.draft
}

export const TONE_CLASSES: Record<StatusMeta['tone'], string> = {
  neutral: 'border-ink-400 bg-ink-600 text-muted',
  progress: 'border-blue-500/50 bg-blue-500/12 text-blue-400',
  positive: 'border-positive-500/45 bg-positive-500/12 text-positive-500',
  negative: 'border-negative-600/55 bg-negative-600/12 text-negative-500',
  accent: 'border-flame-500/50 bg-flame-500/12 text-flame-500',
}

export const SUBTITLE_STYLE_LABELS: Record<string, { name: string; hint: string }> = {
  clean: { name: 'Clean', hint: 'White text, thin outline. Subtle and readable.' },
  punch: { name: 'Punch', hint: 'Uppercase text, thick outline. TikTok-style.' },
  accent: { name: 'Accent', hint: 'Solid color background. Highly visible.' },
}

export const SUBTITLE_SIZE_LABELS: Record<string, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
}

export const SUBTITLE_POSITION_LABELS: Record<string, string> = {
  top: 'Top',
  middle: 'Middle',
  bottom: 'Bottom',
}
