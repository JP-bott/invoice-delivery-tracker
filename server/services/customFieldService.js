// Custom invoice fields: definitions (CRUD, archive/restore) and per-invoice value validation.
// Same shape as productService: small functions, HttpError for expected failures, ISO timestamps.
// Values are stored as text in invoice_custom_values, one row per (invoice, field); an empty value is
// stored as no row. Deleting a field archives it (values are kept); only an archived field can be purged.
import { getDb } from '../database/db.js';
import { HttpError } from '../http.js';
import { dateOk } from './validate.js';

export const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'dropdown', 'checkbox', 'email', 'url'];
export const MAX_ACTIVE_FIELDS = 30;
export const MAX_OPTIONS = 100;
const MAX = { label: 60, option: 100, text: 500, textarea: 2000, email: 254, url: 2000 };
const TEXTUAL = new Set(['text', 'textarea']); // may switch between each other even when values exist

const clean = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const bad = (message) => new HttpError(422, message, 'VALIDATION_ERROR');
const parseOptions = (json) => { try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch { return []; } };

const SELECT = `SELECT f.*, (SELECT COUNT(*) FROM invoice_custom_values v WHERE v.field_id = f.id) AS value_count FROM invoice_fields f`;
const toApi = (r) => ({
  id: Number(r.id), label: r.label, input_type: r.input_type, required: Boolean(Number(r.required)),
  show_in_table: Boolean(Number(r.show_in_table)), options: parseOptions(r.options), sort_order: Number(r.sort_order),
  archived: r.archived_at != null, archived_at: r.archived_at, value_count: Number(r.value_count ?? 0),
  created_at: r.created_at, updated_at: r.updated_at,
});

const byId = async (id, db = getDb()) => (await db.execute({ sql: `${SELECT} WHERE f.id = ?`, args: [id] })).rows[0];

export async function list({ includeArchived = false } = {}) {
  const where = includeArchived ? '' : 'WHERE f.archived_at IS NULL';
  const rows = (await getDb().execute(`${SELECT} ${where} ORDER BY (f.archived_at IS NOT NULL), f.sort_order, f.id`)).rows;
  return rows.map(toApi);
}

// Active fields only: what forms, validation, search and filters work from.
export async function activeFields() { return list(); }

// Existing stored values of one invoice, keyed by field id (string).
export async function valuesFor(invoiceId) {
  const rows = (await getDb().execute({ sql: 'SELECT field_id, value FROM invoice_custom_values WHERE invoice_id = ?', args: [invoiceId] })).rows;
  return Object.fromEntries(rows.map((r) => [String(r.field_id), r.value]));
}

function cleanDefinition(body = {}) {
  const label = clean(body.label);
  if (!label) throw bad('Field label is required');
  if (label.length > MAX.label) throw bad(`Field label must be ${MAX.label} characters or fewer`);
  if (!FIELD_TYPES.includes(body.input_type)) throw bad('Choose a valid input type');
  let options = [];
  if (body.input_type === 'dropdown') {
    if (!Array.isArray(body.options)) throw bad('Add at least one dropdown option');
    const seen = new Set();
    for (const raw of body.options) {
      const option = clean(typeof raw === 'string' ? raw : raw?.name ?? raw?.label);
      if (!option) throw bad('Dropdown options cannot be empty');
      if (option.length > MAX.option) throw bad(`Dropdown options must be ${MAX.option} characters or fewer`);
      if (seen.has(option.toLowerCase())) throw bad(`Duplicate dropdown option: ${option}`);
      seen.add(option.toLowerCase()); options.push(option);
    }
    if (!options.length) throw bad('Add at least one dropdown option');
    if (options.length > MAX_OPTIONS) throw bad(`A dropdown can have at most ${MAX_OPTIONS} options`);
  }
  return { label, input_type: body.input_type, required: body.required ? 1 : 0, show_in_table: body.show_in_table === false ? 0 : 1, options };
}

