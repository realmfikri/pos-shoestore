import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
} from 'recharts'
import { AuthorizedFetch, useAuth } from '../modules/auth/AuthProvider'
import { classNames } from '../lib/classNames'
import { formatDateTime, formatMediumDate, formatShortDate, formatToIDR } from '../lib/intl'

interface DateRangeState {
  startDate?: string
  endDate?: string
}

interface DailySalesReportItem {
  saleDate: string
  grossSalesCents: number
  discountTotalCents: number
  taxTotalCents: number
  netSalesCents: number
  saleCount: number
}

interface DailySalesReportResponse {
  results: DailySalesReportItem[]
}

interface TopItemReportItem {
  variantId: string
  productId: string
  brandId: string
  sku: string
  productName: string
  brandName: string
  quantitySold: number
  grossSalesCents: number
  discountTotalCents: number
  netSalesCents: number
  lastSoldAt: string | null
}

interface TopItemsReportResponse {
  results: TopItemReportItem[]
}

interface TopBrandReportItem {
  brandId: string
  brandName: string
  quantitySold: number
  grossSalesCents: number
  discountTotalCents: number
  netSalesCents: number
}

interface TopBrandsReportResponse {
  results: TopBrandReportItem[]
}

interface LowStockItem {
  variantId: string
  productId: string
  brandId: string
  sku: string
  productName: string
  brandName: string
  onHand: number
  threshold: number
}

interface LowStockReportResponse {
  results: LowStockItem[]
}

const DEFAULT_RANGE_DAYS = 14

const toRangeParams = (range: DateRangeState) => {
  const params: Record<string, string> = {}
  if (range.startDate) {
    params.startDate = `${range.startDate}T00:00:00.000Z`
  }
  if (range.endDate) {
    params.endDate = `${range.endDate}T23:59:59.999Z`
  }
  return params
}

const fetchDailySales = async (authorizedFetch: AuthorizedFetch, range: DateRangeState) => {
  const params = new URLSearchParams(toRangeParams(range))
  const response = await authorizedFetch(`/api/reports/sales/daily?${params.toString()}`)
  if (!response.ok) {
    throw new Error('Unable to load daily sales report')
  }
  return (await response.json()) as DailySalesReportResponse
}

const fetchTopItems = async (
  authorizedFetch: AuthorizedFetch,
  range: DateRangeState,
  limit: number,
) => {
  const params = new URLSearchParams(toRangeParams(range))
  params.set('limit', String(limit))
  const response = await authorizedFetch(`/api/reports/sales/top-items?${params.toString()}`)
  if (!response.ok) {
    throw new Error('Unable to load top products')
  }
  return (await response.json()) as TopItemsReportResponse
}

const fetchTopBrands = async (
  authorizedFetch: AuthorizedFetch,
  range: DateRangeState,
  limit: number,
) => {
  const params = new URLSearchParams(toRangeParams(range))
  params.set('limit', String(limit))
  const response = await authorizedFetch(`/api/reports/sales/top-brands?${params.toString()}`)
  if (!response.ok) {
    throw new Error('Unable to load top brands')
  }
  return (await response.json()) as TopBrandsReportResponse
}

const fetchLowStock = async (authorizedFetch: AuthorizedFetch) => {
  const response = await authorizedFetch('/api/reports/inventory/low-stock')
  if (!response.ok) {
    throw new Error('Unable to load low stock report')
  }
  return (await response.json()) as LowStockReportResponse
}

const SkeletonBlock = ({ className }: { className?: string }) => (
  <div className={classNames('animate-pulse rounded-xl bg-ink-100', className)} aria-hidden="true" />
)

const initializeRange = (): DateRangeState => {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - DEFAULT_RANGE_DAYS)
  const toValue = (date: Date) => date.toISOString().slice(0, 10)
  return { startDate: toValue(start), endDate: toValue(end) }
}

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }
    const mediaQuery = window.matchMedia(query)
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches)
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handler)
    } else {
      mediaQuery.addListener(handler)
    }
    setMatches(mediaQuery.matches)
    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handler)
      } else {
        mediaQuery.removeListener(handler)
      }
    }
  }, [query])

  return matches
}

