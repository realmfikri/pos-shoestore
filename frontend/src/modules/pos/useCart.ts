import { useMemo, useReducer } from 'react'
import type { CartLine, CartTotals, PosInventoryItem } from './types'

type CartState = {
  lines: CartLine[]
}

type CartAction =
  | { type: 'add'; item: PosInventoryItem }
  | { type: 'remove'; variantId: string }
  | { type: 'updateQuantity'; variantId: string; quantity: number }
  | { type: 'updateDiscount'; variantId: string; discountCents: number }
  | { type: 'clear' }

const toCartLine = (item: PosInventoryItem): CartLine => ({
  variantId: item.variantId,
  sku: item.sku,
  name: item.productName,
  brandName: item.brandName,
  priceCents: item.priceCents ?? 0,
  quantity: 1,
  discountCents: 0,
})

const cartReducer = (state: CartState, action: CartAction): CartState => {
  switch (action.type) {
    case 'add': {
      const existing = state.lines.find((line) => line.variantId === action.item.variantId)
      if (existing) {
        return {
          lines: state.lines.map((line) =>
            line.variantId === action.item.variantId
              ? { ...line, quantity: line.quantity + 1 }
              : line
          ),
        }
      }

      return { lines: [...state.lines, toCartLine(action.item)] }
    }
    case 'remove': {
      return { lines: state.lines.filter((line) => line.variantId !== action.variantId) }
    }
    case 'updateQuantity': {
      return {
        lines: state.lines.map((line) =>
          line.variantId === action.variantId
            ? { ...line, quantity: Math.max(1, Math.round(action.quantity)) }
            : line
        ),
      }
    }
    case 'updateDiscount': {
      return {
        lines: state.lines.map((line) =>
          line.variantId === action.variantId
            ? { ...line, discountCents: Math.max(0, Math.round(action.discountCents)) }
            : line
        ),
      }
    }
    case 'clear':
      return { lines: [] }
    default:
      return state
  }
}

const initialState: CartState = { lines: [] }

export const useCart = () => {
  const [state, dispatch] = useReducer(cartReducer, initialState)

  const totals: CartTotals = useMemo(() => {
    return state.lines.reduce(
      (acc, line) => {
        const lineSubtotal = line.priceCents * line.quantity
        const lineDiscount = Math.min(line.discountCents, lineSubtotal)
        return {
          subtotalCents: acc.subtotalCents + lineSubtotal,
          discountTotalCents: acc.discountTotalCents + lineDiscount,
          totalCents: acc.totalCents + (lineSubtotal - lineDiscount),
        }
      },
      { subtotalCents: 0, discountTotalCents: 0, totalCents: 0 }
    )
  }, [state.lines])

  return {
    lines: state.lines,
    totals,
    addItem: (item: PosInventoryItem) => dispatch({ type: 'add', item }),
    removeItem: (variantId: string) => dispatch({ type: 'remove', variantId }),
    updateQuantity: (variantId: string, quantity: number) =>
      dispatch({ type: 'updateQuantity', variantId, quantity }),
    updateDiscount: (variantId: string, discountCents: number) =>
      dispatch({ type: 'updateDiscount', variantId, discountCents }),
    clear: () => dispatch({ type: 'clear' }),
  }
}