async function assertLabelFree(label, exceptId = null) {
  const row = (await getDb().execute({ sql: 'SELECT id FROM invoice_fields WHERE label = ? COLLATE NOCASE AND archived_at IS NULL AND id <> ?', args: [label, exceptId ?? -1] })).rows[0];
  if (row) throw new HttpError(409, 'A field with this label already exists', 'DUPLICATE');
}
const activeCount = async () => Number((await getDb().execute('SELECT COUNT(*) c FROM invoice_fields WHERE archived_at IS NULL')).rows[0].c);
const nextOrder = async () => Number((await getDb().execute('SELECT COALESCE(MAX(sort_order), 0) + 1 n FROM invoice_fields')).rows[0].n);
const assertRoom = async () => { if ((await activeCount()) >= MAX_ACTIVE_FIELDS) throw bad(`You can have at most ${MAX_ACTIVE_FIELDS} active fields`); };

export async function create(body = {}) {
  const d = cleanDefinition(body);
  await assertLabelFree(d.label);
  await assertRoom();
  const now = new Date().toISOString();
  const r = await getDb().execute({
    sql: 'INSERT INTO invoice_fields (label, input_type, required, show_in_table, options, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
    args: [d.label, d.input_type, d.required, d.show_in_table, JSON.stringify(d.options), await nextOrder(), now, now],
  });
  return toApi(await byId(Number(r.lastInsertRowid)));
}

export async function update(id, body = {}) {
  if (id == null) return null;
  const current = await byId(id);
  if (!current || current.archived_at != null) return null; // archived fields are restored first, never edited
  const d = cleanDefinition(body);
  const count = Number(current.value_count);
  if (d.input_type !== current.input_type && count > 0 && !(TEXTUAL.has(d.input_type) && TEXTUAL.has(current.input_type))) {
    throw bad(`The input type can't change because ${count} invoice${count === 1 ? ' has' : 's have'} a value saved in this field. Archive it and add a new field instead.`);
  }
  await assertLabelFree(d.label, id);
  await getDb().execute({
    sql: 'UPDATE invoice_fields SET label=?, input_type=?, required=?, show_in_table=?, options=?, updated_at=? WHERE id=?',
    args: [d.label, d.input_type, d.required, d.show_in_table, JSON.stringify(d.options), new Date().toISOString(), id],
  });
  return toApi(await byId(id));
}

// "Delete" from the user's point of view: hidden everywhere, stored values kept so it can be restored.
export async function archive(id) {
  if (id == null) return null;
  const r = await getDb().execute({ sql: 'UPDATE invoice_fields SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL', args: [new Date().toISOString(), new Date().toISOString(), id] });
  if (!r.rowsAffected) return null;
  return toApi(await byId(id));
}

export async function restore(id) {
  if (id == null) return null;
  const current = await byId(id);
  if (!current) return null;
  if (current.archived_at == null) return toApi(current);
  await assertLabelFree(current.label, id);
  await assertRoom();
  await getDb().execute({ sql: 'UPDATE invoice_fields SET archived_at = NULL, sort_order = ?, updated_at = ? WHERE id = ?', args: [await nextOrder(), new Date().toISOString(), id] });
  return toApi(await byId(id));
}

// Irreversible: removes the archived field and every value saved in it.
export async function purge(id) {
  if (id == null) return false;
  const current = await byId(id);
  if (!current) return false;
  if (current.archived_at == null) throw new HttpError(409, 'Delete the field first, then remove it permanently from the archived list', 'CONFLICT');
  await getDb().batch([
    { sql: 'DELETE FROM invoice_custom_values WHERE field_id = ?', args: [id] },
    { sql: 'DELETE FROM invoice_fields WHERE id = ? AND archived_at IS NOT NULL', args: [id] },
  ], 'write');
  return true;
}

// ids = desired order of (some of) the active fields; fields not listed keep their relative order after them.
export async function reorder(ids) {
  if (!Array.isArray(ids) || ids.some((n) => !Number.isInteger(n))) throw bad('ids must be a list of field ids');
  const active = await activeFields();
  const known = new Set(active.map((f) => f.id));
  const first = [...new Set(ids)].filter((n) => known.has(n));
  const order = [...first, ...active.map((f) => f.id).filter((n) => !first.includes(n))];
  await getDb().batch(order.map((fieldId, i) => ({ sql: 'UPDATE invoice_fields SET sort_order = ? WHERE id = ?', args: [i + 1, fieldId] })), 'write');
  return list();
}

// ---- invoice values ----

const TRUE = new Set(['true', '1', 'on', 'yes']);
const FALSE = new Set(['', 'false', '0', 'off', 'no']);

