import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AuthorizedFetch, useAuth } from '../modules/auth/AuthProvider'
import { SupplierSummary } from '../lib/purchasingTypes'

const fetchSuppliers = async (authorizedFetch: AuthorizedFetch): Promise<SupplierSummary[]> => {
  const response = await authorizedFetch('/api/suppliers')
  if (!response.ok) {
    throw new Error('Unable to load suppliers')
  }

  return (await response.json()) as SupplierSummary[]
}

const createSupplier = async (
  authorizedFetch: AuthorizedFetch,
  payload: Omit<SupplierSummary, 'id' | 'createdAt' | 'updatedAt'>,
) => {
  const response = await authorizedFetch('/api/suppliers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message ?? 'Unable to create supplier right now')
  }

  return response.json()
}

export const SuppliersIndex = () => {
  const { authorizedFetch } = useAuth()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => fetchSuppliers(authorizedFetch),
  })

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; contact?: string; email?: string; phone?: string; address?: string }) =>
      createSupplier(authorizedFetch, payload as Omit<SupplierSummary, 'id' | 'createdAt' | 'updatedAt'>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      setFormError(null)
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Unable to create supplier right now')
    },
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = {
      name: String(form.get('name') ?? ''),
      contact: String(form.get('contact') ?? '') || undefined,
      email: String(form.get('email') ?? '') || undefined,
      phone: String(form.get('phone') ?? '') || undefined,
      address: String(form.get('address') ?? '') || undefined,
    }

    setFormError(null)
    createMutation.mutate(payload, {
      onSuccess: () => {
        event.currentTarget.reset()
      },
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-brand-dark">Suppliers</h3>
          <p className="text-sm text-ink-500">
            Manage vendor relationships and keep contact information at your fingertips.
          </p>
        </div>
        {isLoading ? <p className="text-sm text-ink-500">Loading suppliers…</p> : null}
        {error ? <p className="text-sm text-red-600">{(error as Error).message}</p> : null}
        <div className="overflow-hidden rounded-2xl border border-ink-100">
          <table className="min-w-full divide-y divide-ink-100 text-sm">
            <thead className="bg-brand-surface/80">
              <tr>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Name</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Contact</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Phone</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50 bg-white/95">
              {(data ?? []).map((supplier) => (
                <tr key={supplier.id} className="transition hover:bg-brand-surface/60">
                  <td className="px-4 py-3 font-medium text-brand-dark">
                    <Link to={`/suppliers/${supplier.id}`} className="hover:underline">
                      {supplier.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-500">{supplier.contact ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-500">{supplier.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-500">{supplier.email ?? '—'}</td>
                </tr>
              ))}
              {(!data || data.length === 0) && !isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-ink-400">
                    No suppliers yet. Add your first vendor using the form.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      <div className="space-y-4 rounded-2xl border border-ink-100 bg-white/95 p-5 shadow-sm">
        <div>
          <h4 className="text-base font-semibold text-brand-dark">Add supplier</h4>
          <p className="text-sm text-ink-500">Capture new supplier details for purchasing and receiving workflows.</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-ink-700">
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>
          <div>
            <label htmlFor="contact" className="block text-sm font-semibold text-ink-700">
              Primary contact
            </label>
            <input
              id="contact"
              name="contact"
              className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="phone" className="block text-sm font-semibold text-ink-700">
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-ink-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
              />
            </div>
          </div>
          <div>
            <label htmlFor="address" className="block text-sm font-semibold text-ink-700">
              Address
            </label>
            <textarea
              id="address"
              name="address"
              rows={3}
              className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>
          <div className="flex flex-col gap-2">
            <button type="submit" className="button-primary self-start" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving…' : 'Save supplier'}
            </button>
            {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          </div>
        </form>
      </div>
    </div>
  )
}
