import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AuthLayout } from '../components/AuthLayout'
import { Icon } from '../components/Icon'
import { Alert, Button, Field, IconButton } from '../components/ui'
import { useAuth, useToast } from '../context/AppContext'
import { ApiError } from '../lib/api'

interface Errors {
  username?: string
  email?: string
  password?: string
}

function strengthOf(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (password.length < 8) return { score: 0, label: 'Too short' }
  const variety =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/\d/.test(password)) +
    Number(/[^\w\s]/.test(password))
  if (variety <= 1) return { score: 1, label: 'Weak' }
  if (variety === 2 || password.length < 12) return { score: 2, label: 'Fair' }
  return { score: 3, label: 'Strong' }
}

export default function Register() {
  const { register } = useAuth()
  const { notify } = useToast()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const refs = {
    username: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
  }

  const strength = useMemo(() => strengthOf(password), [password])

  const validate = (): Errors => {
    const next: Errors = {}
    if (username.trim().length < 2) next.username = 'Your username must be at least 2 characters.'
    else if (username.trim().length > 40) next.username = 'Your username is too long (40 max).'

    if (!email.trim()) next.email = 'Enter your email address.'
    else if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email.trim()))
      next.email = 'This email address does not look valid.'

    if (password.length < 8) next.password = 'Use at least 8 characters.'
    else if (/^\d+$/.test(password) || /^[a-zA-Z]+$/.test(password))
      next.password = 'Mix letters and numbers for a stronger password.'

    setErrors(next)
    return next
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)

    const invalid = validate()
    const firstInvalid = (['username', 'email', 'password'] as const).find((key) => invalid[key])
    if (firstInvalid) {
      refs[firstInvalid].current?.focus()
      return
    }

    setSubmitting(true)
    try {
      await register(email.trim(), username.trim(), password, remember)
      notify(`Welcome to Fastclip, ${username.trim()}!`)
      navigate('/app', { replace: true })
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Unable to create your account right now.'
      if (error instanceof ApiError && error.status === 409) {
        setErrors((prev) => ({ ...prev, email: message }))
        refs.email.current?.focus()
      } else {
        setFormError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const meterColor = ['bg-negative-600', 'bg-negative-500', 'bg-flame-500', 'bg-positive-500'][
    strength.score
  ]

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free, no credit card required. Your first clip in minutes."
      footer={
        <p>
          Already have an account?{' '}
          <Link to="/connexion" className="link font-medium">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError && (
          <div role="alert">
            <Alert tone="error" title="Sign-up denied">
              {formError}
            </Alert>
          </div>
        )}

        <Field
          ref={refs.username}
          label="Username"
          autoComplete="nickname"
          placeholder="Your creator name"
          icon="user"
          required
          maxLength={40}
          value={username}
          error={errors.username}
          hint="Shown on your dashboard. You can change it at any time."
          onChange={(event) => {
            setUsername(event.target.value)
            if (errors.username) setErrors((prev) => ({ ...prev, username: undefined }))
          }}
        />

        <Field
          ref={refs.email}
          label="Email address"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          icon="mail"
          required
          value={email}
          error={errors.email}
          onChange={(event) => {
            setEmail(event.target.value)
            if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }))
          }}
        />

        <div>
          <Field
            ref={refs.password}
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="At least 8 characters"
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
                label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((value) => !value)}
              />
            }
          />
          {password && !errors.password && (
            <div className="mt-2 flex items-center gap-3">
              <div className="flex flex-1 gap-1" aria-hidden="true">
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                      index < strength.score ? meterColor : 'bg-ink-500'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-muted">
                Strength: <span className="text-chalk">{strength.label}</span>
              </span>
            </div>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-ink-400 bg-ink-900 text-blue-600
              focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-0"
          />
          Remember me
        </label>

        <Button type="submit" size="lg" block loading={submitting}>
          {submitting ? 'Creating your account...' : 'Create my account'}
        </Button>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
          <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-positive-500" />
          Your videos are automatically deleted 24 hours after upload.
        </p>
      </form>
    </AuthLayout>
  )
}