const DateRangeSelector = ({
  range,
  onChange,
}: {
  range: DateRangeState
  onChange: (range: DateRangeState) => void
}) => (
  <div className="flex flex-col gap-3 md:flex-row md:items-end">
    <label className="flex flex-1 flex-col text-xs font-semibold uppercase tracking-wide text-ink-500">
      Dari tanggal
      <input
        type="date"
        value={range.startDate ?? ''}
        onChange={(event) => onChange({ ...range, startDate: event.target.value || undefined })}
        className="mt-1 h-11 w-full rounded-xl border border-ink-200 px-3 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 md:max-w-xs"
      />
    </label>
    <label className="flex flex-1 flex-col text-xs font-semibold uppercase tracking-wide text-ink-500">
      Sampai tanggal
      <input
        type="date"
        value={range.endDate ?? ''}
        onChange={(event) => onChange({ ...range, endDate: event.target.value || undefined })}
        className="mt-1 h-11 w-full rounded-xl border border-ink-200 px-3 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 md:max-w-xs"
      />
    </label>
  </div>
)

const ExportButtons = ({
  isExporting,
  onExport,
  disabled,
}: {
  isExporting: boolean
  onExport: (format: 'csv' | 'pdf') => void
  disabled?: boolean
}) => (
  <div className="flex flex-wrap gap-2">
    <button
      type="button"
      className="rounded-full border border-ink-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-500 transition hover:border-brand-secondary hover:text-brand-secondary disabled:cursor-not-allowed disabled:opacity-60"
      onClick={() => onExport('csv')}
      disabled={disabled || isExporting}
    >
      {isExporting ? 'Mengunduh…' : 'Ekspor CSV'}
    </button>
    <button
      type="button"
      className="rounded-full border border-brand-primary/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-primary transition hover:bg-brand-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      onClick={() => onExport('pdf')}
      disabled={disabled || isExporting}
    >
      {isExporting ? 'Mengunduh…' : 'Ekspor PDF'}
    </button>
  </div>
)

const buildRangeLabel = (range: DateRangeState) => {
  if (range.startDate && range.endDate) {
    return `${formatMediumDate(range.startDate)} — ${formatMediumDate(range.endDate)}`
  }
  if (range.startDate) {
    return `Mulai ${formatMediumDate(range.startDate)}`
  }
  if (range.endDate) {
    return `Hingga ${formatMediumDate(range.endDate)}`
  }
  return 'Periode berjalan'
}

