import { FormEvent, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '../modules/auth/AuthProvider'
import { themeTokens } from '../theme/tokens'
import { Spinner } from '../components/ui/Spinner'

interface LocationState {
  from?: Location
}

export const LoginPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, status } = useAuth()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationKey: ['login'],
    mutationFn: async (credentials: { email: string; password: string }) => {
      await login(credentials)
    },
    onSuccess: () => {
      const state = location.state as LocationState | null
      const destination = state?.from?.pathname ?? '/pos'
      navigate(destination, { replace: true })
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to sign in right now')
    },
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')

    setError(null)
    mutation.mutate({ email, password })
  }

  useEffect(() => {
    if (status === 'authenticated') {
      navigate('/pos', { replace: true })
    }
  }, [navigate, status])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-surface">
        <Spinner label="Loading session" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-surface px-4 py-10">
      <div className="card w-full max-w-md space-y-6 text-left" style={{ padding: themeTokens.spacing.gutter.cozy }}>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-brand-secondary">Shoehaven POS</p>
          <h1 className="text-3xl font-display font-bold text-brand-dark">Sign in to your store</h1>
          <p className="text-sm text-ink-500">
            Access the unified POS, inventory, and receiving tools your team depends on.
          </p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium text-ink-700">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium text-ink-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button type="submit" className="button-primary w-full justify-center" disabled={mutation.isPending}>
            {mutation.isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="text-xs text-ink-400">
          Need access? Contact your Shoehaven administrator to create an account.
        </p>
      </div>
    </div>
  )
}
