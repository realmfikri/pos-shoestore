import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AuthorizedFetch, useAuth } from '../modules/auth/AuthProvider'
import { SupplierSummary, PurchaseOrderSummary } from '../lib/purchasingTypes'
import { useDebouncedValue } from '../modules/pos/useDebouncedValue'

interface InventorySearchResult {
  variantId: string
  sku: string
  productName: string
  brandName: string
  size: string | null
  color: string | null
  onHand: number
}

const fetchSuppliers = async (authorizedFetch: AuthorizedFetch): Promise<SupplierSummary[]> => {
  const response = await authorizedFetch('/api/suppliers')
  if (!response.ok) {
    throw new Error('Unable to load suppliers')
  }

  return (await response.json()) as SupplierSummary[]
}

const searchInventory = async (
  authorizedFetch: AuthorizedFetch,
  term: string,
): Promise<InventorySearchResult[]> => {
  const params = new URLSearchParams({ page: '1', pageSize: '10', search: term })
  const response = await authorizedFetch(`/api/inventory?${params.toString()}`)
  if (!response.ok) {
    throw new Error('Unable to search inventory')
  }

  const payload = await response.json()
  return (payload.data ?? []) as InventorySearchResult[]
}

const createPurchaseOrder = async (
  authorizedFetch: AuthorizedFetch,
  payload: {
    supplierId: string
    items: Array<{ variantId: string; quantityOrdered: number; costCents?: number }>
  },
): Promise<PurchaseOrderSummary> => {
  const response = await authorizedFetch('/api/po', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message ?? 'Unable to create purchase order right now')
  }

  return (await response.json()) as PurchaseOrderSummary
}

type DraftItem = {
  variant: InventorySearchResult
  quantityOrdered: number
  costInput: string
}

export const PurchaseOrderCreate = () => {
  const { authorizedFetch } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [supplierId, setSupplierId] = useState('')
  const [search, setSearch] = useState('')
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const debouncedSearch = useDebouncedValue(search, 300)

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => fetchSuppliers(authorizedFetch),
  })

  const searchQuery = useQuery({
    queryKey: ['inventory', 'search', debouncedSearch],
    queryFn: () => searchInventory(authorizedFetch, debouncedSearch),
    enabled: debouncedSearch.trim().length >= 2,
  })

  const createMutation = useMutation({
    mutationFn: (payload: { supplierId: string; items: Array<{ variantId: string; quantityOrdered: number; costCents?: number }> }) =>
      createPurchaseOrder(authorizedFetch, payload),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] })
      setStatusMessage('Purchase order created.')
      navigate(`/purchase-orders/${order.id}`)
    },
    onError: (error: unknown) => {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to create purchase order right now')
    },
  })

  const handleAddItem = (result: InventorySearchResult) => {
    setDraftItems((prev) => {
      if (prev.some((item) => item.variant.variantId === result.variantId)) {
        return prev
      }
      return [...prev, { variant: result, quantityOrdered: 1, costInput: '' }]
    })
    setSearch('')
  }

  const handleRemoveItem = (variantId: string) => {
    setDraftItems((prev) => prev.filter((item) => item.variant.variantId !== variantId))
  }

  const totalQuantity = useMemo(
    () => draftItems.reduce((sum, item) => sum + item.quantityOrdered, 0),
    [draftItems],
  )

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supplierId) {
      setStatusMessage('Select a supplier before creating the purchase order.')
      return
    }
    if (draftItems.length === 0) {
      setStatusMessage('Add at least one variant to the order.')
      return
    }

    const items = draftItems.map((item) => {
      const cost = item.costInput.trim()
      const costValue = cost.length > 0 ? Math.round(parseFloat(cost) * 100) : undefined
      return {
        variantId: item.variant.variantId,
        quantityOrdered: item.quantityOrdered,
        costCents: Number.isFinite(costValue) ? costValue : undefined,
      }
    })

    setStatusMessage(null)
    createMutation.mutate({ supplierId, items })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-brand-dark">Create purchase order</h3>
        <p className="text-sm text-ink-500">
          Select a supplier, add the required variants, and capture intended costs to streamline receiving.
        </p>
      </div>
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="supplier" className="block text-sm font-semibold text-ink-700">
              Supplier
            </label>
            <select
              id="supplier"
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            >
              <option value="">Select supplier…</option>
              {(suppliersQuery.data ?? []).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="search" className="block text-sm font-semibold text-ink-700">
              Search inventory
            </label>
            <input
              id="search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search SKU, product, or brand…"
              className="mt-1 w-full rounded-full border border-ink-200 px-4 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
            {debouncedSearch.trim().length >= 2 ? (
              <div className="mt-2 rounded-2xl border border-ink-100 bg-white/95 shadow-sm">
                {searchQuery.isLoading ? (
                  <p className="px-4 py-3 text-sm text-ink-500">Searching…</p>
                ) : (searchQuery.data ?? []).length > 0 ? (
                  <ul className="divide-y divide-ink-100 text-sm">
                    {(searchQuery.data ?? []).map((result) => (
                      <li key={result.variantId} className="flex items-center justify-between px-4 py-2">
                        <div>
                          <p className="font-medium text-brand-dark">{result.productName}</p>
                          <p className="text-xs text-ink-400">{result.sku} · {result.brandName}</p>
                        </div>
                        <button
                          type="button"
                          className="rounded-full border border-brand-primary px-3 py-1 text-xs font-semibold text-brand-primary transition hover:bg-brand-primary/10"
                          onClick={() => handleAddItem(result)}
                        >
                          Add
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-3 text-sm text-ink-400">No variants found.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ink-100">
          <table className="min-w-full divide-y divide-ink-100 text-sm">
            <thead className="bg-brand-surface/80">
              <tr>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Variant</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Quantity</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Cost (IDR)</th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide text-ink-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50 bg-white/95">
              {draftItems.map((item) => (
                <tr key={item.variant.variantId}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-brand-dark">{item.variant.productName}</p>
                    <p className="text-xs text-ink-400">{item.variant.sku} · Size {item.variant.size ?? '—'} / Color {item.variant.color ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={1}
                      value={item.quantityOrdered}
                      onChange={(event) =>
                        setDraftItems((prev) =>
                          prev.map((line) =>
                            line.variant.variantId === item.variant.variantId
                              ? { ...line, quantityOrdered: Number(event.target.value) }
                              : line,
                          ),
                        )
                      }
                      className="w-24 rounded-xl border border-ink-200 px-3 py-1.5 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.costInput}
                      onChange={(event) =>
                        setDraftItems((prev) =>
                          prev.map((line) =>
                            line.variant.variantId === item.variant.variantId
                              ? { ...line, costInput: event.target.value }
                              : line,
                          ),
                        )
                      }
                      placeholder="0.00"
                      className="w-32 rounded-xl border border-ink-200 px-3 py-1.5 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.variant.variantId)}
                      className="rounded-full border border-ink-200 px-3 py-1 text-xs font-semibold text-ink-500 transition hover:border-brand-secondary hover:text-brand-secondary"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {draftItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-ink-400">
                    No variants added yet. Use the search above to add products to this order.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 rounded-2xl border border-ink-100 bg-white/90 p-4 text-sm text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Total line items: <strong>{draftItems.length}</strong>
          </span>
          <span>
            Total quantity ordered: <strong className="text-brand-primary">{totalQuantity}</strong>
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <button type="submit" className="button-primary self-start" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Create purchase order'}
          </button>
          {statusMessage ? <p className="text-sm text-brand-dark">{statusMessage}</p> : null}
        </div>
      </form>
    </div>
  )
}
