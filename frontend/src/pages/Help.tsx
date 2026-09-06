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
    title: '1. Import et vérification',
    body: 'Le fichier est vérifié (format, poids, durée, présence d’une piste audio) avant d’être accepte, puis écrit sur le disque par morceaux : un gros fichier n’est jamais chargé entièrement en mémoire.',
  },
  {
    icon: 'wave',
    title: '2. Extraction audio et transcription',
    body: 'L’audio est extrait en mono 16 kHz, le format exact attendu par le moteur de transcription. faster-whisper produit ensuite le texte, les horodatages par segment et par mot, et la langue détectée.',
  },
  {
    icon: 'sparkle',
    title: '3. Analyse de la transcription',
    body: 'Seuls le texte et les horodatages sont envoyés au modèle d’analyse. Il renvoie exactement trois propositions, que Fastclip vérifie ensuite contre la transcription réelle : un horodatage inventé est rejeté.',
  },
  {
    icon: 'scissors',
    title: '4. Ajustement',
    body: 'Tu deplaces le début et la fin, tu peux les aligner sur une phrase, choisir le style de sous-titres et modifier le titre, la légende et les hashtags.',
  },
  {
    icon: 'film',
    title: '5. Export',
    body: 'FFmpeg découpe le passage, recadre au centre en 9:16, met à l’échelle en 720 x 1280, incruste les sous-titres et encode en H.264. Un fichier .srt est généré en parallèle.',
  },
]

const FAQ = [
  {
    question: 'Pourquoi seulement 3 propositions ?',
    answer:
      'Trois options, c’est assez pour comparer et assez peu pour decider vite. Au-delà, le choix devient une corvée et l’outil ralentit le montage au lieu de l’accélérer.',
  },
  {
    question: 'Pourquoi une seule tâche à la fois ?',
    answer:
      'Fastclip est conçu pour tourner sur une petite machine (2 vCPU, 8 Go). Lancer deux encodages ou deux transcriptions en parallèle rendrait les deux plus lents et risquerait de saturer la mémoire. La file d’attente affiche toujours ta position.',
  },
  {
    question: 'Que devient ma vidéo ?',
    answer:
      'Elle reste sur le serveur Fastclip pendant le traitement, puis elle est supprimée automatiquement 24 heures après l’import, avec ses exports. Ni la vidéo ni l’audio ne sont envoyés à un service tiers : seule la transcription texte part à l’analyse.',
  },
  {
    question: 'Pourquoi mon export est-il refusé ?',
    answer:
      'Les causes les plus fréquentes : la vidéo dépasse 10 minutes ou 250 Mo, elle n’a pas de piste audio, le fichier source a déjà été supprimé automatiquement, ou l’espace de stockage du compte est plein.',
  },
  {
    question: 'Puis-je recadrer autrement qu’au centre ?',
    answer:
      'Pas encore. La V1 recadre au centre, ce qui convient a la majorité des vidéos parlées. Le recadrage est isolé dans une seule fonction côté serveur pour permettre d’ajouter plus tard un suivi automatique du visage.',
  },
]

export default function Help() {
  const { status } = useAuth()
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="eyebrow">Aide</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-chalk sm:text-3xl">
          Comment fonctionne Fastclip
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
          Le détail de chaque étape, les limites en vigueur sur cette installation
          et les réponses aux questions les plus fréquentes.
        </p>
      </header>

      {status && !status.ai.configured && (
        <Alert tone="warning" title="Analyse IA indisponible sur cette installation">
          {status.ai.message} La transcription, l’éditeur et l’export fonctionnent
          normalement.
        </Alert>
      )}

      {/* Pipeline */}
      <section className="panel p-5 sm:p-6">
        <h2 className="text-base font-semibold text-chalk">Le parcours d’une vidéo</h2>
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
        <h2 className="text-base font-semibold text-chalk">Les statuts d’un projet</h2>
        <p className="mt-1 text-sm text-muted">
          Chaque statut associe toujours une icône et un libellé : la couleur n’est
          jamais la seule information.
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
            Limites de cette installation
          </h2>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Durée maximale', formatDuration(status.limits.max_duration_seconds)],
              ['Poids maximal', `${status.limits.max_upload_mb} Mo`],
              ['Formats acceptés', status.limits.allowed_extensions.join(', ')],
              [
                'Résolution d’export',
                `${status.limits.export.width} x ${status.limits.export.height}`,
              ],
              ['Codec', status.limits.export.codec],
              ['Tâches simultanées', String(status.limits.concurrent_jobs)],
              ['Conservation des fichiers', `${status.limits.retention_hours} heures`],
              ['Stockage par compte', `${status.limits.max_storage_per_user_mb} Mo`],
              [
                'Moteur de transcription',
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
          Questions fréquentes
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
          <h2 className="text-sm font-semibold text-chalk">Prêt à essayer ?</h2>
          <p className="mt-1 text-sm text-muted">
            Importe une vidéo et vois les trois propositions en quelques minutes.
          </p>
        </div>
        <Link to="/app/nouveau">
          <Button variant="accent" icon="upload">
            Importer une vidéo
          </Button>
        </Link>
      </section>
    </div>
  )
}
