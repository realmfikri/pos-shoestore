import { useQuery } from '@tanstack/react-query'
import { AuthorizedFetch, useAuth } from '../modules/auth/AuthProvider'

interface ReportSummary {
  id: string
  title: string
  description: string
  lastGeneratedAt: string
}

const fetchReports = async (authorizedFetch: AuthorizedFetch) => {
  const response = await authorizedFetch('/api/reports/summary')
  if (!response.ok) {
    throw new Error('Unable to load reports')
  }
  return (await response.json()) as ReportSummary[]
}

export const ReportsOverview = () => {
  const { authorizedFetch } = useAuth()
  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'summary'],
    queryFn: () => fetchReports(authorizedFetch),
  })

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-brand-dark">Reports</h3>
        <p className="text-sm text-ink-500">
          Surface insights across stores, channels, and seasons with ready-to-export summaries.
        </p>
      </div>
      {isLoading ? <p className="text-sm text-ink-500">Loading reports…</p> : null}
      {error ? <p className="text-sm text-red-600">{(error as Error).message}</p> : null}
      <ul className="space-y-3">
        {data?.map((report) => (
          <li key={report.id} className="rounded-2xl border border-ink-100 bg-white/90 p-4 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-brand-dark">{report.title}</p>
                <p className="text-xs text-ink-500">{report.description}</p>
              </div>
              <p className="text-xs text-ink-400">
                Updated {new Date(report.lastGeneratedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-full border border-brand-primary/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-primary transition hover:bg-brand-primary hover:text-white">
                Download CSV
              </button>
              <button className="rounded-full border border-ink-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-500 transition hover:border-brand-secondary hover:text-brand-secondary">
                Schedule email
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
