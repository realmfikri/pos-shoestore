import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AuthorizedFetch, useAuth } from '../modules/auth/AuthProvider'
import { PurchaseOrderSummary } from '../lib/purchasingTypes'
import { classNames } from '../lib/classNames'

const fetchPurchaseOrders = async (authorizedFetch: AuthorizedFetch): Promise<PurchaseOrderSummary[]> => {
  const response = await authorizedFetch('/api/po')
  if (!response.ok) {
    throw new Error('Unable to load purchase orders')
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

export const PurchaseOrdersList = () => {
  const { authorizedFetch } = useAuth()
  const { data, isLoading, error } = useQuery({
    queryKey: ['purchaseOrders'],
    queryFn: () => fetchPurchaseOrders(authorizedFetch),
  })

  const purchaseOrders = useMemo(() => data ?? [], [data])
  const openOrders = useMemo(
    () => purchaseOrders.filter((order) => order.status === 'DRAFT' || order.status === 'PARTIALLY_RECEIVED'),
    [purchaseOrders],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-brand-dark">Purchase orders</h3>
          <p className="text-sm text-ink-500">
            Plan restocks, track supplier commitments, and monitor receiving progress across all orders.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Link to="/purchase-orders/new" className="button-primary">
            Create purchase order
          </Link>
          <span className="rounded-full border border-ink-200 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
            {openOrders.length} open
          </span>
        </div>
      </div>
      {isLoading ? <p className="text-sm text-ink-500">Loading purchase orders…</p> : null}
      {error ? <p className="text-sm text-red-600">{(error as Error).message}</p> : null}
      <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-ink-100">
        <table className="min-w-[680px] divide-y divide-ink-100 text-sm">
          <thead className="bg-brand-surface/80">
            <tr>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Order</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Supplier</th>
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
                  <td className="px-4 py-3 text-ink-500">{order.supplier.name}</td>
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
            {purchaseOrders.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-ink-400">
                  No purchase orders yet. Create your first replenishment order to get started.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
