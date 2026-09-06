/**
 * Client-side mirror of `backend/app/services/subtitles.py`.
 *
 * The editor preview must show the same cues FFmpeg will burn in, so the
 * grouping rules (max words, max span, clause breaks) are duplicated here
 * deliberately. If one side changes, change the other.
 */
import type { TranscriptSegment } from './api'

export interface Cue {
  start: number
  end: number
  text: string
}

const MAX_WORDS_PER_CUE = 5
const MAX_CUE_SECONDS = 2.6
const MIN_CUE_SECONDS = 0.5
const BREAK_CHARS = ['.', '!', '?', ',', ';', ':']

export function buildCues(
  segments: TranscriptSegment[],
  start: number,
  end: number,
): Cue[] {
  const words: Cue[] = []
  for (const segment of segments) {
    for (const word of segment.words ?? []) {
      const text = (word.word ?? '').trim()
      if (text && word.end > start && word.start < end) {
        words.push({ start: word.start, end: word.end, text })
      }
    }
  }

  const cues = words.length
    ? fromWords(words, end)
    : fromSegments(segments, start, end)

  return cues
    .map((cue) => ({
      start: Math.max(0, cue.start - start),
      end: Math.min(end - start, cue.end - start),
      text: cue.text.trim(),
    }))
    .filter((cue) => cue.end - cue.start >= 0.08 && cue.text)
}

function fromWords(words: Cue[], end: number): Cue[] {
  const cues: Cue[] = []
  let bucket: Cue[] = []

  const flush = () => {
    if (!bucket.length) return
    cues.push({
      start: bucket[0].start,
      end: Math.max(bucket[bucket.length - 1].end, bucket[0].start + MIN_CUE_SECONDS),
      text: bucket.map((word) => word.text).join(' '),
    })
    bucket = []
  }

  for (const word of words) {
    bucket.push(word)
    const span = bucket[bucket.length - 1].end - bucket[0].start
    const endsClause = BREAK_CHARS.some((char) => word.text.trimEnd().endsWith(char))
    if (bucket.length >= MAX_WORDS_PER_CUE || span >= MAX_CUE_SECONDS || endsClause) flush()
  }
  flush()

  return cues
    .map((cue, index) => ({
      ...cue,
      end: Math.min(cue.end, index + 1 < cues.length ? cues[index + 1].start : end, end),
    }))
    .filter((cue) => cue.end > cue.start)
}

function fromSegments(
  segments: TranscriptSegment[],
  start: number,
  end: number,
): Cue[] {
  return segments
    .filter((segment) => segment.end > start && segment.start < end && segment.text.trim())
    .map((segment) => ({
      start: Math.max(segment.start, start),
      end: Math.min(segment.end, end),
      text: segment.text.trim(),
    }))
}

/** Cue visible at `time` (relative to the clip start). */
export function cueAt(cues: Cue[], time: number): Cue | null {
  return cues.find((cue) => time >= cue.start && time <= cue.end) ?? null
}

/** Nearest sentence boundary in the transcript - used by the snap buttons. */
export function snapToSentence(
  segments: TranscriptSegment[],
  time: number,
  edge: 'start' | 'end',
): number {
  const candidates = segments.map((segment) => (edge === 'start' ? segment.start : segment.end))
  if (!candidates.length) return time
  return candidates.reduce((best, value) =>
    Math.abs(value - time) < Math.abs(best - time) ? value : best,
  )
}
