import { toCentavos } from './money.js';
import { formatInvoiceNo, isInvoicePrefix, splitInvoiceNo } from '../../shared/invoiceNumber.js';
import { FIXED_TERMS } from '../database/schema.js';
import { MAX_ITEMS, priceInvoice } from '../../shared/pricing.js';
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
  const priced = priceInvoice(raw);
  const items = raw.map((it, i) => {
    const name = t(it?.product_service), line = priced.lines[i];
    if (!name) e[`items_${i}_product_service`] = 'Required';
    else if (name.length > 200) e[`items_${i}_product_service`] = 'Must be 200 characters or fewer';
    if (line.errors.unit_cost) e[`items_${i}_unit_cost`] = line.errors.unit_cost;
    if (line.errors.quantity) e[`items_${i}_quantity`] = line.errors.quantity;
    return { product_service: name, ...(it?.is_title === true ? { is_title: true } : {}), quantity: line.qtyMilli == null ? null : line.qtyMilli / 1000, unit_cost_centavos: line.unit, amount_centavos: line.amount };
  });
  if (b.items == null && e.items_0_unit_cost) e.amount = 'Valid amount required (max 2 decimals)';
  return { items, amount: priced.ok ? priced.subtotal : null };
}

// Supplemental invoice-sheet text is deliberately independent of products and pricing.
// Omitted text_rows from older clients preserves previously saved text on edits.
function cleanTextRows(body, errors, itemCount, existing = []) {
  const omitted = body.text_rows === undefined;
  const raw = omitted ? existing : body.text_rows;
  if (!Array.isArray(raw)) { errors.text_rows = 'Invalid description rows'; return []; }
  if (raw.length > 50) { errors.text_rows = 'At most 50 description rows per invoice'; return []; }
  return raw.map((row, i) => {
    const text = typeof row?.text === 'string' ? row.text.trim() : '';
    const after = Number(row?.after_item);
    if (!text) errors[`text_rows_${i}_text`] = 'Description text is required';
    else if (text.length > 2000) errors[`text_rows_${i}_text`] = 'Must be 2000 characters or fewer';
    if (!Number.isInteger(after) || after < 0 || (!omitted && after > itemCount)) {
      errors[`text_rows_${i}_after_item`] = 'Choose a valid position';
    }
    const is_priced = row?.is_priced === true;
    return { text, after_item: omitted ? Math.min(Math.max(after || 0, 0), itemCount) : after,
      is_priced, ...(is_priced ? { quantity: row.quantity, unit_cost: row.unit_cost } : {}) };
  });
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

// Without an explicit invoice_no, a new invoice is numbered automatically and an edit retains the saved number.
// The user can override its numeric part, but the SI/SVI type is fixed on edits. Terms remain fixed at 30-days.
// ctx.existing: the saved invoice on update (also supplies client details when omitted).
export function validateInvoice(b = {}, ctx = {}) {
  const e = {}, t = (x) => (typeof x === 'string' ? x.trim() : '');
  const v = {
    date_issued: t(b.date_issued), invoice_no: '', invoice_prefix: '', cr_no: t(b.cr_no) || null,
    client_name: t(b.client_name), product_service: '', due_date: null,
    payment_status: b.payment_status, delivery_date: t(b.delivery_date) || null, remarks: t(b.remarks) || null,
  };
  if (!dateOk(v.date_issued)) e.date_issued = 'Valid date required';
  v.terms = FIXED_TERMS;
  if (ctx.existingInvoiceNo) {
    v.invoice_no = ctx.existingInvoiceNo;
    const existingPrefix = splitInvoiceNo(ctx.existingInvoiceNo).prefix;
    if (isInvoicePrefix(existingPrefix)) v.invoice_prefix = existingPrefix;
  } else if (isInvoicePrefix(b.invoice_prefix)) v.invoice_prefix = b.invoice_prefix.trim().toUpperCase();
  else e.invoice_prefix = 'Choose SI or SVI';

  // Omitted invoice_no preserves automatic allocation on create, or the existing value on edit.
  // A user-entered blank/invalid number must fail rather than silently switching back to automatic.
  if (b.invoice_no !== undefined && b.invoice_no !== null) {
    const match = /^(SI|SVI)\s*-\s*(\d+)$/i.exec(t(b.invoice_no));
    const n = match ? Number(match[2]) : NaN;
    if (!match || !Number.isSafeInteger(n) || n <= 0) {
      e.invoice_no = 'Use a positive whole number (for example, SI - 0025)';
    } else if (!v.invoice_prefix || match[1].toUpperCase() !== v.invoice_prefix) {
      e.invoice_no = ctx.existingInvoiceNo ? 'Invoice type cannot be changed' : 'Number must match the selected invoice type';
    } else {
      v.invoice_no = formatInvoiceNo(v.invoice_prefix, n);
      v.invoice_number_changed = Boolean(ctx.existingInvoiceNo && v.invoice_no !== ctx.existingInvoiceNo);
    }
  }
  if (!v.client_name) e.client_name = 'Required';
  Object.assign(v, cleanClientDetails(b, e, ctx.existing));
  const priced = cleanItems(b, e, t);
  // Preserve legacy descriptions on unchanged line items without accepting new ones.
  // The retired field is not editable and must not be erased when an invoice is saved.
  v.items = priced.items.map((item, i) => {
    const old = ctx.existing?.items?.[i];
    return old?.product_service === item.product_service && old.description
      ? { ...item, description: old.description } : item;
  });
  v.text_rows = cleanTextRows(b, e, v.items.length, ctx.existing?.text_rows || []);
  const combined = priceInvoice(b.items == null ? [{ product_service: b.product_service, unit_cost: b.amount, quantity: 1 }] : b.items, v.text_rows);
  combined.textLines.forEach((line, i) => {
    if (!v.text_rows[i].is_priced) return;
    if (v.text_rows[i].after_item < 1) e[`text_rows_${i}_after_item`] = 'Priced descriptions must be placed under a product';
    if (line.errors.quantity) e[`text_rows_${i}_quantity`] = line.errors.quantity;
    if (line.errors.unit_cost) e[`text_rows_${i}_unit_cost`] = line.errors.unit_cost;
    v.text_rows[i] = { ...v.text_rows[i], quantity: line.qtyMilli == null ? null : line.qtyMilli / 1000,
      unit_cost_centavos: line.unit, amount_centavos: line.amount };
  });
  v.product_service = v.items.map((it) => it.product_service).filter(Boolean).join(', ');
  if (!STATUSES.includes(v.payment_status)) e.payment_status = 'Invalid status';
  const amt = combined.subtotal; // derived from the line items; a submitted `amount` is ignored when items are sent
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
