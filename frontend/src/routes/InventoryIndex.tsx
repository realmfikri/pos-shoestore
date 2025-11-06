import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AuthorizedFetch, useAuth } from '../modules/auth/AuthProvider'

interface InventoryItem {
  id: string
  sku: string
  name: string
  size: string
  quantity: number
  reorderPoint: number
}

const fetchInventory = async (authorizedFetch: AuthorizedFetch) => {
  const response = await authorizedFetch('/api/inventory')
  if (!response.ok) {
    throw new Error('Unable to load inventory')
  }
  return (await response.json()) as InventoryItem[]
}

export const InventoryIndex = () => {
  const { authorizedFetch } = useAuth()
  const { data, isLoading, error } = useQuery({
    queryKey: ['inventory', 'list'],
    queryFn: () => fetchInventory(authorizedFetch),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-brand-dark">Inventory</h3>
          <p className="text-sm text-ink-500">Monitor footwear availability and restock thresholds in real time.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Link
            to="/inventory/quick-add"
            className="button-primary sm:w-auto"
          >
            Tambah Barang Cepat
          </Link>
          <Link
            to="/receive"
            className="rounded-full border border-ink-200 px-4 py-1.5 text-sm font-semibold text-ink-600 transition hover:border-brand-primary hover:text-brand-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary"
          >
            Receive shipment
          </Link>
        </div>
      </div>
      {isLoading ? <p className="text-sm text-ink-500">Loading inventory…</p> : null}
      {error ? <p className="text-sm text-red-600">{(error as Error).message}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-ink-100">
        <table className="min-w-full divide-y divide-ink-100 text-sm">
          <thead className="bg-brand-surface/80">
            <tr>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">SKU</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Name</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">Size</th>
              <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide text-ink-400">On Hand</th>
              <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide text-ink-400">Reorder</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-50 bg-white/90">
            {data?.map((item) => (
              <tr key={item.id} className="hover:bg-brand-surface/70">
                <td className="px-4 py-3 font-mono text-xs text-ink-500">{item.sku}</td>
                <td className="px-4 py-3 font-medium text-brand-dark">
                  <Link to={`/inventory/${item.id}`} className="hover:underline">
                    {item.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-500">{item.size}</td>
                <td className="px-4 py-3 text-right font-semibold text-brand-primary">{item.quantity}</td>
                <td className="px-4 py-3 text-right text-ink-500">{item.reorderPoint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
