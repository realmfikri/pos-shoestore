import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { Spinner } from '../components/ui/Spinner'
import { useAuth } from '../modules/auth/AuthProvider'
import { PaymentModal } from '../modules/pos/PaymentModal'
import { ReceiptView } from '../modules/pos/ReceiptView'
import { useCart } from '../modules/pos/useCart'
import { useDebouncedValue } from '../modules/pos/useDebouncedValue'
import {
  inflateCachedInventory,
  readInventoryCache,
  saveInventoryCache,
} from '../modules/pos/offlineCache'
import type { InventoryQueryResult, PosInventoryItem, ReceiptWithMeta } from '../modules/pos/types'

interface InventoryApiResponse {
  data: PosInventoryItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
    pageCount: number
  }
}

interface VariantLookupResponse {
  variantId: string
  productId: string
  brandId: string
  sku: string
  barcode: string | null
  priceCents: number | null
  productName: string
  brandName: string
  size: string | null
  color: string | null
  onHand: number
}

interface SaleResponse {
  id: string
  subtotalCents: number
  saleDiscountCents: number
  discountTotalCents: number
  taxTotalCents: number
  totalCents: number
}

type ReceiptResponse = Omit<ReceiptWithMeta, 'tenderedCents' | 'changeDueCents'>

type ScannerFeedback = { type: 'success' | 'error'; message: string }

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

const formatCurrency = (valueInCents: number) => money.format(valueInCents / 100)

