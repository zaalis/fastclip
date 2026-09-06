import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Icon, type IconName } from '../components/Icon'
import { Button, Logo } from '../components/ui'
import { useAuth } from '../context/AppContext'

/** Deterministic pseudo-waveform: same shape on every render, no layout shift. */
const WAVE = Array.from({ length: 68 }, (_, index) => {
  const base = Math.sin(index * 0.55) * 0.5 + Math.sin(index * 0.19) * 0.32
  return 0.24 + Math.abs(base) * 0.7
})

const PREVIEW_CLIPS = [
  {
    score: 94,
    category: 'Punchline',
    title: 'La phrase qui fait rester',
    range: '1:42 - 2:19',
    best: true,
  },
  {
    score: 88,
    category: 'Conseil utile',
    title: 'La méthode en trois étapes',
    range: '4:05 - 4:48',
    best: false,
  },
  {
    score: 81,
    category: 'Conclusion forte',
    title: 'Ce qu’il faut retenir',
    range: '7:30 - 8:02',
    best: false,
  },
]

const STEPS: { icon: IconName; title: string; body: string; detail: string }[] = [
  {
    icon: 'upload',
    title: 'Importer',
    body: 'Dépose une vidéo MP4, MOV ou WebM jusqu’à 10 minutes. Fastclip extrait l’audio et transcrit chaque mot avec son horodatage.',
    detail: 'Transcription locale, mot à mot',
  },
  {
    icon: 'sparkle',
    title: 'Choisir',
    body: 'Trois extraits te sont proposes, avec un score, une catégorie et une justification lisible. Tu ajustes le début, la fin et les sous-titres.',
    detail: 'Toujours exactement 3 propositions',
  },
  {
    icon: 'film',
    title: 'Publier',
    body: 'Fastclip généré un MP4 vertical 720x1280 en H.264 avec sous-titres incrustés, plus un fichier .srt et ta légende prête à coller.',
    detail: 'MP4 + SRT + légende',
  },
]

