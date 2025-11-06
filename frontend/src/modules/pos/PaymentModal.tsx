import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import type { CartLine, CartTotals } from './types'

const cashPresets = [5, 10, 20, 50, 100]

interface PaymentModalProps {
  open: boolean
  totals: CartTotals
  cartLines: CartLine[]
  onClose: () => void
  onSubmit: (payload: { tenderedCents: number }) => Promise<void>
  isSubmitting: boolean
  errorMessage: string | null
}

const formatCurrency = (valueInCents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    valueInCents / 100
  )

export const PaymentModal = ({
  open,
  totals,
  cartLines,
  onClose,
  onSubmit,
  isSubmitting,
  errorMessage,
}: PaymentModalProps) => {
  const [tendered, setTendered] = useState(() => totals.totalCents / 100)

  useEffect(() => {
    if (open) {
      setTendered(totals.totalCents / 100)
    }
  }, [open, totals.totalCents])

  const tenderedCents = useMemo(() => Math.max(0, Math.round(tendered * 100)), [tendered])
  const changeDueCents = useMemo(
    () => Math.max(0, tenderedCents - totals.totalCents),
    [tenderedCents, totals.totalCents]
  )

  const handlePreset = useCallback((amount: number) => {
    setTendered(amount)
  }, [])

  const handleSubmit = useCallback(async () => {
    await onSubmit({ tenderedCents })
  }, [onSubmit, tenderedCents])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        void handleSubmit()
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        if (!isSubmitting) {
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, handleSubmit, onClose, isSubmitting])

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-ink-900/40" />
        </Transition.Child>

        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 sm:items-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
                <Dialog.Title className="text-lg font-semibold text-brand-dark">Complete sale</Dialog.Title>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <section className="space-y-3">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
                      Cart summary
                    </h4>
                    <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-ink-100 p-3">
                      {cartLines.map((line) => (
                        <div key={line.variantId} className="flex justify-between text-sm text-ink-600">
                          <div>
                            <p className="font-medium text-brand-dark">{line.name}</p>
                            <p className="text-xs text-ink-400">
                              {line.quantity} × {formatCurrency(line.priceCents)}
                              {line.discountCents > 0
                                ? ` — less ${formatCurrency(line.discountCents)}`
                                : ''}
                            </p>
                          </div>
                          <span className="font-semibold text-brand-primary">
                            {formatCurrency(line.priceCents * line.quantity - line.discountCents)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <dl className="space-y-1 text-sm">
                      <div className="flex justify-between text-ink-500">
                        <dt>Subtotal</dt>
                        <dd>{formatCurrency(totals.subtotalCents)}</dd>
                      </div>
                      <div className="flex justify-between text-ink-500">
                        <dt>Discounts</dt>
                        <dd>-{formatCurrency(totals.discountTotalCents)}</dd>
                      </div>
                      <div className="flex justify-between text-brand-dark text-base font-semibold">
                        <dt>Total due</dt>
                        <dd>{formatCurrency(totals.totalCents)}</dd>
                      </div>
                    </dl>
                  </section>
                  <section className="space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
                        Cash presets
                      </h4>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {cashPresets.map((amount) => (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => handlePreset(amount)}
                            className="rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-brand-dark shadow-sm transition hover:border-brand-primary hover:text-brand-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                          >
                            {formatCurrency(amount * 100)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink-500" htmlFor="tendered-amount">
                        Tendered amount
                      </label>
                      <div className="mt-1 flex rounded-xl border border-ink-200 bg-white px-3 py-2 text-ink-900 shadow-inner">
                        <span className="self-center pr-2 text-sm font-semibold text-ink-400">$</span>
                        <input
                          id="tendered-amount"
                          type="number"
                          min={0}
                          step={0.01}
                          value={tendered}
                          onChange={(event) => setTendered(Number(event.target.value))}
                          className="w-full border-none bg-transparent text-lg font-semibold outline-none focus:ring-0"
                        />
                      </div>
                    </div>
                    <dl className="space-y-1 text-sm">
                      <div className="flex justify-between text-ink-500">
                        <dt>Tendered</dt>
                        <dd>{formatCurrency(tenderedCents)}</dd>
                      </div>
                      <div className="flex justify-between text-brand-dark text-base font-semibold">
                        <dt>Change</dt>
                        <dd>{formatCurrency(changeDueCents)}</dd>
                      </div>
                    </dl>
                    {errorMessage ? (
                      <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage}</p>
                    ) : null}
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-600 transition hover:border-ink-400 hover:text-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary"
                        disabled={isSubmitting}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary disabled:cursor-not-allowed disabled:bg-brand-primary/60"
                      >
                        {isSubmitting ? 'Processing…' : 'Complete sale'}
                      </button>
                    </div>
                    <p className="text-xs text-ink-400">
                      Press <span className="font-semibold">Enter</span> to complete or <span className="font-semibold">Esc</span> to cancel.
                    </p>
                  </section>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
