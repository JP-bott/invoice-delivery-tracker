// Shared helpers for invoice line items: [{ product_service, quantity }].
export const MAX_ITEMS = 30;
export const blankItem = () => ({ product_service: '', quantity: '1' });

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
