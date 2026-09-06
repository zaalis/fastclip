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
    label: 'Brouillon',
    icon: 'draft',
    tone: 'neutral',
    busy: false,
    description: 'Projet créé, aucune vidéo importée.',
  },
  uploading: {
    label: 'Téléversement',
    icon: 'upload',
    tone: 'progress',
    busy: true,
    description: 'La vidéo est en cours d’envoi vers le serveur.',
  },
  queued: {
    label: 'En attente',
    icon: 'clock',
    tone: 'neutral',
    busy: true,
    description: 'La tâche attend son tour dans la file.',
  },
  transcribing: {
    label: 'Transcription',
    icon: 'wave',
    tone: 'progress',
    busy: true,
    description: 'Extraction de l’audio et transcription horodatée.',
  },
  analyzing: {
    label: 'Analyse IA',
    icon: 'sparkle',
    tone: 'progress',
    busy: true,
    description: 'La transcription est analysée pour trouver trois extraits.',
  },
  rendering: {
    label: 'Génération du Short',
    icon: 'film',
    tone: 'accent',
    busy: true,
    description: 'Découpe, recadrage vertical, sous-titres et encodage.',
  },
  completed: {
    label: 'Terminé',
    icon: 'check',
    tone: 'positive',
    busy: false,
    description: 'Le traitement est termine.',
  },
  failed: {
    label: 'Échec',
    icon: 'alert',
    tone: 'negative',
    busy: false,
    description: 'Le traitement a échoué.',
  },
  cancelled: {
    label: 'Annulé',
    icon: 'stop',
    tone: 'neutral',
    busy: false,
    description: 'La tâche a été annulée.',
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
  clean: { name: 'Épuré', hint: 'Texte blanc, contour fin. Discret et lisible.' },
  punch: { name: 'Punch', hint: 'Majuscules, contour épais. Style TikTok.' },
  accent: { name: 'Accent', hint: 'Fond colore plein. Très visible.' },
}

export const SUBTITLE_SIZE_LABELS: Record<string, string> = {
  small: 'Petite',
  medium: 'Moyenne',
  large: 'Grande',
}

export const SUBTITLE_POSITION_LABELS: Record<string, string> = {
  top: 'Haut',
  middle: 'Milieu',
  bottom: 'Bas',
}
