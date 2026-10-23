// SI / SVI invoice numbers. The server is the only place a number is assigned (invoice_sequences, see invoiceService.js);
// this file holds the pure helpers shared by the API and the UI. Pure JS, no imports.
// Stored form: "SI - 0006", "SVI - 0013" (zero-padded to at least 4 digits, growing past 9999). Preview/print shows "No. 0006".
export const INVOICE_PREFIXES = ['SVI', 'SI'];
export const MIN_DIGITS = 4;
export const isInvoicePrefix = (p) => typeof p === 'string' && INVOICE_PREFIXES.includes(p.trim().toUpperCase());

// "SI" + 6 -> "SI - 0006".
export const formatInvoiceNo = (prefix, n) => `${String(prefix).trim().toUpperCase()} - ${String(n).padStart(MIN_DIGITS, '0')}`;

// Splits a stored number into prefix + number text. Older formats ("SVI001", "SVI- 0726", "VI123") still split.
export function splitInvoiceNo(invoiceNo = '') {
  const s = String(invoiceNo);
  const m = s.match(/^(SVI|SI|VI)(?![A-Za-z])\s*-?\s*(.*)$/i);
  return m ? { prefix: m[1].toUpperCase(), number: m[2] } : { prefix: '', number: s };
}

// The integer a stored SI/SVI number carries, or null when it is not a plain SI/SVI + digits number (e.g. "OLD-1", "SI - 2026-001").
export function sequenceOf(invoiceNo, prefix) {
  const { prefix: p, number } = splitInvoiceNo(invoiceNo);
  if (p !== String(prefix).toUpperCase() || !/^\d+$/.test(number)) return null;
  const n = Number(number);
  return Number.isSafeInteger(n) ? n : null;
}

// Use the stored invoice number for saved invoices; use the selected type while an unsaved invoice is previewed.
export function sheetInvoiceType(invoiceNo, invoicePrefix = '') {
  const storedPrefix = splitInvoiceNo(invoiceNo).prefix;
  const prefix = ['SI', 'SVI'].includes(storedPrefix) ? storedPrefix : String(invoicePrefix).trim().toUpperCase();
  return prefix === 'SI' ? 'SALES' : 'SERVICE';
}

// What the invoice sheet shows in its number box: "No. 0006" (the type stays in the stored value only).
export function sheetInvoiceNo(invoiceNo) {
  const { number } = splitInvoiceNo(invoiceNo);
  return number ? `No. ${number}` : '';
}
