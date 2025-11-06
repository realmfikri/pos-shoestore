export type SupplierSummary = {
  id: string
  name: string
  contact: string | null
  email: string | null
  phone: string | null
  address: string | null
  createdAt: string
  updatedAt: string
}

export type VariantSummary = {
  id: string
  sku: string
  size: string | null
  color: string | null
  productId: string
  productName: string
  brandName: string
}

export type PurchaseOrderItemSummary = {
  id: string
  variant: VariantSummary
  quantityOrdered: number
  quantityReceived: number
  costCents: number | null
  createdAt: string
  updatedAt: string
}

export type PurchaseOrderReceiptItem = {
  id: string
  purchaseOrderItemId: string
  quantityReceived: number
  costCents: number | null
  variant: VariantSummary
  createdAt: string
}

export type PurchaseOrderReceipt = {
  id: string
  purchaseOrderId: string
  receivedAt: string
  createdAt: string
  receivedBy: { id: string; firstName: string; lastName: string } | null
  items: PurchaseOrderReceiptItem[]
}

export type PurchaseOrderSummary = {
  id: string
  supplierId: string
  supplier: SupplierSummary
  status: 'DRAFT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED'
  createdAt: string
  updatedAt: string
  orderedAt: string | null
  receivedAt: string | null
  createdById: string
  items: PurchaseOrderItemSummary[]
  receipts: PurchaseOrderReceipt[]
}
