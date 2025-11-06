export interface PosInventoryItem {
  variantId: string
  productId: string
  brandId: string
  sku: string
  brandName: string
  productName: string
  category: string | null
  size: string | null
  color: string | null
  priceCents: number | null
  onHand: number
  description: string | null
}

export interface InventoryQueryResult {
  data: PosInventoryItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
    pageCount: number
  }
  isOffline?: boolean
  fromCache?: boolean
}

export interface CartLine {
  variantId: string
  sku: string
  name: string
  brandName: string
  priceCents: number
  quantity: number
  discountCents: number
}

export interface CartTotals {
  subtotalCents: number
  discountTotalCents: number
  totalCents: number
}

export interface SaleReceiptPayment {
  method: string
  amountCents: number
}

export interface SaleReceiptItem {
  variantId: string
  sku: string
  productName: string
  quantity: number
  unitPriceCents: number
  discountCents: number
  lineTotalCents: number
}

export interface SaleReceiptStore {
  name: string
  address: string
  phone: string
}

export interface SaleReceiptSummary {
  sale: {
    id: string
    createdAt: string
    subtotalCents: number
    saleDiscountCents: number
    discountTotalCents: number
    taxTotalCents: number
    totalCents: number
  }
  store: SaleReceiptStore
  items: SaleReceiptItem[]
  payments: SaleReceiptPayment[]
  totals: {
    subtotalCents: number
    discountTotalCents: number
    taxTotalCents: number
    totalCents: number
    paymentTotalCents: number
  }
}

export interface ReceiptWithMeta extends SaleReceiptSummary {
  tenderedCents: number
  changeDueCents: number
}

export interface CachedInventoryRecord {
  timestamp: number
  filters: {
    search: string
    brand: string | null
    category: string | null
  }
  data: PosInventoryItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
    pageCount: number
  }
}
