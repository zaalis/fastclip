import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { AuthLayout } from '../components/AuthLayout'
import { Alert, Button, Field } from '../components/ui'
import { useToast } from '../context/AppContext'
import { api } from '../lib/api'

export default function ForgotPassword() {
  const { notifyError } = useToast()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email.trim())) {
      setError('This email address does not look valid.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const response = await api.auth.passwordReset(email.trim())
      setResult(response.message)
    } catch (caught) {
      notifyError(caught, 'Unable to send your request right now.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your email address to start a password-reset request."
      footer={
        <p>
          <Link to="/connexion" className="link font-medium">
            Back to sign in
          </Link>
        </p>
      }
    >
      {/* Honesty first: this installation has no mail transport, and says so. */}
      <Alert tone="warning" title="Email delivery is not configured">
        This Fastclip installation does not yet have email delivery configured.
        Password-reset links are planned for a future update. In the meantime,
        contact the server administrator.
      </Alert>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
        <Field
          label="Email address"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          icon="mail"
          required
          value={email}
          error={error}
          onChange={(event) => {
            setEmail(event.target.value)
            if (error) setError(null)
          }}
        />

        {result && (
          <div role="status">
            <Alert tone="info" title="Request saved">
              {result}
            </Alert>
          </div>
        )}

        <Button type="submit" size="lg" block loading={submitting} variant="secondary">
          {submitting ? 'Sending...' : 'Send request'}
        </Button>
      </form>
    </AuthLayout>
  )
}
