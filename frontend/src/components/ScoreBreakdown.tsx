import type { ScoreBreakdown as Breakdown } from '../lib/api'
import { Icon } from './Icon'

const LABELS: Record<keyof Breakdown, { label: string; help: string }> = {
  densite: {
    label: 'Densité de parole',
    help: 'Part de l’extrait réellement occupée par de la parole, silences exclus.',
  },
  rythme: {
    label: 'Rythme',
    help: 'Mots par seconde, compares à un débit de référence de 2,6 mots/s.',
  },
  format: {
    label: 'Format court',
    help: 'Proximité avec la durée cible de 20 à 60 secondes.',
  },
  autonomie: {
    label: 'Autonomie',
    help: 'L’extrait commence et se termine sur de vraies frontières de phrases.',
  },
}

/**
 * Extra #1 - the score, explained.
 *
 * These four values are measured by Fastclip on the transcript itself, not
 * produced by the model. The heading says so, so a model score and a measured
 * score are never confused.
 */
export function ScoreBreakdown({ breakdown }: { breakdown: Breakdown }) {
  const entries = (Object.keys(LABELS) as (keyof Breakdown)[]).filter(
    (key) => typeof breakdown[key] === 'number',
  )
  if (entries.length === 0) return null

  return (
    <div>
      <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted">
        <Icon name="gauge" size={12} />
        Mesure Fastclip sur la transcription
      </p>
      <dl className="mt-2.5 space-y-2">
        {entries.map((key) => {
          const value = breakdown[key] as number
          return (
            <div key={key} className="flex items-center gap-3" title={LABELS[key].help}>
              <dt className="w-[7.5rem] shrink-0 text-2xs text-muted">{LABELS[key].label}</dt>
              <dd className="flex flex-1 items-center gap-2.5">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-900">
                  <span
                    className={`block h-full rounded-full transition-[width] duration-500 ${
                      value >= 75 ? 'bg-blue-500' : value >= 50 ? 'bg-blue-700' : 'bg-ink-400'
                    }`}
                    style={{ width: `${Math.max(2, value)}%` }}
                  />
                </span>
                <span className="w-7 text-right text-2xs tabular-nums text-chalk">{value}</span>
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
