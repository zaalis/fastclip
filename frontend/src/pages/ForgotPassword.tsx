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
      setError('Cette adresse email ne semble pas valide.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const response = await api.auth.passwordReset(email.trim())
      setResult(response.message)
    } catch (caught) {
      notifyError(caught, 'Demande impossible pour le moment.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Mot de passe oublié"
      subtitle="Indique ton adresse email pour lancer une demande de réinitialisation."
      footer={
        <p>
          <Link to="/connexion" className="link font-medium">
            Retour a la connexion
          </Link>
        </p>
      }
    >
      {/* Honesty first: this installation has no mail transport, and says so. */}
      <Alert tone="warning" title="Envoi d’email non configuré">
        Cette installation de Fastclip n’a pas encore d’infrastructure d’envoi
        d’email. La réinitialisation par lien est la prochaine évolution prévue.
        En attendant, contacte l’administrateur du serveur.
      </Alert>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
        <Field
          label="Adresse email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="toi@exemple.com"
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
            <Alert tone="info" title="Demande enregistrée">
              {result}
            </Alert>
          </div>
        )}

        <Button type="submit" size="lg" block loading={submitting} variant="secondary">
          {submitting ? 'Envoi...' : 'Envoyer la demande'}
        </Button>
      </form>
    </AuthLayout>
  )
}
