import { useCallback, useEffect, useState } from 'react'

import { Icon } from '../components/Icon'
import { StyleSwatch, SubtitleOverlay } from '../components/SubtitlePreview'
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Modal,
  SegmentedControl,
  Skeleton,
} from '../components/ui'
import { useToast } from '../context/AppContext'
import { api, type CaptionTemplate } from '../lib/api'
import {
  SUBTITLE_POSITION_LABELS,
  SUBTITLE_SIZE_LABELS,
  SUBTITLE_STYLE_LABELS,
} from '../lib/status'

const ACCENT = '#FF8A3D'
const SAMPLE = 'Le détail qui change tout'

/** Extra #2 - reusable subtitle presets so a look survives across clips. */
export default function Templates() {
  const { notify, notifyError } = useToast()
  const [templates, setTemplates] = useState<CaptionTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [working, setWorking] = useState(false)
  const [deleting, setDeleting] = useState<CaptionTemplate | null>(null)

  const [name, setName] = useState('')
  const [style, setStyle] = useState('clean')
  const [size, setSize] = useState('medium')
  const [position, setPosition] = useState('bottom')

  const load = useCallback(async () => {
    try {
      const { templates: next } = await api.templates.list()
      setTemplates(next)
    } catch (error) {
      notifyError(error, 'Impossible de charger les modèles.')
    } finally {
      setLoading(false)
    }
  }, [notifyError])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    if (!name.trim()) return
    setWorking(true)
    try {
      await api.templates.create({
        name: name.trim(),
        style,
        size,
        position,
        accent_color: ACCENT,
        is_default: templates.length === 0,
      })
      notify('Modèle enregistré.')
      setCreating(false)
      setName('')
      await load()
    } catch (error) {
      notifyError(error, 'Enregistrement impossible.')
    } finally {
      setWorking(false)
    }
  }

  const setDefault = async (template: CaptionTemplate) => {
    try {
      await api.templates.setDefault(template.id)
      notify(`« ${template.name} » est maintenant le modèle par défaut.`)
      await load()
    } catch (error) {
      notifyError(error, 'Modification impossible.')
    }
  }

  const remove = async () => {
    if (!deleting) return
    setWorking(true)
    try {
      await api.templates.remove(deleting.id)
      notify('Modèle supprimé.')
      setDeleting(null)
      await load()
    } catch (error) {
      notifyError(error, 'Suppression impossible.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Identité visuelle</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-chalk sm:text-3xl">
            Modèles de sous-titres
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            Enregistre un style, une taille et une position, puis applique-les en
            un clic dans l’éditeur. Tes clips gardent la même signature visuelle
            sans réglages à refaire à chaque fois.
          </p>
        </div>
        <Button icon="plus" onClick={() => setCreating(true)}>
          Nouveau modèle
        </Button>
      </header>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-72" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon="captions"
          title="Aucun modèle enregistré"
          description="Crée un modèle pour figer ton style de sous-titres et le réutiliser sur tous tes prochains Shorts."
          action={
            <Button icon="plus" onClick={() => setCreating(true)}>
              Créer un modèle
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <article key={template.id} className="panel overflow-hidden">
              {/* A 9:16 frame keeps its own aspect ratio, so it is centred on a
                  darker stage rather than stretched to the card width. */}
              <div className="flex justify-center border-b border-ink-500 bg-ink-900/50 p-4">
                <div className="relative aspect-[9/16] w-36 overflow-hidden rounded-lg border border-ink-500 bg-gradient-to-br from-ink-600 to-ink-900">
                  <div className="absolute inset-0 grid-lines opacity-20" aria-hidden="true" />
                  <SubtitleOverlay
                    text={SAMPLE}
                    boxHeight={256}
                    appearance={{
                      style: template.style,
                      size: template.size,
                      position: template.position,
                      accent: template.accent_color,
                    }}
                  />
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-chalk">
                      {template.name}
                    </h2>
                    <p className="mt-1 text-xs text-muted">
                      {SUBTITLE_STYLE_LABELS[template.style]?.name ?? template.style} &middot;{' '}
                      {SUBTITLE_SIZE_LABELS[template.size]} &middot;{' '}
                      {SUBTITLE_POSITION_LABELS[template.position]}
                    </p>
                  </div>
                  <IconButton
                    icon="trash"
                    label={`Supprimer ${template.name}`}
                    size="sm"
                    onClick={() => setDeleting(template)}
                  />
                </div>

                {template.is_default ? (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-positive-500/12 px-2 py-1 text-2xs font-medium text-positive-500">
                    <Icon name="check" size={11} />
                    Appliqué par défaut
                  </p>
                ) : (
                  <Button
                    className="mt-3"
                    variant="secondary"
                    size="sm"
                    block
                    onClick={() => setDefault(template)}
                  >
                    Définir par défaut
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Nouveau modèle de sous-titres"
        description="L’aperçu ci-dessous correspond exactement au rendu incrusté dans la vidéo."
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Annuler
            </Button>
            <Button onClick={create} loading={working} disabled={!name.trim()}>
              Enregistrer le modèle
            </Button>
          </>
        }
      >
        <div className="grid gap-5 sm:grid-cols-[13rem_1fr]">
          <div className="relative aspect-[9/16] overflow-hidden rounded-lg border border-ink-500 bg-gradient-to-br from-ink-600 to-ink-900">
            <div className="absolute inset-0 grid-lines opacity-20" aria-hidden="true" />
            <SubtitleOverlay
              text={SAMPLE}
              boxHeight={340}
              appearance={{ style, size, position, accent: ACCENT }}
            />
          </div>

          <div className="space-y-4">
            <Field
              label="Nom du modèle"
              value={name}
              maxLength={80}
              placeholder="Ex : Punch orange bas"
              onChange={(event) => setName(event.target.value)}
            />

            <div>
              <p className="label">Style</p>
              <div className="grid grid-cols-3 gap-2">
                {(['clean', 'punch', 'accent'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStyle(value)}
                    aria-pressed={style === value}
                    className={`rounded-lg border p-2 transition-colors
                      ${style === value ? 'border-blue-500 bg-blue-500/10' : 'border-ink-500'}`}
                  >
                    <StyleSwatch style={value} accent={ACCENT} />
                    <span
                      className={`mt-1.5 block text-2xs font-medium ${
                        style === value ? 'text-blue-400' : 'text-muted'
                      }`}
                    >
                      {SUBTITLE_STYLE_LABELS[value].name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <SegmentedControl
              legend="Taille"
              value={size}
              onChange={setSize}
              options={(['small', 'medium', 'large'] as const).map((value) => ({
                value,
                label: SUBTITLE_SIZE_LABELS[value],
              }))}
            />
            <SegmentedControl
              legend="Position"
              value={position}
              onChange={setPosition}
              options={(['top', 'middle', 'bottom'] as const).map((value) => ({
                value,
                label: SUBTITLE_POSITION_LABELS[value],
              }))}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Supprimer ce modèle ?"
        description="Les clips déjà exportés ne sont pas affectés."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Annuler
            </Button>
            <Button variant="danger" icon="trash" onClick={remove} loading={working}>
              Supprimer
            </Button>
          </>
        }
      />
    </div>
  )
}