export const ReportsOverview = () => {
  const { authorizedFetch } = useAuth()
  const navigate = useNavigate()
  const [range, setRange] = useState<DateRangeState>(initializeRange)
  const [topLimit, setTopLimit] = useState(5)
  const [brandFilter, setBrandFilter] = useState('all')
  const [onlyCritical, setOnlyCritical] = useState(false)
  const [exportingKey, setExportingKey] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const isSmallScreen = useMediaQuery('(max-width: 640px)')
  const axisFontSize = isSmallScreen ? 10 : 12
  const tooltipStyle = useMemo(
    () => ({
      borderRadius: '0.75rem',
      fontSize: isSmallScreen ? '0.75rem' : '0.875rem',
      lineHeight: '1.25rem',
    }),
    [isSmallScreen],
  )
  const legendStyle = useMemo(() => ({ fontSize: axisFontSize }), [axisFontSize])

  const updateRange = useCallback((nextRange: DateRangeState) => {
    if (nextRange.startDate && nextRange.endDate && nextRange.startDate > nextRange.endDate) {
      setRange({ startDate: nextRange.startDate, endDate: nextRange.startDate })
      return
    }
    setRange(nextRange)
  }, [])

  const dailySalesQuery = useQuery<DailySalesReportResponse>({
    queryKey: ['reports', 'sales', 'daily', range.startDate, range.endDate],
    queryFn: () => fetchDailySales(authorizedFetch, range),
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  })

  const topItemsQuery = useQuery<TopItemsReportResponse>({
    queryKey: ['reports', 'sales', 'top-items', range.startDate, range.endDate, topLimit],
    queryFn: () => fetchTopItems(authorizedFetch, range, topLimit),
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  })

  const topBrandsQuery = useQuery<TopBrandsReportResponse>({
    queryKey: ['reports', 'sales', 'top-brands', range.startDate, range.endDate, topLimit],
    queryFn: () => fetchTopBrands(authorizedFetch, range, topLimit),
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  })

  const lowStockQuery = useQuery<LowStockReportResponse>({
    queryKey: ['reports', 'inventory', 'low-stock'],
    queryFn: () => fetchLowStock(authorizedFetch),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const dailyTotals = useMemo(() => {
    const base = { gross: 0, net: 0, discount: 0, tax: 0, saleCount: 0 }
    if (!dailySalesQuery.data) {
      return base
    }
    return dailySalesQuery.data.results.reduce(
      (acc, item) => ({
        gross: acc.gross + item.grossSalesCents,
        net: acc.net + item.netSalesCents,
        discount: acc.discount + item.discountTotalCents,
        tax: acc.tax + item.taxTotalCents,
        saleCount: acc.saleCount + item.saleCount,
      }),
      base,
    )
  }, [dailySalesQuery.data])

  const bestSalesDay = useMemo(() => {
    if (!dailySalesQuery.data || dailySalesQuery.data.results.length === 0) {
      return null
    }
    return dailySalesQuery.data.results.reduce((best, item) =>
      item.netSalesCents > best.netSalesCents ? item : best,
    )
  }, [dailySalesQuery.data])

  const chartData = useMemo(
    () =>
      dailySalesQuery.data?.results.map((item) => ({
        label: formatShortDate(item.saleDate),
        saleDate: item.saleDate,
        netSalesCents: item.netSalesCents,
        grossSalesCents: item.grossSalesCents,
        saleCount: item.saleCount,
      })) ?? [],
    [dailySalesQuery.data],
  )

  const topItems = topItemsQuery.data?.results ?? []
  const topBrands = topBrandsQuery.data?.results ?? []
  const lowStockItems = useMemo(
    () => lowStockQuery.data?.results ?? [],
    [lowStockQuery.data],
  )

  const brandOptions = useMemo(() => {
    const set = new Set(lowStockItems.map((item) => item.brandName))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [lowStockItems])

  const filteredLowStock = useMemo(() => {
    return lowStockItems.filter((item) => {
      if (brandFilter !== 'all' && item.brandName !== brandFilter) {
        return false
      }
      if (onlyCritical && item.onHand > Math.max(1, item.threshold / 2)) {
        return false
      }
      return true
    })
  }, [lowStockItems, brandFilter, onlyCritical])

  const handleExport = useCallback(
    async (
      key: string,
      path: string,
      params: Record<string, string | number | undefined>,
      format: 'csv' | 'pdf',
    ) => {
      setExportError(null)
      setExportingKey(`${key}-${format}`)
      try {
        const url = new URL(path, window.location.origin)
        Object.entries(params).forEach(([param, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(param, String(value))
          }
        })
        url.searchParams.set('format', format)
        const response = await authorizedFetch(`${url.pathname}${url.search}`)
        if (!response.ok) {
          throw new Error('Unable to export report')
        }
        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        const extension = format === 'csv' ? 'csv' : 'pdf'
        link.download = `${key}-${new Date().toISOString().slice(0, 10)}.${extension}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl)
      } catch (error) {
        setExportError(error instanceof Error ? error.message : 'Unable to export report')
      } finally {
        setExportingKey(null)
      }
    },
    [authorizedFetch],
  )

  const rangeLabel = buildRangeLabel(range)
  const averageTicketCents = dailyTotals.saleCount > 0 ? Math.round(dailyTotals.net / dailyTotals.saleCount) : 0

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-brand-dark">Ringkasan Kinerja Toko</h3>
        <p className="text-sm text-ink-500">
          Pantau penjualan harian, produk terlaris, dan stok kritis untuk menjaga aliran kas dan ketersediaan barang.
        </p>
      </div>

      <div className="rounded-3xl border border-ink-100 bg-white/90 p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h4 className="text-base font-semibold text-brand-dark">Rentang tanggal</h4>
            <p className="text-sm text-ink-500">{rangeLabel}</p>
          </div>
          <DateRangeSelector range={range} onChange={updateRange} />
        </div>
        {exportError ? (
          <p className="mt-3 text-sm text-red-600">{exportError}</p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dailySalesQuery.isLoading && !dailySalesQuery.data ? (
          <>
            <SkeletonBlock className="h-28" />
            <SkeletonBlock className="h-28" />
            <SkeletonBlock className="h-28" />
            <SkeletonBlock className="h-28" />
          </>
        ) : (
          <>
            <div className="rounded-3xl border border-ink-100 bg-white/90 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Penjualan Bersih</p>
              <p className="mt-2 text-2xl font-bold text-brand-dark">{formatToIDR(dailyTotals.net)}</p>
              <p className="mt-1 text-xs text-ink-400">Total dalam periode yang dipilih</p>
            </div>
            <div className="rounded-3xl border border-ink-100 bg-white/90 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Pesanan</p>
              <p className="mt-2 text-2xl font-bold text-brand-dark">{dailyTotals.saleCount}</p>
              <p className="mt-1 text-xs text-ink-400">Transaksi tercatat</p>
            </div>
            <div className="rounded-3xl border border-ink-100 bg-white/90 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Rata-rata nota</p>
              <p className="mt-2 text-2xl font-bold text-brand-dark">{formatToIDR(averageTicketCents)}</p>
              <p className="mt-1 text-xs text-ink-400">Nilai rata-rata per transaksi</p>
            </div>
            <div className="rounded-3xl border border-ink-100 bg-white/90 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Hari terbaik</p>
              <p className="mt-2 text-lg font-semibold text-brand-dark">
                {bestSalesDay ? formatMediumDate(bestSalesDay.saleDate) : '—'}
              </p>
              <p className="mt-1 text-xs text-ink-400">
                {bestSalesDay ? formatToIDR(bestSalesDay.netSalesCents) : 'Tidak ada data'}
              </p>
            </div>
          </>
        )}
      </div>

      <section className="space-y-4 rounded-3xl border border-ink-100 bg-white/90 p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-base font-semibold text-brand-dark">Tren penjualan harian</h4>
            <p className="text-sm text-ink-500">Lacak kenaikan penjualan dan dampak promosi secara real time.</p>
          </div>
          <ExportButtons
            disabled={dailySalesQuery.isLoading && !dailySalesQuery.data}
            isExporting={exportingKey === 'daily-sales-csv' || exportingKey === 'daily-sales-pdf'}
            onExport={(format) =>
              handleExport(
                'daily-sales',
                '/api/reports/sales/daily/export',
                {
                  ...toRangeParams(range),
                },
                format,
              )
            }
          />
        </div>
        {dailySalesQuery.error ? (
          <p className="text-sm text-red-600">{(dailySalesQuery.error as Error).message}</p>
        ) : null}
        {dailySalesQuery.isLoading && !dailySalesQuery.data ? (
          <SkeletonBlock className="h-72" />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <LineChart
                data={chartData}
                margin={isSmallScreen ? { top: 10, right: 8, left: 0, bottom: 24 } : { top: 10, right: 16, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="label"
                  stroke="#6B7280"
                  fontSize={axisFontSize}
                  angle={isSmallScreen ? -35 : 0}
                  textAnchor={isSmallScreen ? 'end' : 'middle'}
                  height={isSmallScreen ? 60 : undefined}
                  tickMargin={isSmallScreen ? 12 : 8}
                  interval={isSmallScreen ? 0 : undefined}
                />
                <YAxis
                  stroke="#6B7280"
                  fontSize={axisFontSize}
                  width={isSmallScreen ? 64 : undefined}
                  tickFormatter={(value) => formatToIDR(Number(value))}
                />
                <Tooltip
                  formatter={(value: number | string) => formatToIDR(Number(value))}
                  labelFormatter={(label) => `Tanggal ${label}`}
                  contentStyle={tooltipStyle}
                />
                <Legend wrapperStyle={legendStyle} />
                <Line
                  type="monotone"
                  dataKey="grossSalesCents"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                  name="Penjualan Kotor"
                />
                <Line
                  type="monotone"
                  dataKey="netSalesCents"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  name="Penjualan Bersih"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-3xl border border-ink-100 bg-white/90 p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-base font-semibold text-brand-dark">Produk terlaris</h4>
              <p className="text-sm text-ink-500">Optimalkan stok barang yang paling diminati pelanggan.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Tampilkan
                <select
                  value={topLimit}
                  onChange={(event) => setTopLimit(Number(event.target.value))}
                  className="ml-2 rounded-full border border-ink-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-600 focus:border-brand-primary focus:outline-none"
                >
                  {[5, 10, 15].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <ExportButtons
                disabled={topItemsQuery.isLoading && !topItemsQuery.data}
                isExporting={exportingKey === 'top-items-csv' || exportingKey === 'top-items-pdf'}
                onExport={(format) =>
                  handleExport(
                    'top-items',
                    '/api/reports/sales/top-items/export',
                    {
                      ...toRangeParams(range),
                      limit: topLimit,
                    },
                    format,
                  )
                }
              />
            </div>
          </div>
          {topItemsQuery.isLoading && !topItemsQuery.data ? (
            <SkeletonBlock className="h-72" />
          ) : topItems.length === 0 ? (
            <p className="text-sm text-ink-500">Belum ada data penjualan dalam periode ini.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-1">
              <div className="h-72 w-full">
                <ResponsiveContainer>
                  <BarChart
                    data={topItems}
                    layout="vertical"
                    margin={isSmallScreen ? { left: 60, right: 8, bottom: 8 } : { left: 80, right: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      type="number"
                      tickFormatter={(value) => formatToIDR(Number(value))}
                      stroke="#6B7280"
                      fontSize={axisFontSize}
                      tickMargin={8}
                    />
                    <YAxis
                      dataKey="productName"
                      type="category"
                      width={isSmallScreen ? 140 : 180}
                      stroke="#6B7280"
                      fontSize={axisFontSize}
                      tickFormatter={(value) =>
                        isSmallScreen && typeof value === 'string' && value.length > 18
                          ? `${value.slice(0, 15)}…`
                          : value
                      }
                    />
                    <Tooltip
                      formatter={(value: number | string) => formatToIDR(Number(value))}
                      labelFormatter={(_label, payload) =>
                        payload && payload.length > 0
                          ? `${payload[0].payload.productName} • ${payload[0].payload.quantitySold} pasang`
                          : ''
                      }
                      contentStyle={tooltipStyle}
                    />
                    <Legend wrapperStyle={legendStyle} />
                    <Bar dataKey="netSalesCents" name="Penjualan Bersih" fill="#2563eb" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-3">
                {topItems.map((item) => (
                  <li key={item.variantId} className="flex items-start justify-between gap-4 rounded-2xl border border-ink-100 bg-white/70 p-3">
                    <div>
                      <p className="text-sm font-semibold text-brand-dark">{item.productName}</p>
                      <p className="text-xs text-ink-500">{item.brandName} • SKU {item.sku}</p>
                      <p className="mt-1 text-xs text-ink-400">Terjual {item.quantitySold} pasang</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-brand-dark">{formatToIDR(item.netSalesCents)}</p>
                      <p className="text-xs text-ink-400">{formatDateTime(item.lastSoldAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {topItemsQuery.error ? (
            <p className="text-sm text-red-600">{(topItemsQuery.error as Error).message}</p>
          ) : null}
        </div>

        <div className="space-y-4 rounded-3xl border border-ink-100 bg-white/90 p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-base font-semibold text-brand-dark">Merek paling laris</h4>
              <p className="text-sm text-ink-500">Ketahui merek favorit pelanggan untuk negosiasi dengan pemasok.</p>
            </div>
            <ExportButtons
              disabled={topBrandsQuery.isLoading && !topBrandsQuery.data}
              isExporting={exportingKey === 'top-brands-csv' || exportingKey === 'top-brands-pdf'}
              onExport={(format) =>
                handleExport(
                  'top-brands',
                  '/api/reports/sales/top-brands/export',
                  {
                    ...toRangeParams(range),
                    limit: topLimit,
                  },
                  format,
                )
              }
            />
          </div>
          {topBrandsQuery.isLoading && !topBrandsQuery.data ? (
            <SkeletonBlock className="h-72" />
          ) : topBrands.length === 0 ? (
            <p className="text-sm text-ink-500">Belum ada data penjualan merek dalam periode ini.</p>
          ) : (
            <div className="space-y-4">
              <div className="h-72 w-full">
                <ResponsiveContainer>
                  <BarChart
                    data={topBrands}
                    margin={isSmallScreen ? { top: 10, right: 8, left: 0, bottom: 32 } : { top: 10, right: 20, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="brandName"
                      stroke="#6B7280"
                      fontSize={axisFontSize}
                      angle={isSmallScreen ? -35 : 0}
                      textAnchor={isSmallScreen ? 'end' : 'middle'}
                      height={isSmallScreen ? 60 : undefined}
                      tickMargin={isSmallScreen ? 12 : 8}
                      interval={isSmallScreen ? 0 : undefined}
                    />
                    <YAxis
                      stroke="#6B7280"
                      fontSize={axisFontSize}
                      width={isSmallScreen ? 70 : undefined}
                      tickFormatter={(value) => formatToIDR(Number(value))}
                    />
                    <Tooltip
                      formatter={(value: number | string) => formatToIDR(Number(value))}
                      labelFormatter={(label, payload) =>
                        payload && payload.length > 0
                          ? `${label} • ${payload[0].payload.quantitySold} unit`
                          : label
                      }
                      contentStyle={tooltipStyle}
                    />
                    <Legend wrapperStyle={legendStyle} />
                    <Bar dataKey="netSalesCents" fill="#f97316" name="Penjualan Bersih" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-2">
                {topBrands.map((brand) => (
                  <li key={brand.brandId} className="flex items-center justify-between rounded-2xl border border-ink-100 bg-white/70 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-brand-dark">{brand.brandName}</p>
                      <p className="text-xs text-ink-500">{brand.quantitySold} unit terjual</p>
                    </div>
                    <p className="text-sm font-semibold text-brand-dark">{formatToIDR(brand.netSalesCents)}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {topBrandsQuery.error ? (
            <p className="text-sm text-red-600">{(topBrandsQuery.error as Error).message}</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-ink-100 bg-white/90 p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-base font-semibold text-brand-dark">Stok hampir habis</h4>
            <p className="text-sm text-ink-500">Prioritaskan replenishment sebelum rak kosong.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Merek
              <select
                value={brandFilter}
                onChange={(event) => setBrandFilter(event.target.value)}
                className="ml-2 rounded-full border border-ink-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-600 focus:border-brand-primary focus:outline-none"
              >
                <option value="all">Semua</option>
                {brandOptions.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              <input
                type="checkbox"
                checked={onlyCritical}
                onChange={(event) => setOnlyCritical(event.target.checked)}
                className="h-4 w-4 rounded border-ink-300 text-brand-primary focus:ring-brand-primary"
              />
              Prioritaskan kritis
            </label>
            <ExportButtons
              disabled={lowStockQuery.isLoading && !lowStockQuery.data}
              isExporting={exportingKey === 'low-stock-csv' || exportingKey === 'low-stock-pdf'}
              onExport={(format) =>
                handleExport('low-stock', '/api/reports/inventory/low-stock/export', {}, format)
              }
            />
          </div>
        </div>
        {lowStockQuery.isLoading && !lowStockQuery.data ? (
          <div className="space-y-2">
            <SkeletonBlock className="h-14" />
            <SkeletonBlock className="h-14" />
            <SkeletonBlock className="h-14" />
          </div>
        ) : filteredLowStock.length === 0 ? (
          <p className="text-sm text-ink-500">Semua stok berada di atas ambang batas aman.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-100 text-left text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-3 py-2">Produk</th>
                  <th className="px-3 py-2">Merek</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2 text-center">Stok</th>
                  <th className="px-3 py-2 text-center">Ambang</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filteredLowStock.map((item) => (
                  <tr key={item.variantId} className="bg-white/70">
                    <td className="px-3 py-3 text-sm font-semibold text-brand-dark">{item.productName}</td>
                    <td className="px-3 py-3 text-sm text-ink-500">{item.brandName}</td>
                    <td className="px-3 py-3 text-sm text-ink-500">{item.sku}</td>
                    <td className="px-3 py-3 text-center text-sm font-semibold text-red-600">{item.onHand}</td>
                    <td className="px-3 py-3 text-center text-sm text-ink-500">{item.threshold}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/inventory/${item.productId}`)}
                          className="rounded-full border border-ink-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-500 transition hover:border-brand-secondary hover:text-brand-secondary"
                        >
                          Sesuaikan
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/purchase-orders/new?sku=${encodeURIComponent(item.sku)}`)}
                          className="rounded-full border border-brand-primary/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-primary transition hover:bg-brand-primary hover:text-white"
                        >
                          Reorder
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {lowStockQuery.error ? (
          <p className="text-sm text-red-600">{(lowStockQuery.error as Error).message}</p>
        ) : null}
      </section>
    </div>
  )
}
