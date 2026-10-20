import { toCentavos } from './money.js';
export const STATUSES = ['Pending', 'Partially Paid', 'Paid', 'Cancelled'];
export const dateOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

export const MAX_ITEMS = 30;
const MAX_QTY = 1_000_000;
const QTY = /^\d+(\.\d{1,3})?$/;

// Line items: [{ product_service, quantity }]. A request with only product_service (older clients) is one item, quantity 1.
// Errors are keyed items_<index>_product_service / items_<index>_quantity.
function cleanItems(b, e, t) {
  let raw = b.items;
  if (raw == null) raw = t(b.product_service) ? [{ product_service: b.product_service, quantity: 1 }] : [];
  if (!Array.isArray(raw) || !raw.length) { e.product_service = 'Required'; return []; }
  if (raw.length > MAX_ITEMS) { e.product_service = `At most ${MAX_ITEMS} items per invoice`; return []; }
  return raw.map((it, i) => {
    const name = t(it?.product_service), q = String(it?.quantity ?? '').replace(/,/g, '').trim();
    if (!name) e[`items_${i}_product_service`] = 'Required';
    else if (name.length > 200) e[`items_${i}_product_service`] = 'Must be 200 characters or fewer';
    if (!QTY.test(q) || !(Number(q) > 0)) e[`items_${i}_quantity`] = 'Enter a quantity above 0 (max 3 decimals)';
    else if (Number(q) > MAX_QTY) e[`items_${i}_quantity`] = 'Too large';
    return { product_service: name, quantity: Number(q) };
  });
}

export function validateInvoice(b = {}) {
  const e = {}, t = (x) => (typeof x === 'string' ? x.trim() : '');
  const v = {
    date_issued: t(b.date_issued), invoice_no: t(b.invoice_no), cr_no: t(b.cr_no) || null,
    client_name: t(b.client_name), product_service: '', due_date: t(b.due_date) || null,
    payment_status: b.payment_status, delivery_date: t(b.delivery_date) || null, remarks: t(b.remarks) || null,
  };
  if (!dateOk(v.date_issued)) e.date_issued = 'Valid date required';
  if (!v.invoice_no) e.invoice_no = 'Required';
  if (!v.client_name) e.client_name = 'Required';
  v.items = cleanItems(b, e, t);
  v.product_service = v.items.map((it) => it.product_service).filter(Boolean).join(', ');
  if (v.due_date && !dateOk(v.due_date)) e.due_date = 'Invalid date';
  else if (v.due_date && v.due_date < v.date_issued) e.due_date = 'Cannot be earlier than Date Issued';
  if (!STATUSES.includes(v.payment_status)) e.payment_status = 'Invalid status';
  let amt, paid;
  try { amt = toCentavos(b.amount ?? ''); } catch { e.amount = 'Valid amount required (max 2 decimals)'; }
  try { paid = toCentavos(b.amount_paid ?? 0); } catch { e.amount_paid = 'Valid amount required (max 2 decimals)'; }
  if (amt != null && paid != null) {
    const s = v.payment_status;
    if (paid > amt) e.amount_paid = 'Cannot exceed amount';
    else if (s === 'Pending' && paid !== 0) e.amount_paid = 'Must be 0 when Pending';
    else if (s === 'Partially Paid' && !(paid > 0 && paid < amt)) e.amount_paid = 'Must be between 0 and amount when Partially Paid';
    else if (s === 'Paid' && paid !== amt) e.amount_paid = 'Must equal amount when Paid';
  }
  if (v.delivery_date) {
    if (!dateOk(v.delivery_date)) e.delivery_date = 'Invalid date';
    else if (v.delivery_date < v.date_issued) e.delivery_date = 'Cannot be earlier than Date Issued';
  }
  v.amount_centavos = amt; v.amount_paid_centavos = paid;
  return { errors: e, value: v };
}
