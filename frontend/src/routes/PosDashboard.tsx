import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AuthorizedFetch, useAuth } from '../modules/auth/AuthProvider'

interface TillSummary {
  id: string
  name: string
  total: number
  transactions: number
}

const fetchTillSummary = async (authorizedFetch: AuthorizedFetch) => {
  const response = await authorizedFetch('/api/pos/summary')
  if (!response.ok) {
    throw new Error('Unable to load till summary')
  }
  return (await response.json()) as TillSummary[]
}

export const PosDashboard = () => {
  const { authorizedFetch } = useAuth()
  const { data, isLoading, error } = useQuery({
    queryKey: ['pos', 'summary'],
    queryFn: () => fetchTillSummary(authorizedFetch),
  })

  const totals = useMemo(() => {
    if (!data) {
      return { totalSales: 0, transactions: 0 }
    }

    return data.reduce(
      (acc, till) => ({
        totalSales: acc.totalSales + till.total,
        transactions: acc.transactions + till.transactions,
      }),
      { totalSales: 0, transactions: 0 }
    )
  }, [data])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-brand-primary/10 p-4 text-brand-dark">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-primary/70">Today&apos;s Sales</p>
          <p className="mt-2 text-3xl font-display font-semibold">
            {totals.totalSales.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </p>
        </div>
        <div className="rounded-2xl bg-brand-secondary/10 p-4 text-brand-dark">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-secondary/70">Transactions</p>
          <p className="mt-2 text-3xl font-display font-semibold">{totals.transactions}</p>
        </div>
      </div>
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-brand-dark">Active tills</h3>
        {isLoading ? <p className="text-sm text-ink-500">Loading tills…</p> : null}
        {error ? <p className="text-sm text-red-600">{(error as Error).message}</p> : null}
        <div className="overflow-hidden rounded-2xl border border-ink-100">
          <table className="min-w-full divide-y divide-ink-100 text-sm">
            <thead className="bg-brand-surface">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">
                  Till name
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-ink-400">
                  Transactions
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold uppercase tracking-wide text-ink-400">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50 bg-white/80">
              {data?.map((till) => (
                <tr key={till.id}>
                  <td className="px-4 py-3 font-medium text-brand-dark">{till.name}</td>
                  <td className="px-4 py-3 text-ink-500">{till.transactions}</td>
                  <td className="px-4 py-3 text-right font-semibold text-brand-primary">
                    {till.total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
