import { MAX_ITEMS, parseQtyMilli, parseUnitCost, lineAmountCentavos } from '../../../shared/pricing.js';

// Shared helpers for invoice line items: [{ product_service, description, unit_cost, quantity }].
export { MAX_ITEMS };
export const blankItem = () => ({ product_service: '', description: '', unit_cost: '', quantity: '1' });

// Keeps only digits and one decimal point (so no minus sign, exponent or letters), with at most `decimals` decimals.
export function sanitizeDecimal(value, decimals) {
  const [whole, ...rest] = String(value ?? '').replace(/[^\d.,]/g, '').replace(/,/g, '').split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, decimals)}` : whole;
}

// An invoice saved before unit costs existed has no stored unit cost for its item. For a single item, offer the stored
// amount / quantity as the unit cost only when it reproduces that amount exactly; otherwise leave it blank to be entered.
export function deriveUnitCost(totalPesos, qty) {
  const total = Math.round(Number(totalPesos) * 100), q = parseQtyMilli(qty);
  if (!Number.isFinite(total) || q == null) return '';
  const unit = Math.round((total * 1000) / q);
  return parseUnitCost(unit / 100) != null && lineAmountCentavos(unit, q) === total ? (unit / 100).toFixed(2) : '';
}

export const parseQty = (value) => { const n = parseFloat(String(value ?? '').replace(/,/g, '')); return Number.isFinite(n) && n > 0 ? n : 0; };
export const formatQty = (value) => { const n = parseQty(value); return n ? n.toLocaleString('en-PH', { maximumFractionDigits: 3 }) : ''; };

// Items of an invoice or form. Falls back to the single product_service (quantity 1) for older records.
export function itemsOf(invoice = {}) {
  const list = (Array.isArray(invoice.items) ? invoice.items : [])
    .map((it) => ({ name: String(it?.product_service ?? '').trim(), qty: parseQty(it?.quantity) }))
    .filter((it) => it.name);
  if (list.length) return list;
  return invoice.product_service ? [{ name: String(invoice.product_service), qty: 1 }] : [];
}

// One-line text for tables: "Cement × 10, IT Services × 2" (a lone quantity of 1 shows just the name).
export function itemsSummary(invoice) {
  const items = itemsOf(invoice);
  if (items.length === 1 && items[0].qty === 1) return items[0].name;
  return items.map((it) => `${it.name} × ${formatQty(it.qty) || '—'}`).join(', ');
}
