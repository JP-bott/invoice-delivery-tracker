import { formatQty } from './items.js';
import { priceItems } from '../../../shared/pricing.js';

const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isNaN(n) ? 0 : n; };
const cents = (n) => Math.round(n * 100);
export const money = (c) => (c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// One sheet row per product/service (QTY, description, unit cost, amount) and the subtotal, which is the saved invoice amount.
// Priced items: each amount is Unit Cost x Quantity and the subtotal is their sum. Invoices saved before unit costs existed carry
// no unit costs; they show their stored amount (a single item also shows its derived unit cost, several items show the total only).
export function sheetPricing(invoice) {
  let list = (Array.isArray(invoice.items) ? invoice.items : []).filter((it) => String(it?.product_service ?? '').trim());
  if (!list.length && invoice.product_service) list = [{ product_service: invoice.product_service, quantity: 1, unit_cost: invoice.amount }];
  const itemDetail = (it) => {
    const description = String(it.description ?? '').trim();
    return description ? { description } : {};
  };
  const hasUnit = list.some((it) => String(it.unit_cost ?? '').trim() !== '');
  const storedTotal = cents(num(invoice.amount));
  if (!hasUnit && storedTotal) {
    const single = list.length === 1, qty = single ? num(list[0].quantity) : 0;
    const rows = list.map((it) => ({ q: formatQty(it.quantity), d: String(it.product_service).trim(), ...itemDetail(it), u: single && qty > 0 ? money(Math.round(storedTotal / qty)) : '', a: single ? money(storedTotal) : '' }));
    return { rows, total: storedTotal, totalOnly: list.length > 1 };
  }
  const { lines } = priceItems(list.map((it) => ({ unit_cost: it.unit_cost, quantity: it.quantity })));
  const rows = list.map((it, i) => ({ q: formatQty(it.quantity), d: String(it.product_service).trim(), ...itemDetail(it), u: lines[i].unit == null ? '' : money(lines[i].unit), a: lines[i].amount == null ? '' : money(lines[i].amount) }));
  return { rows, total: lines.reduce((sum, l) => sum + (l.amount ?? 0), 0), totalOnly: false };
}
