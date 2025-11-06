import { describe, expect, it } from 'vitest';
import {
  calculateVariantOnHand,
  summarizeLedgerByVariant,
  hasDuplicateInitialCounts,
  LedgerMathEntry,
} from './stock';

describe('stock ledger math helpers', () => {
  const baseEntries: LedgerMathEntry[] = [
    { variantId: 'v1', quantityChange: 10, type: 'INITIAL_COUNT' },
    { variantId: 'v1', quantityChange: 5, type: 'RECEIPT' },
    { variantId: 'v1', quantityChange: -2, type: 'SALE' },
  ];

  it('sums quantity changes for a variant', () => {
    expect(calculateVariantOnHand(baseEntries)).toEqual(13);
  });

  it('aggregates balances per variant', () => {
    const summary = summarizeLedgerByVariant([
      ...baseEntries,
      { variantId: 'v2', quantityChange: 4, type: 'INITIAL_COUNT' },
      { variantId: 'v2', quantityChange: -1, type: 'SALE' },
    ]);

    expect(summary.v1).toEqual({ onHand: 13, hasInitialCount: true });
    expect(summary.v2).toEqual({ onHand: 3, hasInitialCount: true });
  });

  it('detects duplicate initial count entries', () => {
    expect(
      hasDuplicateInitialCounts([
        { variantId: 'v3', quantityChange: 10, type: 'INITIAL_COUNT' },
        { variantId: 'v3', quantityChange: 5, type: 'INITIAL_COUNT' },
      ]),
    ).toBe(true);

    expect(hasDuplicateInitialCounts(baseEntries)).toBe(false);
  });
});
