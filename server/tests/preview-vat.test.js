import { describe, expect, it } from 'vitest';
import { sheetPricing } from '../../client/src/utils/sheetPricing.js';
import { vatExclusiveItemRows } from '../../client/src/utils/previewVat.js';
import { computeTotals } from '../../shared/pricing.js';

describe('VAT-exclusive item amounts in invoice preview', () => {
  const invoice = {
    items: [
      { product_service: 'Consulting', quantity: 2, unit_cost: '112.00' },
      { product_service: 'Licensing', quantity: 1, unit_cost: '56.00' },
    ],
    text_rows: [{ text: 'Implementation support', after_item: 1 }],
  };
  it('keeps the gross values and unit costs untouched when converting line amounts', () => {
    const { rows, total } = sheetPricing(invoice);
    const converted = vatExclusiveItemRows(rows, total);
    expect(rows.map(x => x.a)).toEqual(['224.00', '', '56.00']);
    expect(converted.map(x => x.a)).toEqual(['200.00', '', '50.00']);
    expect(converted.map(x => x.u)).toEqual(rows.map(x => x.u));
    expect(converted[1]).toEqual(rows[1]);
    expect(total).toBe(28000);
  });
  it('reconciles rounding to the existing net-of-VAT total', () => {
    const priced = sheetPricing({ items: Array.from({ length: 7 }, (_, i) => ({ product_service: String(i), unit_cost: '0.07', quantity: '1' })) });
    const converted = vatExclusiveItemRows(priced.rows, priced.total);
    const sum = converted.reduce((n, r) => n + Math.round(Number(r.a.replace(/,/g, '')) * 100), 0);
    expect(sum).toBe(computeTotals(priced.total, 'vatable', 0).net);
    expect(priced.rows.every((r) => r.a === '0.07')).toBe(true);
  });
  it('leaves unknown legacy item amounts blank instead of inventing prices', () => {
    const priced = sheetPricing({ amount: 400, items: [
      { product_service: 'A', quantity: 2, unit_cost: null },
      { product_service: 'B', quantity: 2, unit_cost: null },
    ] });
    expect(vatExclusiveItemRows(priced.rows, priced.total)).toEqual(priced.rows);
  });
  it('preserves text-only rows and leaves input objects unchanged', () => {
    const { rows, total } = sheetPricing(invoice);
    const snapshot = JSON.stringify(rows);
    vatExclusiveItemRows(rows, total);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});
