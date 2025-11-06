import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AuthorizedFetch, useAuth } from '../modules/auth/AuthProvider'

interface InventoryDetailResponse {
  id: string
  sku: string
  name: string
  description: string
  size: string
  color: string
  quantity: number
  reorderPoint: number
  lastReceivedAt: string
  supplier: string
}

const fetchInventoryItem = async (id: string, authorizedFetch: AuthorizedFetch) => {
  const response = await authorizedFetch(`/api/inventory/${id}`)
  if (!response.ok) {
    throw new Error('Unable to load item details')
  }
  return (await response.json()) as InventoryDetailResponse
}

export const InventoryDetail = () => {
  const { id } = useParams<{ id: string }>()
  const { authorizedFetch } = useAuth()

  const { data, isLoading, error } = useQuery({
    queryKey: ['inventory', id],
    queryFn: () => fetchInventoryItem(id!, authorizedFetch),
    enabled: Boolean(id),
  })

  if (isLoading) {
    return <p className="text-sm text-ink-500">Loading item details…</p>
  }

  if (error) {
    return <p className="text-sm text-red-600">{(error as Error).message}</p>
  }

  if (!data) {
    return <p className="text-sm text-ink-500">Item not found.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-400">SKU {data.sku}</p>
        <h3 className="text-2xl font-display font-semibold text-brand-dark">{data.name}</h3>
        <p className="text-sm text-ink-500">{data.description}</p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-ink-100 bg-white/80 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Size</dt>
          <dd className="text-lg font-medium text-brand-dark">{data.size}</dd>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white/80 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Color</dt>
          <dd className="text-lg font-medium text-brand-dark">{data.color}</dd>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white/80 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">On Hand</dt>
          <dd className="text-lg font-semibold text-brand-primary">{data.quantity}</dd>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white/80 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Reorder Point</dt>
          <dd className="text-lg font-semibold text-brand-primary">{data.reorderPoint}</dd>
        </div>
      </dl>
      <div className="rounded-2xl border border-ink-100 bg-white/90 p-5 text-sm text-ink-600">
        <p>
          Last received <span className="font-semibold text-brand-dark">{new Date(data.lastReceivedAt).toLocaleDateString()}</span>{' '}
          from <span className="font-semibold text-brand-dark">{data.supplier}</span>.
        </p>
      </div>
    </div>
  )
}
