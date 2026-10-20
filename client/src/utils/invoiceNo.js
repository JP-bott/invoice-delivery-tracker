import { normalizeInvoiceNo, splitInvoiceNo } from '../../../shared/invoiceNumber.js';

export { splitInvoiceNo };

// What saving this form would store: { value } or { error }. An unchanged existing number (including older formats such as
// "SVI001" or "VI123") is kept exactly as stored (unchanged: true) so editing never renumbers a historical invoice.
export function invoiceNoFor(form) {
  const original = form.original_invoice_no;
  if (form.id && original != null) {
    const was = splitInvoiceNo(original);
    if (was.prefix === (form.invoice_prefix || '') && was.number === (form.invoice_number ?? '')) return { value: original, unchanged: true };
  }
  return normalizeInvoiceNo(form.invoice_number, form.invoice_prefix);
}