// Returns { value } with the canonical stored string ('' = empty) or { error }.
function normalize(field, raw, existing) {
  const type = field.input_type;
  if (type === 'checkbox') {
    const s = typeof raw === 'string' ? raw.trim().toLowerCase() : raw == null ? '' : String(raw).toLowerCase();
    if (TRUE.has(s)) return { value: 'true' };
    if (FALSE.has(s)) return { value: '' };
    return { error: 'Invalid value' };
  }
  if (raw != null && !['string', 'number', 'boolean'].includes(typeof raw)) return { error: 'Invalid value' };
  const s = raw == null ? '' : String(raw).trim();
  if (!s) return { value: '' };
  switch (type) {
    case 'text': return s.length > MAX.text ? { error: `Must be ${MAX.text} characters or fewer` } : { value: s };
    case 'textarea': return s.length > MAX.textarea ? { error: `Must be ${MAX.textarea} characters or fewer` } : { value: String(raw).trim() };
    case 'number': {
      const plain = s.replace(/,/g, '');
      if (!/^-?\d+(\.\d+)?$/.test(plain) || !Number.isFinite(Number(plain)) || Math.abs(Number(plain)) >= 1e15) return { error: 'Enter a valid number' };
      return { value: String(Number(plain)) };
    }
    case 'date': return dateOk(s) ? { value: s } : { error: 'Enter a valid date' };
    case 'email': return s.length <= MAX.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? { value: s } : { error: 'Enter a valid email address' };
    case 'url': {
      try { const u = new URL(s); if (!['http:', 'https:'].includes(u.protocol) || s.length > MAX.url) throw new Error(); return { value: s }; } catch { return { error: 'Enter a valid http(s) link' }; }
    }
    case 'dropdown': {
      const match = field.options.find((o) => o === s) ?? field.options.find((o) => o.toLowerCase() === s.toLowerCase());
      if (match) return { value: match };
      if (existing === s) return { value: s }; // a value kept from before the option was removed may stay as it is
      return { error: 'Choose one of the listed options' };
    }
    default: return { error: 'Invalid value' };
  }
}

// input: body.custom_fields; fields: active field definitions; existing: this invoice's stored values by field id.
// A field whose key is absent from the payload is left exactly as stored (old browser tabs cannot wipe data).
// Keys for unknown or archived fields are ignored. Returns { errors, writes: [{ field_id, value|null }] }.
export function validateValues(input, fields, existing = {}) {
  const errors = {}, writes = [];
  if (input != null && (typeof input !== 'object' || Array.isArray(input))) return { errors: { custom_fields: 'Must be an object' }, writes };
  for (const field of fields) {
    const key = String(field.id), name = `cf_${field.id}`;
    const sent = input != null && Object.hasOwn(input, key);
    if (!sent) {
      if (field.required && !existing[key]) errors[name] = 'Required';
      continue;
    }
    const r = normalize(field, input[key], existing[key]);
    if (r.error) { errors[name] = r.error; continue; }
    if (field.required && !r.value) { errors[name] = field.input_type === 'checkbox' ? 'Must be checked' : 'Required'; continue; }
    writes.push({ field_id: field.id, value: r.value || null });
  }
  return { errors, writes };
}

// SQL that stores validated writes. The invoice is addressed by a sub-select so it can run in the same
// atomic batch as the invoice insert/update, and never creates a value row for a missing invoice.
export function valueStatements(writes, invoiceRef) {
  return writes.map((w) => (w.value == null
    ? { sql: `DELETE FROM invoice_custom_values WHERE field_id = ? AND invoice_id = ${invoiceRef.sql}`, args: [w.field_id, ...invoiceRef.args] }
    : { sql: `INSERT INTO invoice_custom_values (invoice_id, field_id, value) SELECT id, ?, ? FROM invoices WHERE ${invoiceRef.where} ON CONFLICT(invoice_id, field_id) DO UPDATE SET value = excluded.value`, args: [w.field_id, w.value, ...invoiceRef.args] }));
}
export const refById = (id) => ({ where: 'id = ?', sql: '?', args: [id] });
export const refByNumber = (invoiceNo) => ({ where: 'invoice_no = ?', sql: '(SELECT id FROM invoices WHERE invoice_no = ?)', args: [invoiceNo] });
