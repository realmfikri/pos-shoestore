import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { AuthorizedFetch, useAuth } from '../modules/auth/AuthProvider'
import { StockAdjustmentModal } from '../components/inventory/StockAdjustmentModal'
import { classNames } from '../lib/classNames'

type InventoryVariant = {
  id: string
  sku: string
  size: string | null
  color: string | null
  priceCents: number | null
  costPriceCents: number | null
  onHand: number
  isPrimary: boolean
  createdAt: string
  updatedAt: string
}

type InventoryMediaPreview = {
  id: string
  fileName: string
  url: string | null
  variantId: string | null
  productId: string | null
  createdAt: string
}

type InventoryDetailResponse = {
  product: {
    id: string
    name: string
    description: string | null
    category: string | null
    tags: string[]
    brand: {
      id: string
      name: string
    }
  }
  primaryVariantId: string
  variants: InventoryVariant[]
  media: InventoryMediaPreview[]
}

type StockLedgerEntry = {
  id: string
  type: string
  reason: string | null
  reference: string | null
  quantityChange: number
  recordedAt: string
  recordedBy: { id: string; firstName: string; lastName: string } | null
}

type StockLedgerResponse = {
  variantId: string
  onHand: number
  entries: StockLedgerEntry[]
  availableTypes: string[]
  availableReasons: string[]
}

type LedgerFilters = {
  type: string
  reason: string
  from: string
  to: string
}

const defaultFilters: LedgerFilters = {
  type: 'ALL',
  reason: 'ALL',
  from: '',
  to: '',
}

const fetchInventoryDetail = async (
  authorizedFetch: AuthorizedFetch,
  id: string,
): Promise<InventoryDetailResponse> => {
  const response = await authorizedFetch(`/api/inventory/${id}`)
  if (!response.ok) {
    throw new Error('Unable to load item details')
  }

  return (await response.json()) as InventoryDetailResponse
}

const fetchStockLedger = async (
  authorizedFetch: AuthorizedFetch,
  id: string,
  filters: LedgerFilters,
): Promise<StockLedgerResponse> => {
  const params = new URLSearchParams()
  if (filters.type && filters.type !== 'ALL') {
    params.set('type', filters.type)
  }
  if (filters.reason && filters.reason !== 'ALL') {
    params.set('reason', filters.reason)
  }
  if (filters.from) {
    const from = new Date(filters.from)
    params.set('from', from.toISOString())
  }
  if (filters.to) {
    const to = new Date(filters.to)
    to.setHours(23, 59, 59, 999)
    params.set('to', to.toISOString())
  }

  const queryString = params.toString()
  const response = await authorizedFetch(
    queryString.length > 0 ? `/api/variants/${id}/ledger?${queryString}` : `/api/variants/${id}/ledger`,
  )
  if (!response.ok) {
    throw new Error('Unable to load stock ledger')
  }

  return (await response.json()) as StockLedgerResponse
}

