import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { AuthLayout } from '../components/AuthLayout'
import { Alert, Button, Field, IconButton } from '../components/ui'
import { useAuth, useToast } from '../context/AppContext'
import { ApiError } from '../lib/api'

export default function Login() {
  const { login } = useAuth()
  const { notify } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const validate = () => {
    const next: typeof errors = {}
    if (!email.trim()) next.email = 'Entre ton adresse email.'
    else if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email.trim()))
      next.email = 'Cette adresse email ne semble pas valide.'
    if (!password) next.password = 'Entre ton mot de passe.'
    setErrors(next)
    return next
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)

    const invalid = validate()
    if (Object.keys(invalid).length) {
      // Move focus to the first field that needs attention.
      if (invalid.email) emailRef.current?.focus()
      else passwordRef.current?.focus()
      return
    }

    setSubmitting(true)
    try {
      await login(email.trim(), password, remember)
      notify('Content de te revoir !')
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from.startsWith('/app') ? from : '/app', { replace: true })
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Connexion impossible pour le moment.',
      )
      passwordRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Connexion"
      subtitle="Retrouve tes projets et tes clips exportés."
      footer={
        <p>
          Pas encore de compte ?{' '}
          <Link to="/inscription" className="link font-medium">
            Créer un compte
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError && (
          <div role="alert">
            <Alert tone="error" title="Connexion refusée">
              {formError}
            </Alert>
          </div>
        )}

        <Field
          ref={emailRef}
          label="Adresse email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="toi@exemple.com"
          icon="mail"
          required
          value={email}
          error={errors.email}
          onChange={(event) => {
            setEmail(event.target.value)
            if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }))
          }}
        />

        <Field
          ref={passwordRef}
          label="Mot de passe"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="********"
          icon="lock"
          required
          value={password}
          error={errors.password}
          onChange={(event) => {
            setPassword(event.target.value)
            if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }))
          }}
          trailing={
            <IconButton
              type="button"
              size="sm"
              icon={showPassword ? 'eye-off' : 'eye'}
              label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              onClick={() => setShowPassword((value) => !value)}
            />
          }
        />

        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-ink-400 bg-ink-900 text-blue-600
                focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-0"
            />
            Se souvenir de moi
          </label>
          <Link to="/mot-de-passe-oublie" className="link text-sm">
            Mot de passe oublié ?
          </Link>
        </div>

        <Button type="submit" size="lg" block loading={submitting}>
          {submitting ? 'Connexion...' : 'Se connecter'}
        </Button>
      </form>
    </AuthLayout>
  )
}
