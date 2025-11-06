import { format } from 'date-fns'
import type { ReceiptWithMeta } from './types'

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

interface ReceiptViewProps {
  receipt: ReceiptWithMeta | null
  onReprint: () => void
}

export const ReceiptView = ({ receipt, onReprint }: ReceiptViewProps) => {
  if (!receipt) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-200 bg-white/80 p-6 text-center text-sm text-ink-400">
        Complete a sale to preview a receipt.
      </div>
    )
  }

  const saleDate = format(new Date(receipt.sale.createdAt), 'PPPp')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-brand-dark">Receipt preview</h3>
        <button
          type="button"
          onClick={onReprint}
          className="rounded-full border border-ink-200 px-4 py-1.5 text-sm font-semibold text-brand-dark transition hover:border-brand-primary hover:text-brand-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary print:hidden"
        >
          Reprint
        </button>
      </div>
      <div className="receipt-print mx-auto w-full max-w-sm rounded-3xl bg-white p-6 text-sm text-ink-700 shadow-brand print:shadow-none">
        <div className="text-center">
          <h4 className="font-display text-lg text-brand-dark">{receipt.store.name}</h4>
          <p className="text-xs text-ink-400">{receipt.store.address}</p>
          <p className="text-xs text-ink-400">{receipt.store.phone}</p>
        </div>
        <div className="mt-4 border-t border-dashed border-ink-200 pt-3 text-xs text-ink-500">
          <p>Receipt #: {receipt.sale.id}</p>
          <p>Date: {saleDate}</p>
        </div>
        <div className="mt-4 space-y-2">
          {receipt.items.map((item) => (
            <div key={item.variantId} className="flex justify-between gap-4 text-xs">
              <div>
                <p className="font-medium text-ink-700">{item.productName}</p>
                <p className="text-[11px] text-ink-400">SKU: {item.sku}</p>
                <p className="text-[11px] text-ink-400">
                  {item.quantity} × {currency.format(item.unitPriceCents / 100)}
                  {item.discountCents > 0
                    ? ` (-${currency.format(item.discountCents / 100)})`
                    : ''}
                </p>
              </div>
              <span className="font-semibold text-ink-700">
                {currency.format(item.lineTotalCents / 100)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-dashed border-ink-200 pt-3 text-xs text-ink-600">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{currency.format(receipt.totals.subtotalCents / 100)}</span>
          </div>
          <div className="flex justify-between">
            <span>Discounts</span>
            <span>-{currency.format(receipt.totals.discountTotalCents / 100)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax</span>
            <span>{currency.format(receipt.totals.taxTotalCents / 100)}</span>
          </div>
          <div className="flex justify-between font-semibold text-brand-dark">
            <span>Total</span>
            <span>{currency.format(receipt.totals.totalCents / 100)}</span>
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-ink-500">
            <span>Paid</span>
            <span>{currency.format(receipt.totals.paymentTotalCents / 100)}</span>
          </div>
          <div className="flex justify-between text-[11px] text-ink-500">
            <span>Tendered</span>
            <span>{currency.format(receipt.tenderedCents / 100)}</span>
          </div>
          <div className="flex justify-between text-[11px] font-semibold text-brand-primary">
            <span>Change</span>
            <span>{currency.format(receipt.changeDueCents / 100)}</span>
          </div>
        </div>
        <div className="mt-4 text-center text-[11px] text-ink-400">
          <p>Thank you for shopping with us!</p>
          <p>Powered by SoleSense POS</p>
        </div>
      </div>
    </div>
  )
}
