import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { AuthorizedFetch, useAuth } from '../modules/auth/AuthProvider'
import { PurchaseOrderSummary } from '../lib/purchasingTypes'
import { classNames } from '../lib/classNames'

const fetchPurchaseOrder = async (authorizedFetch: AuthorizedFetch, id: string): Promise<PurchaseOrderSummary> => {
  const response = await authorizedFetch(`/api/po/${id}`)
  if (!response.ok) {
    throw new Error('Unable to load purchase order')
  }

  return (await response.json()) as PurchaseOrderSummary
}

const receivePurchaseOrder = async (
  authorizedFetch: AuthorizedFetch,
  id: string,
  payload: { items: Array<{ itemId: string; quantityReceived: number; costCents?: number }> },
): Promise<PurchaseOrderSummary> => {
  const response = await authorizedFetch(`/api/po/${id}/receive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message ?? 'Unable to record receipt right now')
  }

  return (await response.json()) as PurchaseOrderSummary
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

type ReceiptFormState = Record<string, { quantity: number; costInput: string }>

export const PurchaseOrderDetail = () => {
  const { id } = useParams<{ id: string }>()
  const { authorizedFetch } = useAuth()
  const queryClient = useQueryClient()
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [formState, setFormState] = useState<ReceiptFormState>({})

  const orderQuery = useQuery({
    queryKey: ['purchaseOrders', id],
    queryFn: () => fetchPurchaseOrder(authorizedFetch, id!),
    enabled: Boolean(id),
  })

  useEffect(() => {
    if (orderQuery.data) {
      const nextState: ReceiptFormState = {}
      orderQuery.data.items.forEach((item) => {
        const outstanding = Math.max(item.quantityOrdered - item.quantityReceived, 0)
        nextState[item.id] = {
          quantity: outstanding,
          costInput: item.costCents != null ? (item.costCents / 100).toFixed(2) : '',
        }
      })
      setFormState(nextState)
    }
  }, [orderQuery.data])

  const receiveMutation = useMutation({
    mutationFn: (payload: { items: Array<{ itemId: string; quantityReceived: number; costCents?: number }> }) =>
      receivePurchaseOrder(authorizedFetch, id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] })
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', id] })
      setStatusMessage('Receipt recorded successfully.')
    },
    onError: (error: unknown) => {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to record receipt right now')
    },
  })

  const order = orderQuery.data
  const receipts = useMemo(() => order?.receipts ?? [], [order])

  if (orderQuery.isLoading) {
    return <p className="text-sm text-ink-500">Loading purchase order…</p>
  }

  if (orderQuery.error || !order) {
    const message = orderQuery.error instanceof Error ? orderQuery.error.message : 'Purchase order not found'
    return <p className="text-sm text-red-600">{message}</p>
  }
  const outstandingTotal = order.items.reduce(
    (sum, item) => sum + Math.max(item.quantityOrdered - item.quantityReceived, 0),
    0,
  )
  const isClosed = order.status === 'RECEIVED' || order.status === 'CANCELLED'

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isClosed) {
      setStatusMessage('This purchase order is closed and cannot be received again.')
      return
    }

    const entries: Array<{ itemId: string; quantityReceived: number; costCents?: number }> = []
    order.items.forEach((item) => {
      const state = formState[item.id]
      if (!state || state.quantity <= 0) {
        return
      }
      const costValue = state.costInput.trim().length > 0 ? Math.round(parseFloat(state.costInput) * 100) : undefined
      entries.push({
        itemId: item.id,
        quantityReceived: state.quantity,
        costCents: Number.isFinite(costValue) ? costValue : undefined,
      })
    })

    if (entries.length === 0) {
      setStatusMessage('Enter at least one received quantity greater than zero.')
      return
    }

    setStatusMessage(null)
    receiveMutation.mutate({ items: entries })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-brand-dark">Purchase order {order.id.slice(0, 8)}</h3>
          <p className="text-sm text-ink-500">
            Supplier {order.supplier.name} · Created {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={classNames(
              'inline-flex items-center rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wide',
              statusBadgeClass(order.status),
            )}
          >
            {order.status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>
      {statusMessage ? <p className="text-sm text-brand-dark">{statusMessage}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-ink-100">
        <table className="min-w-full divide-y divide-ink-100 text-sm">
          <thead className="bg-brand-surface/80">
            <tr>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Variant</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Ordered</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Received</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-50 bg-white/95">
            {order.items.map((item) => {
              const outstanding = Math.max(item.quantityOrdered - item.quantityReceived, 0)
              return (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-brand-dark">{item.variant.productName}</p>
                    <p className="text-xs text-ink-400">{item.variant.sku} · {item.variant.brandName}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-500">{item.quantityOrdered}</td>
                  <td className="px-4 py-3 text-ink-500">{item.quantityReceived}</td>
                  <td className="px-4 py-3 font-semibold text-brand-primary">{outstanding}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <form className="space-y-4 rounded-2xl border border-ink-100 bg-white/95 p-5 shadow-sm" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-base font-semibold text-brand-dark">Receive items</h4>
            <p className="text-sm text-ink-500">Enter quantities received for each line. Leave zero for items not received.</p>
          </div>
          <div className="text-xs uppercase tracking-wide text-ink-400">Outstanding total: {outstandingTotal}</div>
        </div>
        <div className="grid gap-3">
          {order.items.map((item) => {
            const outstanding = Math.max(item.quantityOrdered - item.quantityReceived, 0)
            const entry = formState[item.id] ?? { quantity: 0, costInput: '' }
            return (
              <div key={item.id} className="grid gap-3 rounded-2xl border border-ink-100 bg-white/90 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-brand-dark">{item.variant.productName}</p>
                  <p className="text-xs text-ink-400">{item.variant.sku}</p>
                  <p className="text-xs text-ink-400">Outstanding {outstanding}</p>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold uppercase tracking-wide text-ink-400">Quantity</label>
                  <input
                    type="number"
                    min={0}
                    max={outstanding}
                    value={entry.quantity}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        [item.id]: {
                          quantity: Number(event.target.value),
                          costInput: entry.costInput,
                        },
                      }))
                    }
                    className="mt-1 w-24 rounded-xl border border-ink-200 px-3 py-1.5 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                    disabled={isClosed}
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold uppercase tracking-wide text-ink-400">Cost (IDR)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={entry.costInput}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        [item.id]: {
                          quantity: entry.quantity,
                          costInput: event.target.value,
                        },
                      }))
                    }
                    className="mt-1 w-28 rounded-xl border border-ink-200 px-3 py-1.5 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                    disabled={isClosed}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="submit" className="button-primary sm:self-start" disabled={receiveMutation.isPending || isClosed}>
            {receiveMutation.isPending ? 'Recording…' : 'Record receipt'}
          </button>
          {isClosed ? <p className="text-sm text-ink-400">Purchase order is closed.</p> : null}
        </div>
      </form>

      <div className="space-y-4">
        <h4 className="text-base font-semibold text-brand-dark">Receipts</h4>
        {receipts.length > 0 ? (
          <div className="space-y-3">
            {receipts.map((receipt) => (
              <div key={receipt.id} className="rounded-2xl border border-ink-100 bg-white/95 p-4 shadow-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-brand-dark">
                    Received {new Date(receipt.receivedAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-ink-400">
                    {receipt.receivedBy
                      ? `By ${receipt.receivedBy.firstName} ${receipt.receivedBy.lastName}`
                      : 'Auto recorded'}
                  </p>
                </div>
                <ul className="mt-3 divide-y divide-ink-100 text-sm">
                  {receipt.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between py-2">
                      <span>{item.variant.productName}</span>
                      <span className="font-semibold text-brand-primary">{item.quantityReceived}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-ink-200 bg-white/70 p-6 text-sm text-ink-400">
            No receipts have been recorded yet.
          </div>
        )}
      </div>
    </div>
  )
}
