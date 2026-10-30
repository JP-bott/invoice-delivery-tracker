import { parseUnitCost, priceItems } from '../../../shared/pricing.js';
import { valueOf } from './customFields.js';

// All steps share the existing invoice form model. Nothing is saved until Review.
export const INVOICE_STEPS = [
  { id: 'details', label: 'Invoice', title: 'Invoice details', description: 'Set the invoice date, number, and transaction reference.' },
  { id: 'client', label: 'Client', title: 'Client & delivery', description: 'Choose the client and set the delivery information.' },
  { id: 'items', label: 'Items', title: 'Products & services', description: 'Add billed items and optional supporting text rows.' },
  { id: 'payment', label: 'Payment', title: 'Payment details', description: 'Review the calculated total and record the payment status.' },
  { id: 'additional', label: 'Additional', title: 'Additional details', description: 'Complete custom invoice fields and any remarks.' },
  { id: 'review', label: 'Review', title: 'Review & save', description: 'Check the invoice summary before saving.' },
];

const issue = (message, focusId) => ({ message, focusId });
const filled = (v) => String(v ?? '').trim().length > 0;
const validDate = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''))) return false;
  const time = Date.parse(v + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === v;
};

// The server remains authoritative. These checks prevent an incomplete step being skipped,
// including when a user navigates back to an already visited tab.
export function invoiceStepIssue(form, step, fields = []) {
  if (step === 0) {
    if (!validDate(form.date_issued)) return issue('Enter a valid Date Issued.', 'invoice-date_issued');
    if (!form.id && !['SI', 'SVI'].includes(form.invoice_prefix)) return issue('Choose an invoice type.', 'invoice_number');
    if (form.invoice_number_override != null) {
      const n = String(form.invoice_number_override).trim();
      if (!/^\d+$/.test(n) || !Number.isSafeInteger(Number(n)) || Number(n) <= 0) {
        return issue('Enter a valid positive invoice number or restore automatic numbering.', 'invoice_number');
      }
    }
  }
  if (step === 1) {
    if (!filled(form.client_name)) return issue('Choose or enter the client name.', 'invoice-client_name');
    if (form.delivery_date && !validDate(form.delivery_date)) return issue('Enter a valid delivery date.', 'invoice-delivery_date');
    if (form.delivery_date && validDate(form.date_issued) && form.delivery_date < form.date_issued) {
      return issue('Delivery Date cannot be before Date Issued.', 'invoice-delivery_date');
    }
  }
  if (step === 2) {
    const items = Array.isArray(form.items) ? form.items : [];
    if (!items.length) return issue('Add at least one product or service.', 'invoice-items-heading');
    const priced = priceItems(items);
    for (let i = 0; i < items.length; i++) {
      if (!filled(items[i]?.product_service)) return issue(`Select a product or service for item ${i + 1}.`, `invoice-item-${i}-product`);
      if (String(items[i].product_service).trim().length > 200) return issue('Product or service names must be 200 characters or fewer.', `invoice-item-${i}-product`);
      if (priced.lines[i]?.errors.unit_cost) return issue(`Item ${i + 1}: ${priced.lines[i].errors.unit_cost}.`, `invoice-item-${i}-unit-cost`);
      if (priced.lines[i]?.errors.quantity) return issue(`Item ${i + 1}: ${priced.lines[i].errors.quantity}.`, `invoice-item-${i}-quantity`);
    }
    const rows = Array.isArray(form.text_rows) ? form.text_rows : [];
    if (rows.length > 50) return issue('Only 50 description-only rows are allowed.', 'invoice-items-heading');
    for (let i = 0; i < rows.length; i++) {
      if (!filled(rows[i]?.text)) return issue(`Enter text for description-only row ${i + 1} or remove it.`, `invoice-text-row-${i}`);
      if (String(rows[i].text).trim().length > 2000) return issue(`Description-only row ${i + 1} is too long.`, `invoice-text-row-${i}`);
      const after = Number(rows[i]?.after_item);
      if (!Number.isInteger(after) || after < 0 || after > items.length) return issue(`Choose a valid position for description-only row ${i + 1}.`, `invoice-text-position-${i}`);
    }
  }
  if (step === 3) {
    const status = String(form.payment_status ?? '');
    if (!['Pending', 'Partially Paid', 'Paid', 'Cancelled'].includes(status)) return issue('Choose a valid payment status.', 'invoice-payment_status');
    const paid = parseUnitCost(form.amount_paid ?? '0');
    if (paid === null) return issue('Enter a valid Amount Paid (maximum 2 decimals).', 'invoice-amount_paid');
    const total = priceItems(form.items || []).subtotal;
    if (total != null) {
      if (paid > total) return issue('Amount Paid cannot exceed Invoice Amount.', 'invoice-amount_paid');
      if (status === 'Pending' && paid !== 0) return issue('Amount Paid must be zero when Pending.', 'invoice-payment_status');
      if (status === 'Partially Paid' && !(paid > 0 && paid < total)) return issue('Partially Paid requires an amount between zero and the total.', 'invoice-payment_status');
      if (status === 'Paid' && paid !== total) return issue('Paid requires Amount Paid to equal the invoice total.', 'invoice-payment_status');
    }
  }
  if (step === 4) {
    for (const field of fields) {
      const value = valueOf(field, form.custom_fields);
      if (field.required && (field.input_type === 'checkbox' ? value !== 'true' : !filled(value))) {
        return issue(`Complete required field: ${field.label}.`, `invoice-cf_${field.id}`);
      }
    }
  }
  return null;
}

export function firstInvoiceStepIssue(form, fields = []) {
  for (let step = 0; step < INVOICE_STEPS.length - 1; step++) {
    const problem = invoiceStepIssue(form, step, fields);
    if (problem) return { ...problem, step };
  }
  return null;
}

export function invoiceStepForError(key) {
  if (/^(date_issued|invoice_no|invoice_prefix|cr_no|terms)$/.test(key)) return 0;
  if (/^(client_name|client_tin|client_address|delivery_date|due_date)$/.test(key)) return 1;
  if (/^(items_|product_service|text_rows)/.test(key)) return 2;
  if (/^(payment_status|amount_paid|amount)$/.test(key)) return 3;
  if (/^(cf_|custom_fields|remarks)/.test(key)) return 4;
  return INVOICE_STEPS.length - 1;
}