const postStockAdjustment = async (
  authorizedFetch: AuthorizedFetch,
  id: string,
  payload: { reasonCode: 'damaged' | 'lost'; quantity: number; note?: string },
) => {
  const response = await authorizedFetch(`/api/variants/${id}/adjustments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message ?? 'Unable to save stock adjustment')
  }

  return response.json()
}

const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
})

const formatDateTime = (value: string) => new Date(value).toLocaleString()

const formatDelta = (value: number) =>
  `${value > 0 ? '+' : ''}${value}${value === 1 || value === -1 ? ' unit' : ' units'}`

export const InventoryDetail = () => {
  const { id } = useParams<{ id: string }>()
  const { authorizedFetch } = useAuth()
  const queryClient = useQueryClient()

  const [filters, setFilters] = useState<LedgerFilters>(defaultFilters)
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: ['inventory', 'detail', id],
    queryFn: () => fetchInventoryDetail(authorizedFetch, id!),
    enabled: Boolean(id),
  })

  const ledgerQuery = useQuery({
    queryKey: ['inventory', 'ledger', id, filters],
    queryFn: () => fetchStockLedger(authorizedFetch, id!, filters),
    enabled: Boolean(id),
  })

  const adjustmentMutation = useMutation({
    mutationFn: (payload: { reasonCode: 'damaged' | 'lost'; quantity: number; note?: string }) =>
      postStockAdjustment(authorizedFetch, id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'detail', id] })
      queryClient.invalidateQueries({ queryKey: ['inventory', 'ledger', id] })
      setStatusMessage('Stock adjustment recorded successfully.')
      setIsAdjustmentOpen(false)
    },
    onError: (error: unknown) => {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to save stock adjustment')
    },
  })

  const primaryVariant = useMemo(() => {
    if (!detailQuery.data) {
      return null
    }

    return detailQuery.data.variants.find((variant) => variant.id === detailQuery.data?.primaryVariantId) ?? null
  }, [detailQuery.data])

  if (detailQuery.isLoading) {
    return <p className="text-sm text-ink-500">Loading item details…</p>
  }

  if (detailQuery.error || !detailQuery.data) {
    const message = detailQuery.error instanceof Error ? detailQuery.error.message : 'Item not found.'
    return <p className="text-sm text-red-600">{message}</p>
  }

  const detail = detailQuery.data
  const ledger = ledgerQuery.data
  const ledgerEntries = ledger?.entries ?? []

  return (
    <Fragment>
      <div className="space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="font-mono text-xs uppercase tracking-wide text-ink-400">SKU {primaryVariant?.sku}</p>
            <h3 className="text-2xl font-display font-semibold text-brand-dark">{detail.product.name}</h3>
            <p className="text-sm text-ink-500">{detail.product.brand.name}</p>
            {detail.product.description ? (
              <p className="text-sm text-ink-600">{detail.product.description}</p>
            ) : null}
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <button type="button" className="button-secondary" onClick={() => setIsAdjustmentOpen(true)}>
              Adjust stock
            </button>
            {statusMessage ? <p className="text-sm text-brand-dark">{statusMessage}</p> : null}
          </div>
        </div>

        {detail.media.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {detail.media.map((media) => (
              <div
                key={media.id}
                className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm"
              >
                {media.url ? (
                  <img src={media.url} alt={media.fileName} className="h-48 w-full object-cover" />
                ) : (
                  <div className="flex h-48 items-center justify-center bg-ink-50 text-sm text-ink-400">
                    {media.fileName}
                  </div>
                )}
                <div className="border-t border-ink-100 px-4 py-2 text-xs text-ink-400">
                  Uploaded {new Date(media.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-ink-200 bg-white/70 p-6 text-sm text-ink-400">
            No photos uploaded yet. Add media from the quick add flow to showcase this product variant.
          </div>
        )}

        <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-ink-100">
          <table className="min-w-[640px] divide-y divide-ink-100 text-sm">
            <thead className="bg-brand-surface/80">
              <tr>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Variant</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Attributes</th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide text-ink-400">On Hand</th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide text-ink-400">Price</th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide text-ink-400">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50 bg-white/95">
              {detail.variants.map((variant) => (
                <tr
                  key={variant.id}
                  className={classNames(
                    'transition hover:bg-brand-surface/60',
                    variant.isPrimary ? 'bg-brand-surface/40 font-medium' : '',
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-ink-500">{variant.sku}</div>
                    <div className="text-sm text-brand-dark">
                      {variant.isPrimary ? 'Primary variant' : 'Related variant'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-500">
                    Size {variant.size ?? '—'} / Color {variant.color ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-brand-primary">{variant.onHand}</td>
                  <td className="px-4 py-3 text-right text-ink-500">
                    {variant.priceCents != null ? currencyFormatter.format(variant.priceCents / 100) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-500">
                    {variant.costPriceCents != null ? currencyFormatter.format(variant.costPriceCents / 100) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-ink-100 bg-white/90 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-base font-semibold text-brand-dark">Stock ledger</h4>
              <p className="text-sm text-ink-500">Track all movements affecting this variant's availability.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-ink-400">Type</label>
                <select
                  value={filters.type}
                  onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value }))}
                  className="mt-1 rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                >
                  <option value="ALL">All types</option>
                  {(ledger?.availableTypes ?? []).map((type) => (
                    <option key={type} value={type}>
                      {type.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-ink-400">Reason</label>
                <select
                  value={filters.reason}
                  onChange={(event) => setFilters((prev) => ({ ...prev, reason: event.target.value }))}
                  className="mt-1 rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                >
                  <option value="ALL">All reasons</option>
                  {(ledger?.availableReasons ?? []).map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-ink-400">From</label>
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
                    className="mt-1 rounded-xl border border-ink-200 px-3 py-1.5 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-ink-400">To</label>
                  <input
                    type="date"
                    value={filters.to}
                    onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
                    className="mt-1 rounded-xl border border-ink-200 px-3 py-1.5 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                  />
                </div>
              </div>
            </div>
          </div>
          {ledgerQuery.isLoading ? <p className="text-sm text-ink-500">Loading stock ledger…</p> : null}
          {ledgerEntries.length > 0 ? (
            <div className="space-y-3">
              {ledgerEntries.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-ink-100 bg-white/95 p-4 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-brand-dark">
                        {entry.type.replace(/_/g, ' ')}{' '}
                        <span
                          className={classNames(
                            'ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                            entry.quantityChange >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
                          )}
                        >
                          {formatDelta(entry.quantityChange)}
                        </span>
                      </p>
                      <p className="text-xs text-ink-400">{formatDateTime(entry.recordedAt)}</p>
                    </div>
                    <p className="text-xs uppercase tracking-wide text-ink-400">
                      On hand: {ledger?.onHand ?? primaryVariant?.onHand ?? 0}
                    </p>
                  </div>
                  <div className="mt-2 text-sm text-ink-500">
                    {entry.reason ? <p>Reason: {entry.reason}</p> : null}
                    {entry.reference ? <p>Reference: {entry.reference}</p> : null}
                    {entry.recordedBy ? (
                      <p>
                        Recorded by {entry.recordedBy.firstName} {entry.recordedBy.lastName}
                      </p>
                    ) : (
                      <p>Recorded automatically</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : ledgerQuery.isLoading ? null : (
            <div className="rounded-2xl border border-dashed border-ink-200 bg-white/70 p-6 text-sm text-ink-400">
              No ledger entries match the selected filters.
            </div>
          )}
        </div>
      </div>

      <StockAdjustmentModal
        open={isAdjustmentOpen}
        onClose={() => setIsAdjustmentOpen(false)}
        onSubmit={(payload) => adjustmentMutation.mutate(payload)}
        isSubmitting={adjustmentMutation.isPending}
      />
    </Fragment>
  )
}
