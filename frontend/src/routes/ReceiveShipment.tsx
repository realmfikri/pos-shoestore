import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AuthorizedFetch, useAuth } from '../modules/auth/AuthProvider'
import { PurchaseOrderSummary } from '../lib/purchasingTypes'

const fetchPurchaseOrders = async (authorizedFetch: AuthorizedFetch): Promise<PurchaseOrderSummary[]> => {
  const response = await authorizedFetch('/api/po')
  if (!response.ok) {
    throw new Error('Unable to load purchase orders')
  }

  return (await response.json()) as PurchaseOrderSummary[]
}

const receivePurchaseOrder = async (
  authorizedFetch: AuthorizedFetch,
  id: string,
  payload: { items: Array<{ itemId: string; quantityReceived: number; costCents?: number }> },
) => {
  const response = await authorizedFetch(`/api/po/${id}/receive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message ?? 'Unable to record receipt right now')
  }

  return response.json()
}

type ReceiptDraft = Record<string, { quantity: number; costInput: string }>

export const ReceiveShipment = () => {
  const { authorizedFetch } = useAuth()
  const queryClient = useQueryClient()
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [draft, setDraft] = useState<ReceiptDraft>({})
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const purchaseOrdersQuery = useQuery({
    queryKey: ['purchaseOrders'],
    queryFn: () => fetchPurchaseOrders(authorizedFetch),
  })

  const openOrders = useMemo(
    () =>
      (purchaseOrdersQuery.data ?? []).filter(
        (order) => order.status === 'DRAFT' || order.status === 'PARTIALLY_RECEIVED',
      ),
    [purchaseOrdersQuery.data],
  )

  const selectedOrder = useMemo(
    () => openOrders.find((order) => order.id === selectedOrderId) ?? null,
    [openOrders, selectedOrderId],
  )

  useEffect(() => {
    if (selectedOrder) {
      const nextDraft: ReceiptDraft = {}
      selectedOrder.items.forEach((item) => {
        const outstanding = Math.max(item.quantityOrdered - item.quantityReceived, 0)
        nextDraft[item.id] = {
          quantity: outstanding,
          costInput: item.costCents != null ? (item.costCents / 100).toFixed(2) : '',
        }
      })
      setDraft(nextDraft)
    } else {
      setDraft({})
    }
  }, [selectedOrder])

  const receiveMutation = useMutation({
    mutationFn: (payload: { items: Array<{ itemId: string; quantityReceived: number; costCents?: number }> }) =>
      receivePurchaseOrder(authorizedFetch, selectedOrderId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] })
      setStatusMessage('Receipt recorded successfully.')
      setSelectedOrderId('')
    },
    onError: (error: unknown) => {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to record receipt right now')
    },
  })

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedOrder) {
      setStatusMessage('Select a purchase order to receive.')
      return
    }

    const entries = selectedOrder.items
      .map((item) => {
        const entry = draft[item.id]
        if (!entry || entry.quantity <= 0) {
          return null
        }
        const costValue = entry.costInput.trim().length > 0 ? Math.round(parseFloat(entry.costInput) * 100) : undefined
        return {
          itemId: item.id,
          quantityReceived: entry.quantity,
          costCents: Number.isFinite(costValue) ? costValue : undefined,
        }
      })
      .filter((entry): entry is { itemId: string; quantityReceived: number; costCents?: number } => Boolean(entry))

    if (entries.length === 0) {
      setStatusMessage('Enter at least one quantity greater than zero before submitting.')
      return
    }

    setStatusMessage(null)
    receiveMutation.mutate({ items: entries })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-brand-dark">Receive purchase order</h3>
        <p className="text-sm text-ink-500">
          Select an open purchase order, confirm received quantities, and update stock in one step.
        </p>
      </div>
      {purchaseOrdersQuery.isLoading ? <p className="text-sm text-ink-500">Loading purchase orders…</p> : null}
      {purchaseOrdersQuery.error ? (
        <p className="text-sm text-red-600">{(purchaseOrdersQuery.error as Error).message}</p>
      ) : null}
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="purchaseOrder" className="block text-sm font-semibold text-ink-700">
            Purchase order
          </label>
          <select
            id="purchaseOrder"
            value={selectedOrderId}
            onChange={(event) => setSelectedOrderId(event.target.value)}
            className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          >
            <option value="">Select open order…</option>
            {openOrders.map((order) => {
              const outstanding = order.items.reduce(
                (sum, item) => sum + Math.max(item.quantityOrdered - item.quantityReceived, 0),
                0,
              )
              return (
                <option key={order.id} value={order.id}>
                  {order.id.slice(0, 8)} · {order.supplier.name} · {outstanding} outstanding
                </option>
              )
            })}
          </select>
          {selectedOrder ? (
            <p className="mt-2 text-xs text-ink-400">
              View order details{' '}
              <Link to={`/purchase-orders/${selectedOrder.id}`} className="font-semibold text-brand-primary hover:underline">
                here
              </Link>
              .
            </p>
          ) : null}
        </div>

        {selectedOrder ? (
          <div className="space-y-4 rounded-2xl border border-ink-100 bg-white/95 p-5 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-base font-semibold text-brand-dark">Receipt lines</h4>
                <p className="text-sm text-ink-500">Adjust quantities and costs as needed before submitting.</p>
              </div>
              <div className="text-xs uppercase tracking-wide text-ink-400">
                Outstanding total:{' '}
                {selectedOrder.items.reduce(
                  (sum, item) => sum + Math.max(item.quantityOrdered - item.quantityReceived, 0),
                  0,
                )}
              </div>
            </div>
            <div className="grid gap-3">
              {selectedOrder.items.map((item) => {
                const outstanding = Math.max(item.quantityOrdered - item.quantityReceived, 0)
                const entry = draft[item.id] ?? { quantity: 0, costInput: '' }
                return (
                  <div
                    key={item.id}
                    className="grid gap-3 rounded-2xl border border-ink-100 bg-white/90 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                  >
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
                          setDraft((prev) => ({
                            ...prev,
                            [item.id]: {
                              quantity: Number(event.target.value),
                              costInput: entry.costInput,
                            },
                          }))
                        }
                        className="mt-1 w-24 rounded-xl border border-ink-200 px-3 py-1.5 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
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
                          setDraft((prev) => ({
                            ...prev,
                            [item.id]: {
                              quantity: entry.quantity,
                              costInput: event.target.value,
                            },
                          }))
                        }
                        className="mt-1 w-28 rounded-xl border border-ink-200 px-3 py-1.5 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button type="submit" className="button-primary sm:self-start" disabled={receiveMutation.isPending}>
                {receiveMutation.isPending ? 'Recording…' : 'Record receipt'}
              </button>
              {statusMessage ? <p className="text-sm text-brand-dark">{statusMessage}</p> : null}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-ink-200 bg-white/70 p-6 text-sm text-ink-400">
            Select an open purchase order to begin receiving.
          </div>
        )}
      </form>
    </div>
  )
}
