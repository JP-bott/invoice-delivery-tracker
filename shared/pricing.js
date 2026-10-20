// Line-item pricing, shared by the form/preview (live) and the API (authoritative). Integer maths only.
// Amounts are VAT-inclusive, exactly as before: the invoice amount is the sum of the line amounts, and the
// preview splits VAT out of it (see computeTotals). Pure JS, no imports.
export const MAX_ITEMS = 30;
export const MAX_QTY = 1_000_000;
export const MAX_UNIT_CENTAVOS = 100_000_000_000; // ₱1,000,000,000.00 per unit
export const MAX_LINE_CENTAVOS = 100_000_000_000_000; // ₱1,000,000,000,000.00 per line (keeps totals < 2^53)

const MONEY = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;
const QTY = /^\d+(?:\.\d{1,3})?$/;

// "1,250.5" -> 125050. Returns null for anything that is not a plain non-negative amount with max 2 decimals.
export function parseUnitCost(v) {
  const s = String(v ?? '').trim();
  if (!MONEY.test(s)) return null;
  const [p, c = ''] = s.replace(/,/g, '').split('.');
  const n = Number(p) * 100 + Number(c.padEnd(2, '0'));
  return Number.isSafeInteger(n) && n <= MAX_UNIT_CENTAVOS ? n : null;
}
// "2.5" -> 2500 (thousandths). Null unless 0 < qty <= MAX_QTY with max 3 decimals.
export function parseQtyMilli(v) {
  const s = String(v ?? '').replace(/,/g, '').trim();
  if (!QTY.test(s)) return null;
  const [p, f = ''] = s.split('.');
  const n = Number(p) * 1000 + Number(f.padEnd(3, '0'));
  return n > 0 && n <= MAX_QTY * 1000 ? n : null;
}
// Unit Cost × Quantity, rounded half-up to the centavo.
export const lineAmountCentavos = (unitCentavos, qtyMilli) => Number((BigInt(unitCentavos) * BigInt(qtyMilli) + 500n) / 1000n);

// priceItems([{ unit_cost, quantity }]) -> { lines: [{ unit, qtyMilli, amount, errors:{unit_cost?,quantity?} }], subtotal, ok }
export function priceItems(items = []) {
  let subtotal = 0, ok = items.length > 0;
  const lines = items.map((it) => {
    const unit = parseUnitCost(it?.unit_cost), qtyMilli = parseQtyMilli(it?.quantity), errors = {};
    if (unit == null) errors.unit_cost = 'Enter a unit cost of 0 or more (max 2 decimals)';
    if (qtyMilli == null) errors.quantity = 'Enter a quantity above 0 (max 3 decimals)';
    let amount = null;
    if (!errors.unit_cost && !errors.quantity) {
      amount = lineAmountCentavos(unit, qtyMilli);
      if (amount > MAX_LINE_CENTAVOS) { errors.unit_cost = 'Amount is too large'; amount = null; }
    }
    if (amount == null) ok = false; else subtotal += amount;
    return { unit, qtyMilli, amount, errors };
  });
  return { lines, subtotal: ok ? subtotal : null, ok };
}

// Existing preview tax arithmetic, unchanged: the invoice amount is the VAT-inclusive total; VAT is 12% extracted
// for 'vatable' sales; withholding tax applies to the net of VAT. (Sale type and withholding rate are preview-only.)
export function computeTotals(totalCentavos, type, whtRate) {
  const total = totalCentavos || 0;
  let net = total, vat = 0, sV = 0, sE = 0, sZ = 0;
  if (type === 'vatable') { net = Math.round(total / 1.12); vat = total - net; sV = net; }
  else if (type === 'exempt') sE = total; else sZ = total;
  const wht = Math.round(net * whtRate);
  return { total, net, vat, sV, sE, sZ, wht, grand: net + vat - wht, has: total !== 0 };
}
