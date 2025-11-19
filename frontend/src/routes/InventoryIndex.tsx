import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AuthorizedFetch, useAuth } from '../modules/auth/AuthProvider'
import { useDebouncedValue } from '../modules/pos/useDebouncedValue'

interface InventoryListItem {
  variantId: string
  sku: string
  productName: string
  brandName: string
  size: string | null
  color: string | null
  priceCents: number | null
  onHand: number
  description: string | null
}

interface InventoryListResponse {
  data: InventoryListItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
    pageCount: number
  }
}

const fetchInventory = async (
  authorizedFetch: AuthorizedFetch,
  searchTerm: string,
): Promise<InventoryListResponse> => {
  const params = new URLSearchParams({ page: '1', pageSize: '50' })
  if (searchTerm.trim().length > 0) {
    params.set('search', searchTerm.trim())
  }

  const response = await authorizedFetch(`/api/inventory?${params.toString()}`)
  if (!response.ok) {
    throw new Error('Unable to load inventory')
  }

  return (await response.json()) as InventoryListResponse
}

const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
})

export const InventoryIndex = () => {
  const { authorizedFetch } = useAuth()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)

  const { data, isLoading, error } = useQuery({
    queryKey: ['inventory', 'list', debouncedSearch],
    queryFn: () => fetchInventory(authorizedFetch, debouncedSearch),
  })

  const inventoryItems = useMemo(() => data?.data ?? [], [data])
  const hasSearch = debouncedSearch.trim().length > 0

  const totalOnHand = useMemo(
    () => inventoryItems.reduce((sum, item) => sum + item.onHand, 0),
    [inventoryItems],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-brand-dark">Inventory</h3>
          <p className="text-sm text-ink-500">
            Monitor footwear availability, pricing, and restock thresholds in real time across all variants.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search SKU, product, or brand…"
            className="w-full rounded-full border border-ink-200 px-4 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30 sm:w-64"
          />
          <Link to="/inventory/quick-add" className="button-primary sm:w-auto">
            Tambah Barang Cepat
          </Link>
        </div>
      </div>
      {isLoading ? <p className="text-sm text-ink-500">Loading inventory…</p> : null}
      {error ? <p className="text-sm text-red-600">{(error as Error).message}</p> : null}
      <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-ink-100">
        <table className="min-w-[720px] divide-y divide-ink-100 text-sm">
          <thead className="bg-brand-surface/80">
            <tr>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">SKU</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Product</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Size</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Color</th>
              <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide text-ink-400">On Hand</th>
              <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide text-ink-400">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-50 bg-white/90">
            {inventoryItems.map((item) => (
              <tr key={item.variantId} className="hover:bg-brand-surface/70">
                <td className="px-4 py-3 font-mono text-xs text-ink-500">{item.sku}</td>
                <td className="px-4 py-3 font-medium text-brand-dark">
                  <Link to={`/inventory/${item.variantId}`} className="hover:underline">
                    {item.productName}
                  </Link>
                  <p className="text-xs text-ink-400">{item.brandName}</p>
                </td>
                <td className="px-4 py-3 text-ink-500">{item.size ?? '—'}</td>
                <td className="px-4 py-3 text-ink-500">{item.color ?? '—'}</td>
                <td className="px-4 py-3 text-right font-semibold text-brand-primary">{item.onHand}</td>
                <td className="px-4 py-3 text-right text-ink-500">
                  {item.priceCents != null ? currencyFormatter.format(item.priceCents / 100) : '—'}
                </td>
              </tr>
            ))}
            {inventoryItems.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-ink-400">
                  {hasSearch
                    ? 'No inventory matches found for the current search.'
                    : 'Inventory is empty. Start by adding products or importing stock.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2 rounded-2xl border border-ink-100 bg-white/90 p-4 text-sm text-ink-600 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Showing {inventoryItems.length} of {data?.pagination.total ?? 0} variants
          {hasSearch ? ` matching “${debouncedSearch.trim()}”` : ''}.
        </span>
        <span className="font-semibold text-brand-primary">Total on hand: {totalOnHand}</span>
      </div>
    </div>
  )
}