export const PosDashboard = () => {
  const { authorizedFetch } = useAuth()
  const {
    lines: cartLines,
    totals: cartTotals,
    addItem,
    removeItem,
    updateQuantity,
    updateDiscount,
    clear: clearCart,
  } = useCart()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastBarcodeRef = useRef<string | null>(null)
  const cachedInventory = useMemo(() => inflateCachedInventory(readInventoryCache()), [])

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [isPaymentOpen, setIsPaymentOpen] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [isCompletingSale, setIsCompletingSale] = useState(false)
  const [lastReceipt, setLastReceipt] = useState<ReceiptWithMeta | null>(null)
  const [isScannerActive, setIsScannerActive] = useState(false)
  const [scannerFeedback, setScannerFeedback] = useState<ScannerFeedback | null>(null)

  const debouncedSearch = useDebouncedValue(searchTerm.trim(), 350)

  const inventoryQuery = useQuery<InventoryQueryResult>({
    queryKey: ['pos', 'inventory', debouncedSearch, selectedBrand, selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', pageSize: '30' })
      if (debouncedSearch) {
        params.set('search', debouncedSearch)
      }
      if (selectedBrand) {
        params.set('brand', selectedBrand)
      }
      if (selectedCategory) {
        params.set('category', selectedCategory)
      }

      try {
        const response = await authorizedFetch(`/api/inventory?${params.toString()}`)
        const payload = (await response.json().catch(() => null)) as InventoryApiResponse | null

        if (!response.ok || !payload) {
          const message = (payload as { message?: string } | null)?.message ?? 'Unable to load products'
          throw new Error(message)
        }

        const result: InventoryQueryResult = {
          ...payload,
          isOffline: false,
          fromCache: false,
        }

        saveInventoryCache({
          timestamp: Date.now(),
          filters: { search: debouncedSearch, brand: selectedBrand, category: selectedCategory },
          data: result.data,
          pagination: result.pagination,
        })

        return result
      } catch (error) {
        const cached = readInventoryCache()
        if (cached) {
          return {
            data: cached.data,
            pagination: cached.pagination,
            isOffline: true,
            fromCache: true,
          }
        }

        if (error instanceof Error) {
          throw error
        }

        throw new Error('Unable to load products')
      }
    },
    placeholderData: cachedInventory ?? undefined,
    retry: 0,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  })

  const products = useMemo(() => inventoryQuery.data?.data ?? [], [inventoryQuery.data])
  const isOfflineCatalog = inventoryQuery.data?.isOffline ?? false
  const isLoadingCatalog = inventoryQuery.isLoading && !inventoryQuery.data
  const inventoryError = inventoryQuery.error as Error | null

  const brandFilters = useMemo(() => {
    const counts = new Map<string, number>()
    products.forEach((item) => {
      counts.set(item.brandName, (counts.get(item.brandName) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([brand]) => brand)
  }, [products])

  const categoryFilters = useMemo(() => {
    const counts = new Map<string, number>()
    products.forEach((item) => {
      if (item.category) {
        counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
      }
    })
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([category]) => category)
  }, [products])

  useEffect(() => {
    if (!scannerFeedback) {
      return
    }
    const timeout = window.setTimeout(() => setScannerFeedback(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [scannerFeedback])

  const handleBarcodeLookup = useCallback(
    async (barcode: string) => {
      try {
        const response = await authorizedFetch(`/api/scan/${encodeURIComponent(barcode)}`)
        const payload = (await response.json().catch(() => null)) as VariantLookupResponse | null

        if (!response.ok || !payload) {
          const message = (payload as { message?: string } | null)?.message ?? 'Barcode not found'
          throw new Error(message)
        }

        const normalized: PosInventoryItem = {
          variantId: payload.variantId,
          productId: payload.productId,
          brandId: payload.brandId,
          sku: payload.sku,
          brandName: payload.brandName,
          productName: payload.productName,
          category: null,
          size: payload.size,
          color: payload.color,
          priceCents: payload.priceCents,
          onHand: payload.onHand,
          description: null,
        }

        addItem(normalized)
        setScannerFeedback({ type: 'success', message: `${normalized.productName} added to cart.` })
      } catch (error) {
        setScannerFeedback({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unable to add scanned item',
        })
      }
    },
    [addItem, authorizedFetch]
  )

  useEffect(() => {
    if (!isScannerActive || !videoRef.current) {
      return
    }

    const reader = new BrowserMultiFormatReader()
    let cancelled = false
    let controls: IScannerControls | undefined

    void reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result, error) => {
        if (cancelled) {
          return
        }

        if (result) {
          const barcode = result.getText()
          if (barcode && barcode !== lastBarcodeRef.current) {
            lastBarcodeRef.current = barcode
            setIsScannerActive(false)
            void handleBarcodeLookup(barcode)
          }
        } else if (error && error.name !== 'NotFoundException') {
          setScannerFeedback({ type: 'error', message: 'Scanner error – try again.' })
        }
      })
      .then((ctrl) => {
        controls = ctrl
      })
      .catch(() => {
        if (!cancelled) {
          setScannerFeedback({ type: 'error', message: 'Unable to access camera.' })
        }
      })

    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [handleBarcodeLookup, isScannerActive])

  const handleNewSale = useCallback(() => {
    clearCart()
    setLastReceipt(null)
  }, [clearCart])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }

      if (event.altKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        if (cartLines.length > 0) {
          setPaymentError(null)
          setIsPaymentOpen(true)
        }
      }

      if (event.altKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        handleNewSale()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [cartLines.length, handleNewSale])

  const toggleScanner = useCallback(() => {
    if (isScannerActive) {
      setIsScannerActive(false)
      lastBarcodeRef.current = null
      return
    }

    setScannerFeedback(null)
    lastBarcodeRef.current = null
    setIsScannerActive(true)
  }, [isScannerActive])

  useEffect(() => {
    if (!isScannerActive) {
      return
    }

    // reset feedback each time scanner opens
    setScannerFeedback(null)
  }, [isScannerActive])

  const handleOpenPayment = useCallback(() => {
    if (cartLines.length === 0) {
      return
    }
    setPaymentError(null)
    setIsPaymentOpen(true)
  }, [cartLines.length])

  const handleClosePayment = useCallback(() => {
    setIsPaymentOpen(false)
    setPaymentError(null)
  }, [])

  const handleCompleteSale = useCallback(
    async ({ tenderedCents }: { tenderedCents: number }) => {
      if (cartLines.length === 0) {
        setPaymentError('Add items to the cart before completing a sale.')
        return
      }

      if (tenderedCents < cartTotals.totalCents) {
        setPaymentError('Tendered amount must cover the total due.')
        return
      }

      setIsCompletingSale(true)
      setPaymentError(null)

      try {
        const response = await authorizedFetch('/api/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cartLines.map((line) => ({
              variantId: line.variantId,
              quantity: line.quantity,
              unitPriceCents: line.priceCents,
              discountCents: Math.min(line.discountCents, line.priceCents * line.quantity),
            })),
            saleDiscountCents: 0,
            taxCents: 0,
            payments: [
              {
                method: 'CASH',
                amountCents: cartTotals.totalCents,
              },
            ],
          }),
        })

        const salePayload = (await response.json().catch(() => null)) as SaleResponse | { message?: string } | null

        if (!response.ok || !salePayload || !('id' in salePayload)) {
          const message = (salePayload as { message?: string } | null)?.message ?? 'Unable to complete sale'
          throw new Error(message)
        }

        const receiptResponse = await authorizedFetch(`/api/sales/${salePayload.id}/receipt`)
        const receiptPayload = (await receiptResponse.json().catch(() => null)) as ReceiptResponse | { message?: string } | null

        if (!receiptResponse.ok || !receiptPayload || !('sale' in receiptPayload)) {
          const message = (receiptPayload as { message?: string } | null)?.message ??
            'Sale recorded but receipt unavailable'
          throw new Error(message)
        }

        const changeDueCents = Math.max(0, tenderedCents - receiptPayload.sale.totalCents)
        setLastReceipt({ ...receiptPayload, tenderedCents, changeDueCents })
        clearCart()
        setIsPaymentOpen(false)
        setSearchTerm('')
        setSelectedBrand(null)
        setSelectedCategory(null)
        searchInputRef.current?.focus()
      } catch (error) {
        setPaymentError(error instanceof Error ? error.message : 'Unable to complete sale')
      } finally {
        setIsCompletingSale(false)
      }
    },
    [authorizedFetch, cartLines, cartTotals, clearCart]
  )

  const handleDiscountChange = useCallback(
    (variantId: string, rawValue: string) => {
      const numericValue = rawValue === '' ? 0 : Number(rawValue)
      if (Number.isNaN(numericValue)) {
        return
      }

      const targetLine = cartLines.find((line) => line.variantId === variantId)
      if (!targetLine) {
        return
      }

      const cents = Math.round(numericValue * 100)
      const maxDiscount = targetLine.priceCents * targetLine.quantity
      updateDiscount(variantId, Math.min(Math.max(0, cents), maxDiscount))
    },
    [cartLines, updateDiscount]
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <section className="rounded-3xl bg-white/80 p-5 shadow-brand ring-1 ring-ink-50">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-brand-dark">Sell footwear in a flash</h2>
                  <span className="hidden text-xs font-semibold uppercase tracking-wide text-ink-400 sm:inline">
                    Shortcut ⌥ + F
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search by name, brand, SKU, or keyword"
                    className="w-full rounded-full border border-ink-200 bg-white px-5 py-3 text-base text-brand-dark shadow-inner focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                    aria-label="Search products"
                  />
                  <button
                    type="button"
                    onClick={toggleScanner}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary ${
                      isScannerActive
                        ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                        : 'border-ink-200 text-ink-600 hover:border-brand-primary hover:text-brand-primary'
                    }`}
                  >
                    {isScannerActive ? 'Stop scanner' : 'Scan barcode'}
                  </button>
                </div>
              </div>
            </div>
            {isScannerActive ? (
              <div className="mt-4 space-y-2">
                <video
                  ref={videoRef}
                  className="h-48 w-full rounded-2xl border border-ink-200 bg-ink-900/5 object-cover"
                  muted
                  autoPlay
                  playsInline
                />
                <p className="text-xs text-ink-400">
                  Align the barcode within the frame to add the product automatically.
                </p>
              </div>
            ) : null}
            {scannerFeedback ? (
              <p
                className={`mt-3 text-sm ${
                  scannerFeedback.type === 'success' ? 'text-brand-primary' : 'text-red-600'
                }`}
              >
                {scannerFeedback.message}
              </p>
            ) : null}
            <div className="mt-4 space-y-3">
              {brandFilters.length > 0 ? (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Brands</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {brandFilters.map((brand) => (
                      <button
                        key={brand}
                        type="button"
                        onClick={() =>
                          setSelectedBrand((current) => (current === brand ? null : brand))
                        }
                        className={`pos-chip ${selectedBrand === brand ? 'pos-chip-active' : ''}`}
                      >
                        {brand}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {categoryFilters.length > 0 ? (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Categories</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {categoryFilters.map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() =>
                          setSelectedCategory((current) => (current === category ? null : category))
                        }
                        className={`pos-chip ${selectedCategory === category ? 'pos-chip-active' : ''}`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedBrand || selectedCategory ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBrand(null)
                    setSelectedCategory(null)
                  }}
                  className="text-xs font-semibold uppercase tracking-wide text-brand-primary"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          </section>

          {isOfflineCatalog ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Offline mode: showing the last cached catalog. Changes will sync once connectivity is restored.
            </div>
          ) : null}

          {inventoryError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {inventoryError.message}
            </div>
          ) : null}

          {isLoadingCatalog ? <Spinner label="Loading catalog" /> : null}

          {!isLoadingCatalog ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((item) => (
                <div key={item.variantId} className="pos-card">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                      {item.brandName}
                    </p>
                    <h3 className="text-lg font-semibold text-brand-dark">{item.productName}</h3>
                    <p className="text-xs text-ink-400">SKU: {item.sku}</p>
                    <p className="text-xs text-ink-400">
                      {item.size ? `Size ${item.size}` : 'Size varies'} · {item.color ?? 'Assorted colors'}
                    </p>
                    <p className="text-sm font-semibold text-brand-primary">
                      {item.priceCents != null ? formatCurrency(item.priceCents) : 'Price required'}
                    </p>
                    <p className="text-xs text-ink-400">On hand: {item.onHand}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addItem(item)}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-brand-primary px-5 py-3 text-base font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary"
                  >
                    Add to cart
                  </button>
                </div>
              ))}
              {products.length === 0 && !inventoryError ? (
                <div className="col-span-full rounded-2xl border border-dashed border-ink-200 bg-white/80 p-6 text-center text-sm text-ink-400">
                  No products matched your filters. Try adjusting the search or filters above.
                </div>
              ) : null}
            </div>
          ) : null}
          {inventoryQuery.isFetching && !isLoadingCatalog ? (
            <p className="text-xs text-ink-400">Refreshing catalog…</p>
          ) : null}
        </div>

        <div className="space-y-4 lg:col-span-4">
          <section className="rounded-3xl bg-white/80 p-5 shadow-brand ring-1 ring-ink-50">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-brand-dark">Cart</h3>
              <button
                type="button"
                onClick={handleNewSale}
                className="text-sm font-semibold text-brand-primary hover:underline"
              >
                New sale (⌥ + N)
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {cartLines.map((line) => (
                <div key={line.variantId} className="rounded-2xl border border-ink-100 bg-white/90 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-brand-dark">{line.name}</p>
                      <p className="text-xs text-ink-400">SKU: {line.sku}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(line.variantId)}
                      className="text-xs font-semibold uppercase tracking-wide text-red-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(line.variantId, line.quantity - 1)}
                        className="pos-qty-button"
                        aria-label={`Decrease quantity of ${line.name}`}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(event) =>
                          updateQuantity(line.variantId, Number(event.target.value) || line.quantity)
                        }
                        className="h-11 w-16 rounded-xl border border-ink-200 bg-white text-center text-base font-semibold text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                        aria-label={`Quantity for ${line.name}`}
                      />
                      <button
                        type="button"
                        onClick={() => updateQuantity(line.variantId, line.quantity + 1)}
                        className="pos-qty-button"
                        aria-label={`Increase quantity of ${line.name}`}
                      >
                        +
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-ink-400">Unit {formatCurrency(line.priceCents)}</p>
                      <p className="text-lg font-semibold text-brand-dark">
                        {formatCurrency(line.priceCents * line.quantity - line.discountCents)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <label className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                      Line discount
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-ink-400">$</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.discountCents / 100}
                        onChange={(event) =>
                          handleDiscountChange(line.variantId, event.target.value)
                        }
                        className="w-24 rounded-xl border border-ink-200 bg-white px-3 py-2 text-right text-sm font-semibold text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                      />
                    </div>
                  </div>
                </div>
              ))}
              {cartLines.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-ink-200 bg-white/80 p-6 text-center text-sm text-ink-400">
                  Search the catalog or scan a barcode to start a sale.
                </div>
              ) : null}
            </div>
            <div className="mt-4 space-y-2 border-t border-ink-100 pt-4">
              <div className="flex justify-between text-sm text-ink-500">
                <span>Subtotal</span>
                <span>{formatCurrency(cartTotals.subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-sm text-ink-500">
                <span>Discounts</span>
                <span>-{formatCurrency(cartTotals.discountTotalCents)}</span>
              </div>
              <div className="flex justify-between text-lg font-semibold text-brand-dark">
                <span>Total due</span>
                <span>{formatCurrency(cartTotals.totalCents)}</span>
              </div>
              <div className="mt-4">
                <div
                  className="sticky bottom-0 left-0 right-0 z-20 -mx-5 rounded-t-3xl border border-ink-100 bg-white/95 px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-4 shadow-[0_-12px_30px_rgba(15,23,42,0.15)] sm:static sm:mx-0 sm:rounded-none sm:border-none sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:shadow-none"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={handleNewSale}
                      className="rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-600 transition hover:border-ink-400 hover:text-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary"
                    >
                      Clear cart
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenPayment}
                      disabled={cartLines.length === 0}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary disabled:cursor-not-allowed disabled:bg-brand-primary/60"
                    >
                      Take payment (⌥ + P)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white/80 p-5 shadow-brand ring-1 ring-ink-50">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Shortcuts</h3>
            <ul className="mt-3 space-y-2 text-sm text-ink-500">
              <li>
                <span className="font-semibold text-brand-dark">⌥ + F</span> Focus search
              </li>
              <li>
                <span className="font-semibold text-brand-dark">⌥ + P</span> Open payment modal
              </li>
              <li>
                <span className="font-semibold text-brand-dark">⌥ + N</span> Start a new sale
              </li>
            </ul>
          </section>

          <section className="rounded-3xl bg-white/80 p-5 shadow-brand ring-1 ring-ink-50">
            <ReceiptView receipt={lastReceipt} onReprint={() => window.print()} />
          </section>
        </div>
      </div>

      <PaymentModal
        open={isPaymentOpen}
        totals={cartTotals}
        cartLines={cartLines}
        onClose={handleClosePayment}
        onSubmit={handleCompleteSale}
        isSubmitting={isCompletingSale}
        errorMessage={paymentError}
      />
    </div>
  )
}
