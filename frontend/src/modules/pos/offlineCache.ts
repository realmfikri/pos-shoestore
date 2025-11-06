import type { CachedInventoryRecord, InventoryQueryResult } from './types'

const CACHE_KEY = 'pos:last-products'

// TODO: expand this lightweight cache with background sync once offline support is extended
// to include sale reconciliation.

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

export const saveInventoryCache = (record: CachedInventoryRecord) => {
  if (!isBrowser) return
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(record))
  } catch (error) {
    console.warn('Unable to persist POS cache', error)
  }
}

export const readInventoryCache = (): CachedInventoryRecord | null => {
  if (!isBrowser) return null
  const raw = window.localStorage.getItem(CACHE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as CachedInventoryRecord
    if (!parsed || !Array.isArray(parsed.data)) {
      return null
    }
    return parsed
  } catch (error) {
    console.warn('Unable to read POS cache', error)
    return null
  }
}

export const inflateCachedInventory = (
  record: CachedInventoryRecord | null
): InventoryQueryResult | null => {
  if (!record) return null
  return {
    data: record.data,
    pagination: record.pagination,
    isOffline: true,
    fromCache: true,
  }
}
