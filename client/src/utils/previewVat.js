import { computeTotals } from '../../../shared/pricing.js';
import { money } from './sheetPricing.js';

// Reformat a displayed money value (produced by sheetPricing) as integer centavos.
function displayedCentavos(value) {
  if (typeof value !== 'string' || !/^\d[\d,]*\.\d{2}$/.test(value)) return null;
  const amount = Number(value.replace(/,/g, ''));
  const result = Math.round(amount * 100);
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

// Convert VAT-inclusive item AMOUNTS for preview/print only. Unit costs stay as entered.
// For fully priced invoices, allocate centavo rounding across lines so their displayed
// VAT-exclusive amounts add up EXACTLY to the existing "Amount: Net of VAT" total.
// Supplemental description-only rows and remarks have no amounts and stay untouched.
export function vatExclusiveItemRows(rows, totalCentavos) {
  const priced = rows.flatMap((row, index) => {
    const gross = row.note || row.sub ? null : displayedCentavos(row.a);
    return gross === null ? [] : [{ index, gross }];
  });
  if (!priced.length) return rows;

  const allocations = priced.map(({ index, gross }) => {
    const numerator = BigInt(gross) * 100n;
    return { index, net: Number(numerator / 112n), remainder: numerator % 112n };
  });
  const knownTotal = priced.reduce((sum, item) => sum + item.gross, 0);
  if (knownTotal === totalCentavos) {
    // Largest remainder ensures cent-level consistency with the existing tax totals.
    const target = computeTotals(totalCentavos, 'vatable', 0).net;
    let adjustment = target - allocations.reduce((sum, item) => sum + item.net, 0);
    const ordered = [...allocations].sort((a, b) => adjustment >= 0
      ? Number(b.remainder - a.remainder) || a.index - b.index
      : Number(a.remainder - b.remainder) || a.index - b.index);
    for (let index = 0; adjustment !== 0 && ordered.length && index < ordered.length * 2; index++) {
      const entry = ordered[index % ordered.length];
      if (adjustment > 0) { entry.net += 1; adjustment -= 1; }
      else if (entry.net > 0) { entry.net -= 1; adjustment += 1; }
    }
  } else {
    // Older invoices may not have per-item amounts. Never invent them or allocate
    // an undisclosed missing balance to a known product.
    allocations.forEach((entry, i) => {
      entry.net = Number((BigInt(priced[i].gross) * 100n + 56n) / 112n);
    });
  }

  const byIndex = new Map(allocations.map(({ index, net }) => [index, money(net)]));
  return rows.map((row, index) => byIndex.has(index) ? { ...row, a: byIndex.get(index) } : row);
}
