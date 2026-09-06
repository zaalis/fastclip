import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Icon } from '../components/Icon'
import { Alert, Avatar, Button, Field, Modal, ProgressBar, Skeleton } from '../components/ui'
import { useAuth, useToast } from '../context/AppContext'
import { api, ApiError, type ApiKeyStatus, type PrivacyData } from '../lib/api'
import { formatBytes, formatDate } from '../lib/format'

type Tab = 'profil' | 'connexion' | 'securite' | 'donnees'

const TABS: { id: Tab; label: string; icon: 'user' | 'sparkle' | 'lock' | 'shield' }[] = [
  { id: 'profil', label: 'Profile', icon: 'user' },
  { id: 'connexion', label: 'AI connection', icon: 'sparkle' },
  { id: 'securite', label: 'Security', icon: 'lock' },
  { id: 'donnees', label: 'Data and privacy', icon: 'shield' },
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
      setProfileError('Your username must be at least 2 characters.')
      return
    }
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email.trim())) {
      setProfileError('This email address does not look valid.')
      return
    }

    setSavingProfile(true)
    try {
      const { user: next } = await api.account.updateProfile({
        username: username.trim(),
        email: email.trim(),
      })
      setUser(next)
      notify('Profile updated.')
    } catch (error) {
      setProfileError(
        error instanceof ApiError ? error.message : 'Update failed.',
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
      notify('Profile picture updated.')
    } catch (error) {
      notifyError(error, 'Unable to upload profile picture.')
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
      notify('Profile picture removed.')
    } catch (error) {
      notifyError(error, 'Unable to remove profile picture.')
    } finally {
      setAvatarBusy(false)
    }
  }

  const savePassword = async (event: FormEvent) => {
    event.preventDefault()
    const errors: Record<string, string> = {}
    if (!currentPassword) errors.current = 'Entre ton mot de passe actuel.'
    if (newPassword.length < 8) errors.next = 'Use at least 8 characters.'
    else if (/^\d+$/.test(newPassword) || /^[a-zA-Z]+$/.test(newPassword))
      errors.next = 'Mix letters and numbers.'
    if (newPassword !== confirmPassword) errors.confirm = 'The passwords do not match.'

    setPasswordErrors(errors)
    if (Object.keys(errors).length) return

    setSavingPassword(true)
    try {
      await api.account.changePassword(currentPassword, newPassword)
      notify('Password updated.')
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
      setApiKeyError('Enter a valid Mistral API key.')
      return
    }

    setApiKeyBusy(true)
    try {
      const next = await api.account.saveApiKey(value)
      setApiKeyStatus(next)
      setApiKey('')
      setShowApiKey(false)
      await refreshStatus()
      notify('Mistral connection activated for your account.')
    } catch (error) {
      setApiKeyError(
        error instanceof ApiError ? error.message : 'Unable to connect this key.',
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
      notify('Mistral connection removed.', 'info')
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
      notify('Mistral model updated. Future projects will use this model.')
    } catch (error) {
      setModelError(
        error instanceof ApiError ? error.message : 'Unable to update model.',
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
      notify('Mistral model list refreshed.')
    } catch (error) {
      setModelError(
        error instanceof ApiError ? error.message : 'Unable to refresh models.',
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
      notify('Account deleted. See you soon.')
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
        <p className="eyebrow">Account</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-chalk sm:text-3xl">
          Settings
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Member since {formatDate(user.created_at)}
        </p>
      </header>

      <div
        className="flex gap-1 overflow-x-auto rounded-lg border border-ink-500 bg-ink-800 p-1 no-scrollbar"
        role="tablist"
        aria-label="Settings sections"
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
            <h2 className="text-sm font-semibold text-chalk">Profile picture</h2>
            <div className="mt-4 flex flex-wrap items-center gap-5">
              <Avatar user={user} size={72} />
              <div className="flex flex-wrap gap-2">
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  aria-hidden="true"
                  tabIndex={-1}
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
                  Upload picture
                </Button>
                {user.avatar_url && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    loading={avatarBusy}
                    onClick={removeAvatar}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <p className="hint">JPEG, PNG, or WebP. 3 MB maximum.</p>
          </section>

          <form onSubmit={saveProfile} className="panel space-y-5 p-5" noValidate>
            <h2 className="text-sm font-semibold text-chalk">Information</h2>

            {profileError && (
              <div role="alert">
                <Alert tone="error">{profileError}</Alert>
              </div>
            )}

            <Field
              label="Username"
              value={username}
              maxLength={40}
              autoComplete="nickname"
              onChange={(event) => setUsername(event.target.value)}
              hint="Shown on your dashboard."
            />
            <Field
              label="Email address"
              type="email"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              hint="Used to sign in."
            />

            <div className="flex justify-end">
              <Button type="submit" loading={savingProfile}>
                Save
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
                      Connect your own key to analyze transcripts and generate your three best suggestions.
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
                  {apiKeyStatus?.configured ? 'Connected' : 'Not connected'}
                </span>
              </div>
            </div>

            <form onSubmit={saveApiKey} className="space-y-5 p-5 sm:p-6" noValidate>
              {apiKeyStatus?.configured && (
                <div className="space-y-4 rounded-xl border border-blue-500/25 bg-blue-500/8 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-blue-200">Active key</p>
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
                          Analysis model
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
                            Choose a model
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
                        This list comes from Mistral. Fastclip only verifies the model you choose before saving it.
                      </p>
                      {modelError && <p className="mt-2 text-xs text-negative-500" role="alert">{modelError}</p>}
                    </div>
                  ) : (
                    <Alert tone="warning" title="Models temporarily unavailable">
                      {apiKeyStatus.model_error ?? 'Mistral does not return a usable model for this key.'}
                    </Alert>
                  )}
                </div>
              )}

              <Field
                label={apiKeyStatus?.configured ? 'New API key' : 'Mistral API key'}
                type={showApiKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                icon="lock"
                placeholder="Paste your Mistral key"
                value={apiKey}
                error={apiKeyError}
                hint="It will be verified and associated only with this account. It will not be displayed in plain text again."
                onChange={(event) => {
                  setApiKey(event.target.value)
                  if (apiKeyError) setApiKeyError(null)
                }}
                trailing={
                  <button
                    type="button"
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
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
                  Get a Mistral key
                </a>
                <Button type="submit" icon="check" loading={apiKeyBusy} disabled={!apiKey.trim()}>
                  {apiKeyStatus?.configured ? 'Replace key' : 'Connect my key'}
                </Button>
              </div>
            </form>
          </section>

          <section className="panel-quiet flex gap-3 p-5 text-sm leading-relaxed text-muted">
            <Icon name="shield" size={18} className="mt-0.5 shrink-0 text-blue-400" />
            <p>
              Fastclip uses this connection only when analyzing your projects. Video and audio are never sent to Mistral.
            </p>
          </section>
        </div>
      )}

      {/* --- Security --- */}
      {tab === 'securite' && (
        <div className="space-y-5">
          <form onSubmit={savePassword} className="panel space-y-5 p-5" noValidate>
            <h2 className="text-sm font-semibold text-chalk">Change password</h2>

            <Field
              label="Current password"
              type="password"
              autoComplete="current-password"
              icon="lock"
              value={currentPassword}
              error={passwordErrors.current}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
            <Field
              label="New password"
              type="password"
              autoComplete="new-password"
              icon="lock"
              value={newPassword}
              error={passwordErrors.next}
              onChange={(event) => setNewPassword(event.target.value)}
              hint="At least 8 characters, including letters and numbers."
            />
            <Field
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              icon="lock"
              value={confirmPassword}
              error={passwordErrors.confirm}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />

            <div className="flex justify-end">
              <Button type="submit" loading={savingPassword}>
                Update
              </Button>
            </div>
          </form>

          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-chalk">Session</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Sign out on this device when you are done, especially on a shared computer.
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
              Sign out
            </Button>
          </section>

          <section className="panel border-negative-600/40 p-5">
            <h2 className="text-sm font-semibold text-negative-500">Danger zone</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Deleting your account permanently erases your projects, transcripts,
              exported clips, and all associated files.
            </p>
            <Button
              className="mt-4"
              variant="danger"
              icon="trash"
              onClick={() => setDeleteOpen(true)}
            >
              Delete my account
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
                <h2 className="text-sm font-semibold text-chalk">What Fastclip retains</h2>
                <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                  {[
                    ['Projects', String(privacy.counts.projects)],
                    ['Clips exported', String(privacy.counts.clips)],
                    ['Projects with active files', String(privacy.counts.active_files)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-ink-500 bg-ink-800 p-4">
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="mt-1 text-xl font-bold tabular-nums text-chalk">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-chalk">Storage used</span>
                    <span className="tabular-nums text-muted">
                      {formatBytes(privacy.storage_bytes)} /{' '}
                      {formatBytes(privacy.storage_limit_bytes)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar
                      value={storagePercent}
                      tone={storagePercent > 85 ? 'flame' : 'blue'}
                      label="Storage used"
                    />
                  </div>
                </div>
              </section>

              <section className="panel p-5">
                <h2 className="text-sm font-semibold text-chalk">
                  Privacy and automatic deletion
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
                  <h2 className="text-sm font-semibold text-chalk">Service status</h2>
                  <dl className="mt-4 space-y-3 text-sm">
                    {[
                      {
                        label: 'AI analysis',
                        ok: status.ai.configured,
                        value: status.ai.configured
                          ? `Mistral ${status.ai.model}`
                          : 'Connection needs setup',
                      },
                      {
                        label: 'Transcription',
                        ok: status.transcription.available,
                        value: status.transcription.available
                          ? `faster-whisper ${status.transcription.model} (${status.transcription.compute_type})`
                          : 'Engine not installed',
                      },
                      {
                        label: 'FFmpeg',
                        ok: status.ffmpeg.available,
                        value: status.ffmpeg.available
                          ? `Version ${status.ffmpeg.version}`
                          : 'Not found',
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
        title="Permanently delete your account?"
        description="This action cannot be undone. All your projects, transcripts, and exported clips will be erased."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="trash"
              loading={deleting}
              disabled={!deletePassword}
              onClick={deleteAccount}
            >
              Delete my account
            </Button>
          </>
        }
      >
        <Field
          label="Confirm with your password"
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
