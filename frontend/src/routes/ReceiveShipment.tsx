import { FormEvent, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AuthorizedFetch, useAuth } from '../modules/auth/AuthProvider'

interface ReceivePayload {
  sku: string
  quantity: number
  supplier: string
  reference: string
}

const receiveShipment = async (payload: ReceivePayload, authorizedFetch: AuthorizedFetch) => {
  const response = await authorizedFetch('/api/receiving', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message ?? 'Unable to receive inventory right now')
  }
}

export const ReceiveShipment = () => {
  const { authorizedFetch } = useAuth()
  const queryClient = useQueryClient()
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const mutation = useMutation({
    mutationKey: ['receiving'],
    mutationFn: (payload: ReceivePayload) => receiveShipment(payload, authorizedFetch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setStatusMessage('Shipment recorded and inventory updated.')
    },
    onError: (err: unknown) => {
      setStatusMessage(err instanceof Error ? err.message : 'Unable to receive inventory right now')
    },
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)

    const payload: ReceivePayload = {
      sku: String(form.get('sku') ?? ''),
      quantity: Number(form.get('quantity') ?? 0),
      supplier: String(form.get('supplier') ?? ''),
      reference: String(form.get('reference') ?? ''),
    }

    setStatusMessage(null)
    mutation.mutate(payload, {
      onSuccess: () => {
        formElement.reset()
      },
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-brand-dark">Receive inventory</h3>
        <p className="text-sm text-ink-500">
          Record shipments to instantly update availability across the Shoehaven network.
        </p>
      </div>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        <div className="sm:col-span-2">
          <label htmlFor="sku" className="block text-sm font-medium text-ink-700">
            SKU
          </label>
          <input
            id="sku"
            name="sku"
            required
            className="mt-1 w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </div>
        <div>
          <label htmlFor="quantity" className="block text-sm font-medium text-ink-700">
            Quantity received
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            required
            className="mt-1 w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </div>
        <div>
          <label htmlFor="supplier" className="block text-sm font-medium text-ink-700">
            Supplier
          </label>
          <input
            id="supplier"
            name="supplier"
            required
            className="mt-1 w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="reference" className="block text-sm font-medium text-ink-700">
            Packing slip / reference
          </label>
          <input
            id="reference"
            name="reference"
            className="mt-1 w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm text-ink-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </div>
        <div className="sm:col-span-2 flex flex-col gap-2">
          <button type="submit" className="button-primary self-start" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Record receipt'}
          </button>
          {statusMessage ? <p className="text-sm text-brand-dark">{statusMessage}</p> : null}
        </div>
      </form>
    </div>
  )
}