function TimelinePreview() {
  const [pulse, setPulse] = useState(0)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (media.matches) return
    const timer = window.setInterval(() => setPulse((value) => (value + 1) % 3), 4000)
    return () => window.clearInterval(timer)
  }, [])

  // Windows expressed as percentages of the mock timeline.
  const windows = [
    { start: 18, width: 15 },
    { start: 46, width: 17 },
    { start: 76, width: 13 },
  ]

  return (
    <div className="timeline-preview panel overflow-hidden shadow-lifted">
      <div className="flex items-center gap-2 border-b border-ink-500 px-4 py-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-500" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-500" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-500" />
        </span>
        <p className="ml-2 text-xs text-muted">Aperçu de l’interface Fastclip</p>
      </div>

      <div className="p-4 sm:p-5">
        {/* Timeline */}
        <div className="rounded-xl border border-ink-500 bg-ink-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium text-chalk">Transcription horodatée</p>
            <p className="text-2xs tabular-nums text-muted">09:41</p>
          </div>

          <div className="relative h-16">
            {windows.map((window_, index) => (
              <span
                key={index}
                className={`timeline-window absolute inset-y-0 rounded-md border
                  ${
                    index === pulse
                      ? 'is-active border-flame-500/70 bg-flame-500/14'
                      : 'border-blue-500/40 bg-blue-500/8'
                  }`}
                style={{ left: `${window_.start}%`, width: `${window_.width}%` }}
                aria-hidden="true"
              />
            ))}
            <div className="relative flex h-full items-end gap-[3px]">
              {WAVE.map((height, index) => {
                const position = (index / WAVE.length) * 100
                const inWindow = windows.some(
                  (w) => position >= w.start && position <= w.start + w.width,
                )
                return (
                  <span
                    key={index}
                    className={`flex-1 rounded-sm transition-[background-color,transform] duration-[850ms] ease-[cubic-bezier(0.16,1,0.3,1)]
                      ${inWindow ? (index % 5 === 0 ? 'bg-flame-500' : 'bg-blue-400') : 'bg-ink-500'}`}
                    style={{ height: `${height * 100}%` }}
                  />
                )
              })}
            </div>
          </div>

          <div className="mt-3 flex justify-between text-2xs tabular-nums text-muted">
            <span>0:00</span>
            <span>3:12</span>
            <span>6:24</span>
            <span>9:41</span>
          </div>
        </div>

        {/* Three proposals */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {PREVIEW_CLIPS.map((clip, index) => (
            <article
              key={clip.title}
              className={`timeline-proposal rounded-xl border p-3.5
                ${
                  index === pulse
                    ? 'is-active border-flame-500/60 bg-flame-500/8'
                    : 'border-ink-500 bg-ink-800'
                }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-lg font-bold tabular-nums ${
                    clip.best ? 'text-flame-500' : 'text-blue-400'
                  }`}
                >
                  {clip.score}
                  <span className="ml-0.5 text-2xs font-medium text-muted">/100</span>
                </span>
                {clip.best && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-flame-500 px-2 py-0.5 text-2xs font-semibold text-ink-900">
                    <Icon name="bolt" size={10} />
                    Top
                  </span>
                )}
              </div>
              <p className="mt-2 text-2xs font-medium uppercase tracking-wide text-muted">
                {clip.category}
              </p>
              <p className="mt-1 text-sm font-semibold leading-snug text-chalk">{clip.title}</p>
              <p className="mt-2 text-2xs tabular-nums text-muted">{clip.range}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  const { user } = useAuth()
  const appHref = user ? '/app' : '/inscription'

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('.reveal-on-scroll'))
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      elements.forEach((element) => element.classList.add('is-visible'))
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        })
      },
      { threshold: 0.14, rootMargin: '0px 0px -7% 0px' },
    )
    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-h-dvh bg-ink-900">
      {/* --- Header --- */}
      <header className="sticky top-0 z-40 border-b border-ink-500/70 bg-ink-900/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Navigation principale">
            <a
              href="#fonctionnement"
              className="hidden rounded-lg px-3 py-2 text-sm text-muted transition-[color,background-color,transform] duration-300 ease-out hover:-translate-y-px hover:bg-flame-500/8 hover:text-flame-300 sm:block"
            >
              Comment ça marche
            </a>
            <Link
              to="/connexion"
              className="rounded-lg px-3 py-2 text-sm text-muted transition-[color,background-color,transform] duration-300 ease-out hover:-translate-y-px hover:bg-flame-500/8 hover:text-flame-300"
            >
              Connexion
            </Link>
            <Link to={appHref}>
              <Button size="sm">
                {user ? 'Ouvrir Fastclip' : 'Commencer gratuitement'}
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* --- Hero --- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 grid-lines opacity-[0.35]" aria-hidden="true" />
        <div
          className="hero-orb-blue pointer-events-none absolute left-1/2 top-[-14rem] h-[30rem] w-[52rem] -translate-x-1/2 animate-drift rounded-full opacity-40 blur-3xl"
          style={{
            background:
              'radial-gradient(closest-side, rgba(47,128,237,0.45), rgba(11,16,32,0))',
          }}
          aria-hidden="true"
        />
        <div
          className="hero-orb-orange pointer-events-none absolute -right-36 top-10 h-[30rem] w-[30rem] animate-drift rounded-full opacity-50 blur-3xl"
          style={{
            background:
              'radial-gradient(closest-side, rgba(255,138,61,0.42), rgba(11,16,32,0))',
          }}
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-16 sm:px-6 sm:pt-20 lg:pt-24">
          <div className="landing-hero-copy reveal-on-scroll mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-flame-500/35 bg-flame-500/8 px-3 py-1 text-xs text-flame-300 shadow-orange">
              <Icon name="bolt" size={13} className="text-flame-500" />
              Trois propositions, une décision : la tienne
            </span>

            <h1 className="mt-6 text-balance text-[2.1rem] font-extrabold leading-[1.1] tracking-tight text-chalk sm:text-5xl lg:text-[3.4rem]">
              Transforme tes longues vidéos en clips qui retiennent l’attention.
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-balance text-base leading-relaxed text-muted sm:text-lg">
              Importe ta vidéo. Fastclip la transcrit, analyse le texte et te propose
              trois extraits à fort potentiel. Tu choisis, tu ajustes les limites, et
              tu exportes un MP4 vertical sous-titré, prêt à publier.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to={appHref} className="w-full sm:w-auto">
                <Button size="lg" icon="bolt" block>
                  Créer mon premier clip
                </Button>
              </Link>
              <a href="#fonctionnement" className="w-full sm:w-auto">
                <Button size="lg" variant="secondary" iconRight="arrow-right" block>
                  Voir le fonctionnement
                </Button>
              </a>
            </div>

            <p className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="check" size={13} className="text-positive-500" />
                Export 720 x 1280 H.264
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="check" size={13} className="text-positive-500" />
                Sous-titres incrustés + fichier .srt
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="check" size={13} className="text-positive-500" />
                Fichiers supprimés après 24 h
              </span>
            </p>
          </div>

          <div className="reveal-on-scroll mt-14 sm:mt-16">
            <TimelinePreview />
          </div>
        </div>
      </section>

      {/* --- Three steps --- */}
      <section id="fonctionnement" className="scroll-mt-20 border-t border-ink-500/70 py-16 sm:py-20">
        <div className="reveal-on-scroll mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="eyebrow">Comment ça marche</p>
            <h2 className="mt-3 text-balance text-2xl font-bold tracking-tight text-chalk sm:text-3xl">
              Importer, choisir, publier. Trois étapes, quelques minutes.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              L’IA propose et explique. Elle ne décide jamais à ta place : chaque
              extrait reste modifiable image par image avant l’export.
            </p>
          </div>

          <ol className="stagger-grid mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="panel relative p-6 transition-[transform,border-color,box-shadow] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1">
                <span className="absolute right-5 top-5 text-4xl font-extrabold leading-none text-ink-600">
                  {index + 1}
                </span>
                <span className={`grid h-11 w-11 place-items-center rounded-xl border ${
                  index !== 1
                    ? 'border-flame-500/35 bg-flame-500/10 text-flame-300'
                    : 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                }`}>
                  <Icon name={step.icon} size={21} />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-chalk">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
                <p className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-ink-800 px-2 py-1 text-2xs text-muted">
                  <Icon name="check" size={11} className="text-positive-500" />
                  {step.detail}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* --- Transparency --- */}
      <section className="border-t border-ink-500/70 py-16 sm:py-20">
        <div className="reveal-on-scroll mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow">Sélection transparente</p>
            <h2 className="mt-3 text-balance text-2xl font-bold tracking-tight text-chalk sm:text-3xl">
              Un score, et surtout la raison derrière le score.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Chaque proposition arrive avec sa catégorie, son accroche et une
              justification écrite. Fastclip y ajoute quatre mesures calculées sur la
              transcription elle-même : densité de parole, rythme, respect du format
              court et autonomie de l’extrait.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Aucun extrait inventé : chaque horodatage est vérifié contre la transcription.',
                'Durée cible 20 à 60 secondes, ajustée sur les vraies frontières de phrases.',
                'Ta connexion IA se configure simplement depuis ton compte.',
              ].map((line) => (
                <li key={line} className="flex gap-3 text-sm leading-relaxed text-muted">
                  <Icon name="check" size={17} className="mt-0.5 text-positive-500" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="panel relative overflow-hidden p-6">
            <div
              className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full opacity-30 blur-3xl"
              style={{ background: 'radial-gradient(closest-side, rgba(255,138,61,.4), rgba(11,16,32,0))' }}
              aria-hidden="true"
            />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1 rounded-full bg-flame-500 px-2 py-0.5 text-2xs font-semibold text-ink-900">
                  <Icon name="bolt" size={10} />
                  Meilleur score
                </span>
                <h3 className="mt-3 text-lg font-semibold text-chalk">
                  La phrase qui fait rester
                </h3>
                <p className="mt-1 text-xs tabular-nums text-muted">
                  1:42 - 2:19 &middot; 37 s &middot; Punchline
                </p>
              </div>
              <span className="text-3xl font-extrabold tabular-nums text-flame-500">94</span>
            </div>

            <dl className="relative mt-5 space-y-3">
              {[
                ['Densité de parole', 92],
                ['Rythme', 88],
                ['Format court', 100],
                ['Autonomie', 96],
              ].map(([label, value], index) => (
                <div key={label as string} className="flex items-center gap-3">
                  <dt className="w-32 shrink-0 text-xs text-muted">{label}</dt>
                  <dd className="flex flex-1 items-center gap-3">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-900">
                      <span
                        className={`block h-full rounded-full ${index % 2 === 0 ? 'bg-flame-500' : 'bg-blue-500'}`}
                        style={{ width: `${value}%` }}
                      />
                    </span>
                    <span className="w-8 text-right text-xs tabular-nums text-chalk">
                      {value}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>

            <p className="relative mt-5 rounded-lg border border-ink-500 bg-ink-900/60 p-3 text-xs leading-relaxed text-muted">
              Exemple d’affichage. Les valeurs réelles sont calculées sur ta propre
              transcription au moment de l’analyse.
            </p>
          </div>
        </div>
      </section>

      {/* --- Privacy --- */}
      <section className="border-t border-ink-500/70 py-16 sm:py-20">
        <div className="reveal-on-scroll mx-auto max-w-6xl px-4 sm:px-6">
          <div className="panel relative overflow-hidden p-8 sm:p-10">
            <div
              className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-30 blur-3xl"
              style={{
                background:
                  'radial-gradient(closest-side, rgba(47,191,113,0.4), rgba(11,16,32,0))',
              }}
              aria-hidden="true"
            />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-positive-500/30 bg-positive-500/10 text-positive-500">
                <Icon name="shield" size={24} />
              </span>
              <div className="max-w-2xl">
                <h2 className="text-xl font-bold tracking-tight text-chalk sm:text-2xl">
                  Tes vidéos sont traitées temporairement et supprimées automatiquement.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  Les fichiers importés et les exports sont effacés du serveur 24 heures
                  après l’import. Seule la transcription texte est envoyée au modèle
                  d’analyse : ni la vidéo, ni la piste audio ne quittent le serveur. Ta
                  connexion IA reste strictement liée à ton compte.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- Final CTA --- */}
      <section className="relative overflow-hidden border-t border-ink-500/70 py-16 sm:py-24">
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-52 w-[32rem] -translate-x-1/2 animate-drift rounded-full opacity-35 blur-3xl"
          style={{ background: 'radial-gradient(closest-side, rgba(255,138,61,.42), rgba(11,16,32,0))' }}
          aria-hidden="true"
        />
        <div className="reveal-on-scroll relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-balance text-2xl font-extrabold tracking-tight text-chalk sm:text-4xl">
            Ton prochain Short est déjà dans ta dernière vidéo.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted">
            Crée ton compte, importe une vidéo et vois les trois propositions en
            quelques minutes.
          </p>
          <div className="mt-8 flex justify-center">
            <Link to={appHref}>
              <Button size="lg" variant="accent" icon="bolt">
                Commencer gratuitement
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* --- Footer --- */}
      <footer className="border-t border-ink-500/70 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <Logo size="sm" />
          <p className="text-xs text-muted">
            Traitement local &middot; Suppression automatique après 24 h
          </p>
          <div className="flex items-center gap-4 text-xs">
            <Link to="/connexion" className="link">
              Connexion
            </Link>
            <Link to="/inscription" className="link">
              Créer un compte
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
