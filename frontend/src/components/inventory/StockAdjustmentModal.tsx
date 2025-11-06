import { FormEvent, useEffect, useState } from 'react'
import { classNames } from '../../lib/classNames'

type ReasonCode = 'damaged' | 'lost'

interface StockAdjustmentModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (payload: { reasonCode: ReasonCode; quantity: number; note?: string }) => void
  isSubmitting?: boolean
}

const reasonOptions: Array<{ value: ReasonCode; label: string }> = [
  { value: 'damaged', label: 'Damaged' },
  { value: 'lost', label: 'Lost' },
]

export const StockAdjustmentModal = ({ open, onClose, onSubmit, isSubmitting = false }: StockAdjustmentModalProps) => {
  const [reasonCode, setReasonCode] = useState<ReasonCode>('damaged')
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      setReasonCode('damaged')
      setQuantity(1)
      setNote('')
    }
  }, [open])

  if (!open) {
    return null
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (quantity <= 0) {
      return
    }

    const trimmedNote = note.trim()
    onSubmit({
      reasonCode,
      quantity,
      note: trimmedNote.length > 0 ? trimmedNote : undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-brand-dark">Adjust stock</h3>
            <p className="text-sm text-ink-500">
              Record on-hand corrections for damaged or lost items. Adjustments will be written to the stock ledger.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-ink-400 transition hover:bg-ink-100 hover:text-brand-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary"
          >
            <span className="sr-only">Close</span>
            ×
          </button>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label htmlFor="reason" className="text-sm font-semibold text-ink-700">
              Reason
            </label>
            <div className="flex gap-2">
              {reasonOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setReasonCode(option.value)}
                  className={classNames(
                    'flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition',
                    reasonCode === option.value
                      ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                      : 'border-ink-200 text-ink-500 hover:border-brand-secondary hover:text-brand-secondary',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="quantity" className="block text-sm font-semibold text-ink-700">
              Quantity to remove
            </label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
              required
              className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>
          <div>
            <label htmlFor="note" className="block text-sm font-semibold text-ink-700">
              Note (optional)
            </label>
            <textarea
              id="note"
              name="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-500 transition hover:border-brand-secondary hover:text-brand-secondary"
            >
              Cancel
            </button>
            <button type="submit" className="button-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Apply adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
