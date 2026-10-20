// SVI/SI invoice number format, shared by the form (live hint) and the API (authoritative).
// Canonical form: "SVI - 001", "SVI - 2026-001", "SI - 001". Pure JS, no imports.
export const INVOICE_PREFIXES = ['SVI', 'SI'];
const LEAD = /^(SVI|SI)(?![A-Za-z])\s*[-–—]?\s*/i; // a prefix token; "SIGMA-1" is not one
const REST = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
export const MAX_INVOICE_REST = 40;

// normalizeInvoiceNo(typed, selectedPrefix?) -> { value } | { error }
//  - strips repeated leading prefixes ("SI - SI - 001" -> "SI - 001"), trims and collapses whitespace
//  - applies selectedPrefix (or the typed prefix) and joins as `${prefix} - ${number}`
export function normalizeInvoiceNo(typed, selected) {
  if (typeof typed !== 'string') return { error: 'Required' };
  const chosen = typeof selected === 'string' && selected.trim() ? selected.trim().toUpperCase() : '';
  if (chosen && !INVOICE_PREFIXES.includes(chosen)) return { error: 'Prefix must be SVI or SI' };
  let s = typed.trim().replace(/\s+/g, ' '), typedPrefix = '', m;
  while ((m = LEAD.exec(s))) {
    const p = m[1].toUpperCase();
    if (typedPrefix && p !== typedPrefix) return { error: 'Use only one prefix (SVI or SI)' };
    typedPrefix = p; s = s.slice(m[0].length);
  }
  const rest = s.replace(/\s*-\s*/g, '-').replace(/^[-–—\s]+|[-–—\s]+$/g, '');
  if (!rest) return { error: typedPrefix || chosen ? 'Enter the invoice number after the prefix' : 'Required' };
  if (rest.length > MAX_INVOICE_REST) return { error: `Number must be ${MAX_INVOICE_REST} characters or fewer` };
  if (!REST.test(rest)) return { error: 'Use letters, numbers and - . / _ only' };
  if (chosen && typedPrefix && chosen !== typedPrefix) return { error: `Starts with ${typedPrefix} but ${chosen} is selected` };
  const prefix = chosen || typedPrefix;
  if (!prefix) return { error: 'Start with SVI or SI, or choose a prefix' };
  return { value: `${prefix} - ${rest}` };
}

// Splits a stored number into the form's prefix + number parts. Legacy values ("SVI001", "VI123") still split.
export function splitInvoiceNo(invoiceNo = '') {
  const s = String(invoiceNo);
  const m = s.match(/^(SVI|SI|VI)(?![A-Za-z])\s*-?\s*(.*)$/i);
  return m ? { prefix: m[1].toUpperCase(), number: m[2] } : { prefix: '', number: s };
}
