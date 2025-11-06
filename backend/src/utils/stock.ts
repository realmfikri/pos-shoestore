import { StockLedgerType } from '../types/inventoryContracts';

export type LedgerMathEntry = {
  variantId: string;
  quantityChange: number;
  type: StockLedgerType;
};

export type VariantLedgerSummary = {
  onHand: number;
  hasInitialCount: boolean;
};

export const calculateVariantOnHand = (entries: LedgerMathEntry[]): number => {
  return entries.reduce((total, entry) => total + entry.quantityChange, 0);
};

export const summarizeLedgerByVariant = (
  entries: LedgerMathEntry[],
): Record<string, VariantLedgerSummary> => {
  return entries.reduce<Record<string, VariantLedgerSummary>>((accumulator, entry) => {
    const existing = accumulator[entry.variantId] ?? { onHand: 0, hasInitialCount: false };

    const updated: VariantLedgerSummary = {
      onHand: existing.onHand + entry.quantityChange,
      hasInitialCount: existing.hasInitialCount || entry.type === 'INITIAL_COUNT',
    };

    accumulator[entry.variantId] = updated;
    return accumulator;
  }, {});
};

export const hasDuplicateInitialCounts = (entries: LedgerMathEntry[]): boolean => {
  let encountered = false;

  for (const entry of entries) {
    if (entry.type === 'INITIAL_COUNT') {
      if (encountered) {
        return true;
      }

      encountered = true;
    }
  }

  return false;
};
