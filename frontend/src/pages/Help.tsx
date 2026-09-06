import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Icon, type IconName } from '../components/Icon'
import { Alert, Button } from '../components/ui'
import { useAuth } from '../context/AppContext'
import { formatDuration } from '../lib/format'
import { STATUS_META } from '../lib/status'
import type { ProjectStatus } from '../lib/api'

const STAGES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'upload',
    title: '1. Upload and validation',
    body: 'The file is checked for format, size, duration, and an audio track before it is accepted. It is written to disk in chunks, so large files are never fully loaded into memory.',
  },
  {
    icon: 'wave',
    title: '2. Audio extraction and transcription',
    body: 'Audio is extracted as 16 kHz mono, the format expected by the transcription engine. faster-whisper then produces text, segment and word timestamps, and the detected language.',
  },
  {
    icon: 'sparkle',
    title: '3. Transcript analysis',
    body: 'Only text and timestamps are sent to the analysis model. It returns exactly three suggestions, which Fastclip verifies against the actual transcript: invented timestamps are rejected.',
  },
  {
    icon: 'scissors',
    title: '4. Fine-tuning',
    body: 'Move the start and end points, align them to a sentence, choose a caption style, and edit the title, caption, and hashtags.',
  },
  {
    icon: 'film',
    title: '5. Export',
    body: 'FFmpeg trims the segment, center-crops it to 9:16, scales it to 720 × 1280, burns in captions, and encodes it in H.264. An .srt file is generated alongside it.',
  },
]

const FAQ = [
  {
    question: 'Why only 3 suggestions?',
    answer:
      'Three options are enough to compare and few enough to decide quickly. Beyond that, choosing becomes a chore and the tool slows editing down instead of speeding it up.',
  },
  {
    question: 'Why one job at a time?',
    answer:
      'Fastclip is designed to run on a small machine (2 vCPU, 8 GB). Running two encodes or transcriptions in parallel would make both slower and could exhaust memory. The queue always shows your position.',
  },
  {
    question: 'What happens to my video?',
    answer:
      'It stays on the Fastclip server during processing, then is automatically deleted 24 hours after upload together with its exports. Neither the video nor audio is sent to a third-party service: only the text transcript is analyzed.',
  },
  {
    question: 'Why is my export rejected?',
    answer:
      'The most common causes are a video over 10 minutes or 250 MB, no audio track, an automatically deleted source file, or a full account storage quota.',
  },
  {
    question: 'Can I crop somewhere other than the center?',
    answer:
      'Not yet. Version 1 center-crops, which suits most talking videos. Cropping is isolated in one server-side function so automatic face tracking can be added later.',
  },
]

export default function Help() {
  const { status } = useAuth()
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="eyebrow">Help</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-chalk sm:text-3xl">
          How Fastclip works
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
          Details for every step, the limits of this installation, and answers
          to the most common questions.
        </p>
      </header>

      {status && !status.ai.configured && (
        <Alert tone="warning" title="AI analysis is unavailable on this installation">
          {status.ai.message} Transcription, the editor, and export continue to work normally.
        </Alert>
      )}

      {/* Pipeline */}
      <section className="panel p-5 sm:p-6">
        <h2 className="text-base font-semibold text-chalk">A video’s journey</h2>
        <ol className="mt-5 space-y-5">
          {STAGES.map((stage) => (
            <li key={stage.title} className="flex gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400">
                <Icon name={stage.icon} size={19} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-chalk">{stage.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{stage.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Status vocabulary */}
      <section className="panel p-5 sm:p-6">
        <h2 className="text-base font-semibold text-chalk">Project statuses</h2>
        <p className="mt-1 text-sm text-muted">
          Every status always combines an icon and a label: color is never the
          only source of information.
        </p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          {(Object.entries(STATUS_META) as [ProjectStatus, (typeof STATUS_META)[ProjectStatus]][]).map(
            ([key, meta]) => (
              <div
                key={key}
                className="flex gap-3 rounded-lg border border-ink-500 bg-ink-800 p-3.5"
              >
                <Icon
                  name={meta.icon}
                  size={16}
                  className={`mt-0.5 shrink-0 ${
                    meta.tone === 'positive'
                      ? 'text-positive-500'
                      : meta.tone === 'negative'
                        ? 'text-negative-500'
                        : meta.tone === 'accent'
                          ? 'text-flame-500'
                          : meta.tone === 'progress'
                            ? 'text-blue-400'
                            : 'text-muted'
                  }`}
                />
                <div>
                  <dt className="text-sm font-medium text-chalk">{meta.label}</dt>
                  <dd className="mt-0.5 text-xs leading-relaxed text-muted">
                    {meta.description}
                  </dd>
                </div>
              </div>
            ),
          )}
        </dl>
      </section>

      {/* Limits */}
      {status && (
        <section className="panel p-5 sm:p-6">
          <h2 className="text-base font-semibold text-chalk">
            Installation limits
          </h2>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Maximum duration', formatDuration(status.limits.max_duration_seconds)],
              ['Maximum size', `${status.limits.max_upload_mb} MB`],
              ['Accepted formats', status.limits.allowed_extensions.join(', ')],
              [
                'Export resolution',
                `${status.limits.export.width} x ${status.limits.export.height}`,
              ],
              ['Codec', status.limits.export.codec],
              ['Concurrent jobs', String(status.limits.concurrent_jobs)],
              ['File retention', `${status.limits.retention_hours} hours`],
              ['Storage per account', `${status.limits.max_storage_per_user_mb} MB`],
              [
                'Transcription engine',
                `${status.transcription.model} / ${status.transcription.compute_type}`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-ink-500 bg-ink-800 p-3.5">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-1 text-sm font-medium text-chalk">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* FAQ */}
      <section className="panel overflow-hidden">
        <h2 className="border-b border-ink-500 p-5 text-base font-semibold text-chalk sm:px-6">
          Frequently asked questions
        </h2>
        <ul>
          {FAQ.map((item, index) => {
            const expanded = open === index
            return (
              <li key={item.question} className="border-b border-ink-500 last:border-0">
                <h3>
                  <button
                    onClick={() => setOpen(expanded ? null : index)}
                    aria-expanded={expanded}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-ink-600 sm:px-6"
                  >
                    <span className="text-sm font-medium text-chalk">{item.question}</span>
                    <Icon
                      name="chevron-down"
                      size={16}
                      className={`shrink-0 text-muted transition-transform duration-200 ${
                        expanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </h3>
                {expanded && (
                  <p className="animate-fade-in px-5 pb-5 text-sm leading-relaxed text-muted sm:px-6">
                    {item.answer}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <h2 className="text-sm font-semibold text-chalk">Ready to try it?</h2>
          <p className="mt-1 text-sm text-muted">
            Upload a video and see three suggestions in minutes.
          </p>
        </div>
        <Link to="/app/nouveau">
          <Button variant="accent" icon="upload">
            Upload a video
          </Button>
        </Link>
      </section>
    </div>
  )
}
