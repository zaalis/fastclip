import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Icon } from '../components/Icon'
import { Alert, Avatar, Button, Field, Modal, ProgressBar, Skeleton } from '../components/ui'
import { useAuth, useToast } from '../context/AppContext'
import { api, ApiError, type ApiKeyStatus, type PrivacyData } from '../lib/api'
import { formatBytes, formatDate } from '../lib/format'

type Tab = 'profil' | 'connexion' | 'securite' | 'donnees'

const TABS: { id: Tab; label: string; icon: 'user' | 'sparkle' | 'lock' | 'shield' }[] = [
  { id: 'profil', label: 'Profil', icon: 'user' },
  { id: 'connexion', label: 'Connexion IA', icon: 'sparkle' },
  { id: 'securite', label: 'Sécurité', icon: 'lock' },
  { id: 'donnees', label: 'Données et confidentialité', icon: 'shield' },
]

export default function Settings() {
  const { user, setUser, logout, status, refreshStatus } = useAuth()
  const { notify, notifyError } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const [tab, setTab] = useState<Tab>(() =>
    new URLSearchParams(location.search).get('section') === 'connexion' ? 'connexion' : 'profil',
  )
  const [privacy, setPrivacy] = useState<PrivacyData | null>(null)

  // Profile
  const [username, setUsername] = useState(user?.username ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const avatarInput = useRef<HTMLInputElement>(null)
  const [avatarBusy, setAvatarBusy] = useState(false)

  // Account-scoped Mistral connection
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [apiKeyBusy, setApiKeyBusy] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const [modelBusy, setModelBusy] = useState(false)

  // Password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({})
  const [savingPassword, setSavingPassword] = useState(false)

  // Delete account
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!user) return
    setUsername(user.username)
    setEmail(user.email)
  }, [user])

  useEffect(() => {
    if (!user) return
    api.account
      .apiKeyStatus()
      .then(setApiKeyStatus)
      .catch(() => setApiKeyStatus(null))
  }, [user])

  useEffect(() => {
    api.account
      .privacy()
      .then(setPrivacy)
      .catch(() => setPrivacy(null))
  }, [user])

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    setProfileError(null)

    if (username.trim().length < 2) {
      setProfileError('Le pseudo doit faire au moins 2 caractères.')
      return
    }
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email.trim())) {
      setProfileError('Cette adresse email ne semble pas valide.')
      return
    }

    setSavingProfile(true)
    try {
      const { user: next } = await api.account.updateProfile({
        username: username.trim(),
        email: email.trim(),
      })
      setUser(next)
      notify('Profil mis à jour.')
    } catch (error) {
      setProfileError(
        error instanceof ApiError ? error.message : 'Mise à jour impossible.',
      )
    } finally {
      setSavingProfile(false)
    }
  }

  const uploadAvatar = async (file: File) => {
    setAvatarBusy(true)
    try {
      const { user: next } = await api.account.uploadAvatar(file)
      // Cache-bust so the new image shows immediately.
      setUser({ ...next, avatar_url: `${next.avatar_url}?v=${Date.now()}` })
      notify('Photo de profil mise à jour.')
    } catch (error) {
      notifyError(error, 'Import de la photo impossible.')
    } finally {
      setAvatarBusy(false)
      if (avatarInput.current) avatarInput.current.value = ''
    }
  }

  const removeAvatar = async () => {
    setAvatarBusy(true)
    try {
      const { user: next } = await api.account.deleteAvatar()
      setUser(next)
      notify('Photo de profil supprimée.')
    } catch (error) {
      notifyError(error, 'Suppression impossible.')
    } finally {
      setAvatarBusy(false)
    }
  }

  const savePassword = async (event: FormEvent) => {
    event.preventDefault()
    const errors: Record<string, string> = {}
    if (!currentPassword) errors.current = 'Entre ton mot de passe actuel.'
    if (newPassword.length < 8) errors.next = 'Au moins 8 caractères.'
    else if (/^\d+$/.test(newPassword) || /^[a-zA-Z]+$/.test(newPassword))
      errors.next = 'Mélange lettres et chiffres.'
    if (newPassword !== confirmPassword) errors.confirm = 'Les deux mots de passe différent.'

    setPasswordErrors(errors)
    if (Object.keys(errors).length) return

    setSavingPassword(true)
    try {
      await api.account.changePassword(currentPassword, newPassword)
      notify('Mot de passe mis à jour.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setPasswordErrors({ current: error.message })
      } else {
        notifyError(error, 'Changement impossible.')
      }
    } finally {
      setSavingPassword(false)
    }
  }

  const saveApiKey = async (event: FormEvent) => {
    event.preventDefault()
    setApiKeyError(null)
    const value = apiKey.trim()
    if (value.length < 20) {
      setApiKeyError('Entre une clé API Mistral valide.')
      return
    }

    setApiKeyBusy(true)
    try {
      const next = await api.account.saveApiKey(value)
      setApiKeyStatus(next)
      setApiKey('')
      setShowApiKey(false)
      await refreshStatus()
      notify('Connexion Mistral activée pour ton compte.')
    } catch (error) {
      setApiKeyError(
        error instanceof ApiError ? error.message : 'Impossible de connecter cette clé.',
      )
    } finally {
      setApiKeyBusy(false)
    }
  }

  const removeApiKey = async () => {
    setApiKeyBusy(true)
    try {
      const next = await api.account.deleteApiKey()
      setApiKeyStatus(next)
      setApiKey('')
      await refreshStatus()
      notify('Connexion Mistral retirée.', 'info')
    } catch (error) {
      notifyError(error, 'Impossible de retirer la connexion.')
    } finally {
      setApiKeyBusy(false)
    }
  }

  const changeApiModel = async (model: string) => {
    if (!apiKeyStatus || model === apiKeyStatus.model) return
    setModelError(null)
    setModelBusy(true)
    try {
      const next = await api.account.updateApiModel(model)
      setApiKeyStatus(next)
      await refreshStatus()
      notify('Modèle Mistral mis à jour. Les prochains projets utiliseront ce modèle.')
    } catch (error) {
      setModelError(
        error instanceof ApiError ? error.message : 'Impossible de modifier le modèle.',
      )
    } finally {
      setModelBusy(false)
    }
  }

  const refreshApiModels = async () => {
    setModelError(null)
    setModelBusy(true)
    try {
      const next = await api.account.refreshApiModels()
      setApiKeyStatus(next)
      await refreshStatus()
      notify('Liste des modèles Mistral actualisée.')
    } catch (error) {
      setModelError(
        error instanceof ApiError ? error.message : 'Impossible d’actualiser les modèles.',
      )
    } finally {
      setModelBusy(false)
    }
  }

  const deleteAccount = async () => {
    setDeleteError(null)
    setDeleting(true)
    try {
      await api.account.deleteAccount(deletePassword)
      notify('Compte supprimé. À bientôt.')
      await logout()
      navigate('/')
    } catch (error) {
      setDeleteError(error instanceof ApiError ? error.message : 'Suppression impossible.')
    } finally {
      setDeleting(false)
    }
  }

  if (!user) return null

  const storagePercent = privacy
    ? Math.round((privacy.storage_bytes / Math.max(1, privacy.storage_limit_bytes)) * 100)
    : 0

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="eyebrow">Compte</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-chalk sm:text-3xl">
          Paramètres
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Membre depuis le {formatDate(user.created_at)}
        </p>
      </header>

      <div
        className="flex gap-1 overflow-x-auto rounded-lg border border-ink-500 bg-ink-800 p-1 no-scrollbar"
        role="tablist"
        aria-label="Sections des paramètres"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`flex shrink-0 items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors
              ${tab === item.id ? 'bg-ink-600 text-chalk' : 'text-muted hover:text-chalk'}`}
          >
            <Icon name={item.icon} size={15} />
            {item.label}
          </button>
        ))}
      </div>

      {/* --- Profile --- */}
      {tab === 'profil' && (
        <div className="space-y-5">
          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-chalk">Photo de profil</h2>
            <div className="mt-4 flex flex-wrap items-center gap-5">
              <Avatar user={user} size={72} />
              <div className="flex flex-wrap gap-2">
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void uploadAvatar(file)
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  icon="image"
                  loading={avatarBusy}
                  onClick={() => avatarInput.current?.click()}
                >
                  Importer une photo
                </Button>
                {user.avatar_url && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    loading={avatarBusy}
                    onClick={removeAvatar}
                  >
                    Supprimer
                  </Button>
                )}
              </div>
            </div>
            <p className="hint">JPEG, PNG ou WebP. 3 Mo maximum.</p>
          </section>

          <form onSubmit={saveProfile} className="panel space-y-5 p-5" noValidate>
            <h2 className="text-sm font-semibold text-chalk">Informations</h2>

            {profileError && (
              <div role="alert">
                <Alert tone="error">{profileError}</Alert>
              </div>
            )}

            <Field
              label="Pseudo"
              value={username}
              maxLength={40}
              autoComplete="nickname"
              onChange={(event) => setUsername(event.target.value)}
              hint="Affiche sur ton tableau de bord."
            />
            <Field
              label="Adresse email"
              type="email"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              hint="Sert à te connecter."
            />

            <div className="flex justify-end">
              <Button type="submit" loading={savingProfile}>
                Enregistrer
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* --- Security --- */}
      {tab === 'connexion' && (
        <div className="space-y-5 animate-page-enter">
          <section className="panel overflow-hidden">
            <div className="relative border-b border-ink-500 p-5 sm:p-6">
              <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-blue-500/15 blur-3xl" />
              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-flame-500/35 bg-flame-500/10 text-flame-500">
                    <Icon name="sparkle" size={21} />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-chalk">Mistral AI</h2>
                    <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
                      Connecte ta propre clé pour analyser tes transcriptions et générer tes trois meilleures propositions.
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                    apiKeyStatus?.configured
                      ? 'border-positive-500/35 bg-positive-500/10 text-positive-500'
                      : 'border-ink-400 bg-ink-800 text-muted'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      apiKeyStatus?.configured ? 'bg-positive-500' : 'bg-muted'
                    }`}
                  />
                  {apiKeyStatus?.configured ? 'Connecté' : 'Non connecté'}
                </span>
              </div>
            </div>

            <form onSubmit={saveApiKey} className="space-y-5 p-5 sm:p-6" noValidate>
              {apiKeyStatus?.configured && (
                <div className="space-y-4 rounded-xl border border-blue-500/25 bg-blue-500/8 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-blue-200">Clé active</p>
                      <p className="mt-1 font-mono text-sm tracking-wide text-chalk">
                        {apiKeyStatus.masked}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon="trash"
                      loading={apiKeyBusy}
                      onClick={removeApiKey}
                    >
                      Retirer
                    </Button>
                  </div>

                  {apiKeyStatus.available_models.length > 0 ? (
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label htmlFor="mistral-model" className="block text-sm font-medium text-chalk">
                          Modèle d’analyse
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          icon="refresh"
                          loading={modelBusy}
                          disabled={apiKeyBusy}
                          onClick={refreshApiModels}
                        >
                          Actualiser
                        </Button>
                      </div>
                      <div className="relative mt-2">
                        <select
                          id="mistral-model"
                          value={apiKeyStatus.model ?? ''}
                          disabled={modelBusy || apiKeyBusy}
                          aria-busy={modelBusy}
                          aria-describedby="mistral-model-help"
                          onChange={(event) => void changeApiModel(event.target.value)}
                          className="field h-11 cursor-pointer appearance-none pr-10 disabled:cursor-wait disabled:opacity-60"
                        >
                          <option value="" disabled>
                            Choisir un modèle
                          </option>
                          {apiKeyStatus.available_models.map((model) => (
                            <option key={model} value={model}>
                              {model}
                            </option>
                          ))}
                        </select>
                        <Icon
                          name="chevron-down"
                          size={16}
                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-flame-300"
                        />
                      </div>
                      <p id="mistral-model-help" className="mt-2 text-xs leading-relaxed text-muted">
                        Cette liste vient de Mistral. Fastclip vérifie uniquement le modèle que tu choisis avant de l’enregistrer.
                      </p>
                      {modelError && <p className="mt-2 text-xs text-negative-500" role="alert">{modelError}</p>}
                    </div>
                  ) : (
                    <Alert tone="warning" title="Modèles temporairement indisponibles">
                      {apiKeyStatus.model_error ?? 'Mistral ne renvoie aucun modèle utilisable pour cette clé.'}
                    </Alert>
                  )}
                </div>
              )}

              <Field
                label={apiKeyStatus?.configured ? 'Nouvelle clé API' : 'Clé API Mistral'}
                type={showApiKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                icon="lock"
                placeholder="Colle ta clé Mistral"
                value={apiKey}
                error={apiKeyError}
                hint="Elle sera vérifiée puis associée uniquement à ce compte. Elle ne sera plus affichée en clair."
                onChange={(event) => {
                  setApiKey(event.target.value)
                  if (apiKeyError) setApiKeyError(null)
                }}
                trailing={
                  <button
                    type="button"
                    aria-label={showApiKey ? 'Masquer la clé API' : 'Afficher la clé API'}
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-ink-600 hover:text-chalk"
                    onClick={() => setShowApiKey((value) => !value)}
                  >
                    <Icon name={showApiKey ? 'eye-off' : 'eye'} size={16} />
                  </button>
                }
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <a
                  href="https://console.mistral.ai/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="link text-sm"
                >
                  Obtenir une clé Mistral
                </a>
                <Button type="submit" icon="check" loading={apiKeyBusy} disabled={!apiKey.trim()}>
                  {apiKeyStatus?.configured ? 'Remplacer la clé' : 'Connecter ma clé'}
                </Button>
              </div>
            </form>
          </section>

          <section className="panel-quiet flex gap-3 p-5 text-sm leading-relaxed text-muted">
            <Icon name="shield" size={18} className="mt-0.5 shrink-0 text-blue-400" />
            <p>
              Fastclip utilise cette connexion seulement lors de l’analyse de tes projets. La vidéo et l’audio ne sont jamais envoyés à Mistral.
            </p>
          </section>
        </div>
      )}

      {/* --- Security --- */}
      {tab === 'securite' && (
        <div className="space-y-5">
          <form onSubmit={savePassword} className="panel space-y-5 p-5" noValidate>
            <h2 className="text-sm font-semibold text-chalk">Changer de mot de passe</h2>

            <Field
              label="Mot de passe actuel"
              type="password"
              autoComplete="current-password"
              icon="lock"
              value={currentPassword}
              error={passwordErrors.current}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
            <Field
              label="Nouveau mot de passe"
              type="password"
              autoComplete="new-password"
              icon="lock"
              value={newPassword}
              error={passwordErrors.next}
              onChange={(event) => setNewPassword(event.target.value)}
              hint="8 caractères minimum, lettres et chiffres."
            />
            <Field
              label="Confirmer le nouveau mot de passe"
              type="password"
              autoComplete="new-password"
              icon="lock"
              value={confirmPassword}
              error={passwordErrors.confirm}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />

            <div className="flex justify-end">
              <Button type="submit" loading={savingPassword}>
                Mettre à jour
              </Button>
            </div>
          </form>

          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-chalk">Session</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Déconnecte cet appareil lorsque tu as terminé, surtout sur un ordinateur partagé.
            </p>
            <Button
              className="mt-4"
              variant="secondary"
              icon="logout"
              onClick={async () => {
                await logout()
                navigate('/')
              }}
            >
              Se déconnecter
            </Button>
          </section>

          <section className="panel border-negative-600/40 p-5">
            <h2 className="text-sm font-semibold text-negative-500">Zone sensible</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              La suppression du compte efface définitivement tes projets, tes
              transcriptions, tes Shorts exportés et tous les fichiers associés.
            </p>
            <Button
              className="mt-4"
              variant="danger"
              icon="trash"
              onClick={() => setDeleteOpen(true)}
            >
              Supprimer mon compte
            </Button>
          </section>
        </div>
      )}

      {/* --- Data & privacy --- */}
      {tab === 'donnees' && (
        <div className="space-y-5">
          {!privacy ? (
            <Skeleton className="h-64" />
          ) : (
            <>
              <section className="panel p-5">
                <h2 className="text-sm font-semibold text-chalk">Ce que Fastclip conserve</h2>
                <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                  {[
                    ['Projets', String(privacy.counts.projects)],
                    ['Clips exportés', String(privacy.counts.clips)],
                    ['Projets avec fichiers actifs', String(privacy.counts.active_files)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-ink-500 bg-ink-800 p-4">
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="mt-1 text-xl font-bold tabular-nums text-chalk">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-chalk">Stockage utilisé</span>
                    <span className="tabular-nums text-muted">
                      {formatBytes(privacy.storage_bytes)} /{' '}
                      {formatBytes(privacy.storage_limit_bytes)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar
                      value={storagePercent}
                      tone={storagePercent > 85 ? 'flame' : 'blue'}
                      label="Stockage utilisé"
                    />
                  </div>
                </div>
              </section>

              <section className="panel p-5">
                <h2 className="text-sm font-semibold text-chalk">
                  Confidentialité et suppression automatique
                </h2>
                <ul className="mt-4 space-y-4">
                  {privacy.policy.map((item) => (
                    <li key={item.title} className="flex gap-3">
                      <Icon
                        name="shield"
                        size={17}
                        className="mt-0.5 shrink-0 text-positive-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-chalk">{item.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted">{item.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {status && (
                <section className="panel p-5">
                  <h2 className="text-sm font-semibold text-chalk">État du service</h2>
                  <dl className="mt-4 space-y-3 text-sm">
                    {[
                      {
                        label: 'Analyse IA',
                        ok: status.ai.configured,
                        value: status.ai.configured
                          ? `Mistral ${status.ai.model}`
                          : 'Connexion à configurer',
                      },
                      {
                        label: 'Transcription',
                        ok: status.transcription.available,
                        value: status.transcription.available
                          ? `faster-whisper ${status.transcription.model} (${status.transcription.compute_type})`
                          : 'Moteur non installe',
                      },
                      {
                        label: 'FFmpeg',
                        ok: status.ffmpeg.available,
                        value: status.ffmpeg.available
                          ? `Version ${status.ffmpeg.version}`
                          : 'Introuvable',
                      },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between gap-3 border-b border-ink-500 pb-3 last:border-0 last:pb-0"
                      >
                        <dt className="text-muted">{row.label}</dt>
                        <dd className="flex items-center gap-2 text-right">
                          <Icon
                            name={row.ok ? 'check' : 'alert'}
                            size={14}
                            className={row.ok ? 'text-positive-500' : 'text-flame-500'}
                          />
                          <span className="text-chalk">{row.value}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
            </>
          )}
        </div>
      )}

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Supprimer définitivement ton compte ?"
        description="Cette action est irréversible. Tous tes projets, transcriptions et Shorts seront effacés."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              icon="trash"
              loading={deleting}
              disabled={!deletePassword}
              onClick={deleteAccount}
            >
              Supprimer mon compte
            </Button>
          </>
        }
      >
        <Field
          label="Confirme avec ton mot de passe"
          type="password"
          autoComplete="current-password"
          icon="lock"
          value={deletePassword}
          error={deleteError}
          onChange={(event) => {
            setDeletePassword(event.target.value)
            if (deleteError) setDeleteError(null)
          }}
        />
      </Modal>
    </div>
  )
}
