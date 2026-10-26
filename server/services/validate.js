import { toCentavos } from './money.js';
import { isInvoicePrefix } from '../../shared/invoiceNumber.js';
import { FIXED_TERMS } from '../database/schema.js';
import { MAX_ITEMS, priceItems } from '../../shared/pricing.js';
import { dueDateFromDelivery } from '../../shared/dueDate.js';
export const STATUSES = ['Pending', 'Partially Paid', 'Paid', 'Cancelled'];
export const dateOk = (s) => dueDateFromDelivery(s) !== null;

export { MAX_ITEMS };

// Line items: [{ product_service, unit_cost, quantity }]. Each line amount is Unit Cost x Quantity and the invoice amount is
// the sum of the line amounts (shared/pricing.js), so it is always derived and never taken from the request.
// Older clients that send only product_service + amount are read as one item, quantity 1, with that amount as its unit cost.
// Errors are keyed items_<index>_product_service / items_<index>_unit_cost / items_<index>_quantity.
function cleanItems(b, e, t) {
  let raw = b.items;
  if (raw == null) raw = t(b.product_service) ? [{ product_service: b.product_service, quantity: 1, unit_cost: b.amount ?? '' }] : [];
  if (!Array.isArray(raw) || !raw.length) { e.product_service = 'Required'; return { items: [], amount: null }; }
  if (raw.length > MAX_ITEMS) { e.product_service = `At most ${MAX_ITEMS} items per invoice`; return { items: [], amount: null }; }
  const priced = priceItems(raw.map((it) => ({ unit_cost: it?.unit_cost, quantity: it?.quantity })));
  const items = raw.map((it, i) => {
    const name = t(it?.product_service), line = priced.lines[i];
    if (!name) e[`items_${i}_product_service`] = 'Required';
    else if (name.length > 200) e[`items_${i}_product_service`] = 'Must be 200 characters or fewer';
    if (line.errors.unit_cost) e[`items_${i}_unit_cost`] = line.errors.unit_cost;
    if (line.errors.quantity) e[`items_${i}_quantity`] = line.errors.quantity;
    return { product_service: name, quantity: line.qtyMilli == null ? null : line.qtyMilli / 1000, unit_cost_centavos: line.unit, amount_centavos: line.amount };
  });
  if (b.items == null && e.items_0_unit_cost) e.amount = 'Valid amount required (max 2 decimals)';
  return { items, amount: priced.ok ? priced.subtotal : null };
}

// Client TIN / address are a copy of the registered client's details taken when the invoice is saved. A request that leaves the
// key out (an older client, a script) keeps what the invoice already has; sending an empty string clears it.
export const CLIENT_TIN_MAX = 30, CLIENT_ADDRESS_MAX = 300;
function cleanClientDetails(b, e, existing) {
  const one = (key, max, label) => {
    if (b[key] === undefined) return existing?.[key] ?? null;
    const text = typeof b[key] === 'string' ? b[key].replace(/\s+/g, ' ').trim() : '';
    if (text.length > max) e[key] = `${label} must be ${max} characters or fewer`;
    return text || null;
  };
  return { client_tin: one('client_tin', CLIENT_TIN_MAX, 'TIN'), client_address: one('client_address', CLIENT_ADDRESS_MAX, 'Address') };
}

// Invoice numbers and terms are never taken from the request. A new invoice only chooses its type (b.invoice_prefix: SI or SVI);
// the number itself is assigned by the server when it is saved (invoiceService.create). An existing invoice keeps its stored number
// (ctx.existingInvoiceNo, including older formats like "VI00123") whatever the request says. Terms are always 30-days.
// ctx.existing: the stored invoice on update (supplies the client TIN/address when the request omits them).
export function validateInvoice(b = {}, ctx = {}) {
  const e = {}, t = (x) => (typeof x === 'string' ? x.trim() : '');
  const v = {
    date_issued: t(b.date_issued), invoice_no: '', invoice_prefix: '', cr_no: t(b.cr_no) || null,
    client_name: t(b.client_name), product_service: '', due_date: null,
    payment_status: b.payment_status, delivery_date: t(b.delivery_date) || null, remarks: t(b.remarks) || null,
  };
  if (!dateOk(v.date_issued)) e.date_issued = 'Valid date required';
  v.terms = FIXED_TERMS;
  if (ctx.existingInvoiceNo) v.invoice_no = ctx.existingInvoiceNo;
  else if (isInvoicePrefix(b.invoice_prefix)) v.invoice_prefix = b.invoice_prefix.trim().toUpperCase();
  else e.invoice_prefix = 'Choose SI or SVI';
  if (!v.client_name) e.client_name = 'Required';
  Object.assign(v, cleanClientDetails(b, e, ctx.existing));
  const priced = cleanItems(b, e, t);
  v.items = priced.items;
  v.product_service = v.items.map((it) => it.product_service).filter(Boolean).join(', ');
  if (!STATUSES.includes(v.payment_status)) e.payment_status = 'Invalid status';
  const amt = priced.amount; // derived from the line items; a submitted `amount` is ignored when items are sent
  let paid;
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
  // Ignore any user-supplied due date. Delivery sets the contractual deadline.
  v.due_date = dueDateFromDelivery(v.delivery_date);
  v.amount_centavos = amt; v.amount_paid_centavos = paid;
  return { errors: e, value: v };
}
