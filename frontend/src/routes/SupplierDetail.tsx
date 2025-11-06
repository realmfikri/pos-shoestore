import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { AuthorizedFetch, useAuth } from '../modules/auth/AuthProvider'
import { PurchaseOrderSummary, SupplierSummary } from '../lib/purchasingTypes'
import { classNames } from '../lib/classNames'

const fetchSupplier = async (authorizedFetch: AuthorizedFetch, id: string): Promise<SupplierSummary> => {
  const response = await authorizedFetch(`/api/suppliers/${id}`)
  if (!response.ok) {
    throw new Error('Unable to load supplier')
  }

  return (await response.json()) as SupplierSummary
}

const updateSupplier = async (
  authorizedFetch: AuthorizedFetch,
  id: string,
  payload: Partial<Omit<SupplierSummary, 'id' | 'createdAt' | 'updatedAt'>>,
) => {
  const response = await authorizedFetch(`/api/suppliers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message ?? 'Unable to update supplier right now')
  }

  return response.json()
}

const fetchSupplierPurchaseOrders = async (
  authorizedFetch: AuthorizedFetch,
  supplierId: string,
): Promise<PurchaseOrderSummary[]> => {
  const response = await authorizedFetch(`/api/po?supplierId=${supplierId}`)
  if (!response.ok) {
    throw new Error('Unable to load supplier purchase orders')
  }

  return (await response.json()) as PurchaseOrderSummary[]
}

const statusBadgeClass = (status: PurchaseOrderSummary['status']) => {
  switch (status) {
    case 'RECEIVED':
      return 'bg-emerald-100 text-emerald-700'
    case 'PARTIALLY_RECEIVED':
      return 'bg-amber-100 text-amber-700'
    case 'CANCELLED':
      return 'bg-rose-100 text-rose-700'
    default:
      return 'bg-sky-100 text-sky-700'
  }
}

export const SupplierDetail = () => {
  const { id } = useParams<{ id: string }>()
  const { authorizedFetch } = useAuth()
  const queryClient = useQueryClient()
  const [formState, setFormState] = useState({
    name: '',
    contact: '',
    email: '',
    phone: '',
    address: '',
  })
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const supplierQuery = useQuery({
    queryKey: ['suppliers', id],
    queryFn: () => fetchSupplier(authorizedFetch, id!),
    enabled: Boolean(id),
  })

  const purchaseOrdersQuery = useQuery({
    queryKey: ['purchaseOrders', 'supplier', id],
    queryFn: () => fetchSupplierPurchaseOrders(authorizedFetch, id!),
    enabled: Boolean(id),
  })

  useEffect(() => {
    if (supplierQuery.data) {
      setFormState({
        name: supplierQuery.data.name,
        contact: supplierQuery.data.contact ?? '',
        email: supplierQuery.data.email ?? '',
        phone: supplierQuery.data.phone ?? '',
        address: supplierQuery.data.address ?? '',
      })
    }
  }, [supplierQuery.data])

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<SupplierSummary>) =>
      updateSupplier(authorizedFetch, id!, {
        name: payload.name,
        contact: payload.contact ?? undefined,
        email: payload.email ?? undefined,
        phone: payload.phone ?? undefined,
        address: payload.address ?? undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      queryClient.invalidateQueries({ queryKey: ['suppliers', id] })
      setStatusMessage('Supplier details updated.')
    },
    onError: (error: unknown) => {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to update supplier right now')
    },
  })

  if (supplierQuery.isLoading) {
    return <p className="text-sm text-ink-500">Loading supplier…</p>
  }

  if (supplierQuery.error || !supplierQuery.data) {
    const message = supplierQuery.error instanceof Error ? supplierQuery.error.message : 'Supplier not found'
    return <p className="text-sm text-red-600">{message}</p>
  }

  const supplier = supplierQuery.data
  const purchaseOrders = purchaseOrdersQuery.data ?? []

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatusMessage(null)
    updateMutation.mutate(formState)
  }

  const outstandingOrders = purchaseOrders.filter((order) => order.status !== 'RECEIVED' && order.status !== 'CANCELLED')

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-brand-dark">{supplier.name}</h3>
          <p className="text-sm text-ink-500">Created {new Date(supplier.createdAt).toLocaleDateString()}</p>
        </div>
        {statusMessage ? <p className="text-sm text-brand-dark">{statusMessage}</p> : null}
      </div>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        <div className="sm:col-span-2">
          <label htmlFor="name" className="block text-sm font-semibold text-ink-700">
            Name
          </label>
          <input
            id="name"
            name="name"
            value={formState.name}
            onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
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
            value={formState.contact}
            onChange={(event) => setFormState((prev) => ({ ...prev, contact: event.target.value }))}
            className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-semibold text-ink-700">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            value={formState.phone}
            onChange={(event) => setFormState((prev) => ({ ...prev, phone: event.target.value }))}
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
            value={formState.email}
            onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
            className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="address" className="block text-sm font-semibold text-ink-700">
            Address
          </label>
          <textarea
            id="address"
            name="address"
            value={formState.address}
            onChange={(event) => setFormState((prev) => ({ ...prev, address: event.target.value }))}
            rows={3}
            className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="button-primary" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      <div className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-base font-semibold text-brand-dark">Purchase orders</h4>
            <p className="text-sm text-ink-500">Review outstanding and historical orders from this supplier.</p>
          </div>
          <div className="rounded-full border border-ink-200 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
            {outstandingOrders.length} open
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-ink-100">
          <table className="min-w-full divide-y divide-ink-100 text-sm">
            <thead className="bg-brand-surface/80">
              <tr>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Order</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Created</th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide text-ink-400">Lines</th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide text-ink-400">Outstanding</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50 bg-white/95">
              {purchaseOrders.map((order) => {
                const outstanding = order.items.reduce(
                  (sum, item) => sum + Math.max(item.quantityOrdered - item.quantityReceived, 0),
                  0,
                )

                return (
                  <tr key={order.id} className="transition hover:bg-brand-surface/60">
                    <td className="px-4 py-3 font-medium text-brand-dark">
                      <Link to={`/purchase-orders/${order.id}`} className="hover:underline">
                        {order.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-500">{new Date(order.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right text-ink-500">{order.items.length}</td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-primary">{outstanding}</td>
                    <td className="px-4 py-3">
                      <span
                        className={classNames(
                          'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                          statusBadgeClass(order.status),
                        )}
                      >
                        {order.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {purchaseOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-ink-400">
                    No purchase orders yet for this supplier.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
