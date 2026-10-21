export class HttpError extends Error {
  constructor(status, message, code, fields) { super(message); this.status = status; this.code = code; this.fields = fields; }
}
const DUP = { error: { code: 'DUPLICATE', message: 'Value already exists' } };

// Maps any thrown error to { status, body }.
export function errorResponse(e) {
  if (/UNIQUE/i.test(e.message)) {
    const invoice = /invoice_no/i.test(e.message);
    return invoice
      ? { status: 409, body: { error: { code: 'DUPLICATE', message: 'Invoice number already exists', fields: { invoice_no: 'Invoice number already exists' } } } }
      : { status: 409, body: DUP };
  }
  const status = e.status || 500;
  const code = e.code && status !== 500 ? e.code : status === 400 ? 'BAD_REQUEST' : 'SERVER_ERROR';
  if (status === 500) console.error(e);
  return { status, body: { error: { code, message: status === 500 ? 'Internal error' : e.message, ...(status !== 500 && e.fields && { fields: e.fields }) } } };
}
export const fail = (status, code, message, fields) => ({ status, body: { error: { code, message, ...(fields && { fields }) } } });
export const invalid = (fields) => fail(422, 'VALIDATION_ERROR', 'Validation failed', fields);
export const notFound = (message = 'Invoice not found') => fail(404, 'NOT_FOUND', message);
