import { formatQty } from './items.js';
import { priceItems, priceInvoice } from '../../../shared/pricing.js';

const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isNaN(n) ? 0 : n; };
const cents = (n) => Math.round(n * 100);
export const money = (c) => (c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Text rows use independent positions and never contribute to unit cost, quantity or totals.
function withTextRows(productRows, entries) {
  if (!Array.isArray(entries) || !entries.length) return productRows;
  const result = [];
  for (let position = 0; position <= productRows.length; position++) {
    for (const entry of entries) {
      if (Number(entry?.after_item) === position && String(entry?.text ?? '').trim()) {
        const priced = entry.is_priced === true;
        const line = priced ? priceItems([{ quantity: entry.quantity, unit_cost: entry.unit_cost }]).lines[0] : null;
        result.push({ q: priced ? formatQty(entry.quantity) : '', d: entry.text,
          u: priced && line?.unit != null ? money(line.unit) : '',
          a: priced && line?.amount != null ? money(line.amount) : '', note: !priced, spec: priced });
      }
    }
    if (position < productRows.length) result.push(productRows[position]);
  }
  return result;
}

// One sheet row per product/service (QTY, description, unit cost, amount) and the subtotal, which is the saved invoice amount.
// Priced items: each amount is Unit Cost x Quantity and the subtotal is their sum. Invoices saved before unit costs existed carry
// no unit costs; they show their stored amount (a single item also shows its derived unit cost, several items show the total only).
export function sheetPricing(invoice) {
  let list = (Array.isArray(invoice.items) ? invoice.items : []).filter((it) => String(it?.product_service ?? '').trim());
  if (!list.length && invoice.product_service) list = [{ product_service: invoice.product_service, quantity: 1, unit_cost: invoice.amount }];
  const hasUnit = list.some((it) => String(it.unit_cost ?? '').trim() !== '');
  const storedTotal = cents(num(invoice.amount));
  if (!hasUnit && storedTotal && !list.some((it) => it.is_title)) {
    const single = list.length === 1, qty = single ? num(list[0].quantity) : 0;
    const rows = list.map((it) => ({ q: formatQty(it.quantity), d: String(it.product_service).trim(), u: single && qty > 0 ? money(Math.round(storedTotal / qty)) : '', a: single ? money(storedTotal) : '' }));
    return { rows: withTextRows(rows, invoice.text_rows), total: storedTotal, totalOnly: list.length > 1 };
  }
  const { lines, subtotal, childrenByProduct } = priceInvoice(list, invoice.text_rows || []);
  const rows = list.map((it, i) => it.is_title
    ? { q: '', d: String(it.product_service).trim(), u: '', a: '', title: true, groupAmount: childrenByProduct[i] }
    : { q: formatQty(it.quantity), d: String(it.product_service).trim(), u: lines[i].unit == null ? '' : money(lines[i].unit), a: lines[i].amount == null ? '' : money(lines[i].amount) });
  return { rows: withTextRows(rows, invoice.text_rows), total: subtotal ?? 0, totalOnly: false, simplified: list.some(it => it.is_title) || (invoice.text_rows || []).some(it => it.is_priced) };
}
