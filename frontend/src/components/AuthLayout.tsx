import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Icon } from './Icon'
import SlicedWaves from './SlicedWaves'
import { Logo } from './ui'

const HIGHLIGHTS = [
  {
    icon: 'sparkle' as const,
    title: 'Trois propositions, expliquées',
    body: 'Un score, une catégorie et la raison du choix. Tu gardes la décision finale.',
  },
  {
    icon: 'scissors' as const,
    title: 'Ajustement au dixième de seconde',
    body: 'Poignées de début et de fin, transcription synchronisée, aperçu immédiat.',
  },
  {
    icon: 'shield' as const,
    title: 'Supprimé après 24 heures',
    body: 'Sources et exports sont effacés automatiquement. Seul le texte part à l’analyse.',
  },
]

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink-900 lg:grid lg:grid-cols-[1fr_minmax(0,31rem)]">
      <div className="absolute inset-0 z-0">
        <SlicedWaves
          color1="#246BFD"
          color2="#FF8A3D"
          color3="#75A9FF"
          columns={14}
          rows={9}
          speed={0.35}
          mouseInteraction
          mouseStrength={1}
          mouseRadius={0.32}
          opacity={0.58}
          grain
          grainIntensity={0.04}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_45%,transparent_0%,rgba(11,16,32,.3)_45%,rgba(11,16,32,.85)_100%)]" />
      </div>

      <aside className="relative z-10 hidden overflow-hidden lg:block">
        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <Logo size="md" />
          <div className="max-w-md animate-auth-copy">
            <span className="inline-flex items-center gap-2 rounded-full border border-flame-500/30 bg-ink-900/45 px-3 py-1.5 text-xs font-medium text-flame-300 backdrop-blur-xl">
              <Icon name="sparkle" size={13} />
              Le montage qui va droit au moment fort
            </span>
            <h2 className="mt-5 text-balance text-3xl font-extrabold leading-tight tracking-tight text-chalk">
              Des vidéos longues aux clips qui retiennent l’attention.
            </h2>
            <ul className="mt-9 space-y-6">
              {HIGHLIGHTS.map((item) => (
                <li key={item.title} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-blue-400/35 bg-ink-900/45 text-blue-200 shadow-glow backdrop-blur-xl">
                    <Icon name={item.icon} size={19} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-chalk">{item.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted">Pensé pour les créateurs qui veulent publier plus vite.</p>
        </div>
      </aside>

      {/* Form column */}
      <main className="relative z-10 flex min-h-dvh flex-col px-5 py-6 sm:px-8 lg:bg-ink-900/28 lg:backdrop-blur-sm">
        <div className="flex items-center justify-between lg:hidden">
          <Logo size="sm" />
          <Link to="/" className="text-sm text-muted transition-colors hover:text-chalk">
            Retour
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-md animate-auth-card rounded-[1.75rem] border border-white/10 bg-ink-900/82 p-6 shadow-[0_28px_80px_-28px_rgba(0,0,0,.85)] backdrop-blur-2xl sm:p-8">
            <h1 className="text-2xl font-bold tracking-tight text-chalk">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>

        {footer && <div className="text-center text-sm text-muted">{footer}</div>}
      </main>
    </div>
  )
}
