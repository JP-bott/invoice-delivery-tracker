import { getDb, highestAssigned } from '../database/db.js';
import { FIXED_TERMS } from '../database/schema.js';
import { formatInvoiceNo, sequenceOf } from '../../shared/invoiceNumber.js';
import { toPesos } from './money.js';
import { buildWhere } from './filterBuilder.js';
import { HttpError } from '../http.js';
import { activeFields, list as listFields, valueStatements, refById } from './customFieldService.js';

const SORTS = { date_issued: 'date_issued', invoice_no: 'invoice_no', cr_no: 'cr_no', client_name: 'client_name', product_service: 'product_service', due_date: 'due_date', amount: 'amount_centavos', amount_paid: 'amount_paid_centavos', payment_status: 'payment_status', delivery_date: 'delivery_date' };

export const toApi = (r) => ({
  id: Number(r.id), date_issued: r.date_issued, invoice_no: r.invoice_no, terms: r.terms ?? FIXED_TERMS, cr_no: r.cr_no,
  client_name: r.client_name, client_tin: r.client_tin ?? null, client_address: r.client_address ?? null,
  product_service: r.product_service, due_date: r.due_date,
  amount: toPesos(r.amount_centavos), amount_paid: toPesos(r.amount_paid_centavos),
  outstanding: toPesos(Math.max(r.amount_centavos - r.amount_paid_centavos, 0)),
  payment_status: r.payment_status, delivery_date: r.delivery_date,
  deliveryStatus: r.delivery_date ? 'Delivered' : 'Pending', remarks: r.remarks,
});

export async function list(q) {
  const page = Math.max(parseInt(q.page) || 1, 1);
  const pageSize = [10, 25, 50, 100].includes(parseInt(q.pageSize)) ? parseInt(q.pageSize) : 10;
  if (q.sortBy && !Object.hasOwn(SORTS, q.sortBy)) throw new HttpError(400, 'Invalid sortBy');
  const col = (q.sortBy && SORTS[q.sortBy]) || 'date_issued', dir = q.sortDir === 'asc' ? 'ASC' : 'DESC';
  const fields = await activeFields();
  const { where, args } = buildWhere(q, { customFields: fields });
  const db = getDb();
  const total = Number((await db.execute({ sql: `SELECT COUNT(*) c FROM invoices ${where}`, args })).rows[0].c);
  const rows = (await db.execute({ sql: `SELECT * FROM invoices ${where} ORDER BY ${col} ${dir}, id DESC LIMIT ? OFFSET ?`, args: [...args, pageSize, (page - 1) * pageSize] })).rows;
  return { data: await withItems(await withCustom(rows.map(toApi), fields)), page, pageSize, total };
}
// Unfiltered, keyset-paginated snapshot boundary for Excel export.
// Includes cancelled invoices, registered custom fields (including archived values),
// every line item, and payment timeline history. No page-size/visible-table restriction.
// IDs allocated after the first request are excluded by maxId. If existing rows are
// deleted mid-export, the client will reject the changing total instead of saving a partial file.
const EXPORT_LIMIT = 100;
const exportInteger = (raw, name) => {
  if (raw === undefined || raw === null || raw === '') return null;
  if (!/^\d+$/.test(String(raw)) || !Number.isSafeInteger(Number(raw))) {
    throw new HttpError(400, `Invalid ${name}`);
  }
  return Number(raw);
};
async function withPaymentHistory(invoiceRows) {
  if (!invoiceRows.length) return invoiceRows;
  const ids = invoiceRows.map((x) => x.id);
  const rows = (await getDb().execute({
    sql: `SELECT id, invoice_id, stage_id, stage_label, stage_tone, note, created_at, updated_at
      FROM payment_timeline_events WHERE invoice_id IN (${ids.map(() => '?').join(',')})
      ORDER BY invoice_id, created_at, id`,
    args: ids,
  })).rows;
  const byId = new Map(invoiceRows.map((invoice) => [invoice.id, { ...invoice, timeline: [] }]));
  for (const row of rows) {
    const parent = byId.get(Number(row.invoice_id));
    if (parent) parent.timeline.push({
      id: Number(row.id), stage_id: row.stage_id == null ? null : Number(row.stage_id),
      stage_label: row.stage_label, stage_tone: row.stage_tone, note: row.note ?? '',
      created_at: row.created_at, updated_at: row.updated_at,
    });
  }
  return [...byId.values()];
}

export async function exportPage(query = {}) {
  const afterId = exportInteger(query.afterId, 'afterId') ?? 0;
  const maxRequested = exportInteger(query.maxId, 'maxId');
  const db = getDb();
  const maxId = maxRequested ?? Number((await db.execute('SELECT COALESCE(MAX(id), 0) AS last FROM invoices')).rows[0].last);
  if (afterId > maxId) throw new HttpError(400, 'Invalid export cursor');
  const [counter, fields, result] = await Promise.all([
    db.execute({ sql: 'SELECT COUNT(*) AS n FROM invoices WHERE id <= ?', args: [maxId] }),
    listFields({ includeArchived: true }),
    db.execute({ sql: 'SELECT * FROM invoices WHERE id > ? AND id <= ? ORDER BY id ASC LIMIT ?', args: [afterId, maxId, EXPORT_LIMIT + 1] }),
  ]);
  const fetched = result.rows;
  const page = fetched.slice(0, EXPORT_LIMIT);
  const rows = page.map((raw) => ({ ...toApi(raw), created_at: raw.created_at, updated_at: raw.updated_at }));
  const enriched = await withPaymentHistory(await withItems(await withCustom(rows, fields)));
  return {
    data: enriched, fields, total: Number(counter.rows[0].n),
    max_id: maxId, next_after_id: page.length ? Number(page.at(-1).id) : afterId,
    has_more: fetched.length > EXPORT_LIMIT,
  };
}

// Adds custom_fields: { [fieldId]: value } (active fields only; empty values are simply absent).
async function withCustom(apiRows, fields) {
  const out = apiRows.map((r) => ({ ...r, custom_fields: {} }));
  if (!out.length || !fields.length) return out;
  const active = new Set(fields.map((f) => f.id));
  const ids = out.map((r) => r.id);
  const rows = (await getDb().execute({ sql: `SELECT invoice_id, field_id, value FROM invoice_custom_values WHERE invoice_id IN (${ids.map(() => '?').join(',')})`, args: ids })).rows;
  const byInvoice = new Map(out.map((r) => [r.id, r]));
  for (const v of rows) if (active.has(Number(v.field_id))) byInvoice.get(Number(v.invoice_id)).custom_fields[Number(v.field_id)] = v.value;
  return out;
}
// Adds items: [{ product_service, quantity, unit_cost, amount }] in entered order (pesos). The invoice amount is the sum of the
// item amounts. Older records are read without being rewritten: an invoice with no item rows is one item, quantity 1, whose unit
// cost and amount are the stored amount; item rows saved before unit costs existed get unit_cost / amount null (a single item
// still carries the invoice amount), and the invoice keeps its stored amount until it is edited and re-priced.
async function withItems(apiRows) {
  if (!apiRows.length) return apiRows;
  const ids = apiRows.map((r) => r.id);
  const rows = (await getDb().execute({ sql: `SELECT invoice_id, product_service, description, quantity, unit_cost_centavos, amount_centavos, is_title FROM invoice_items WHERE invoice_id IN (${ids.map(() => '?').join(',')}) ORDER BY invoice_id, position, id`, args: ids })).rows;
  const textRecords = (await getDb().execute({ sql: `SELECT invoice_id, text, after_item, kind, is_priced, quantity, unit_cost_centavos, amount_centavos FROM invoice_text_rows WHERE invoice_id IN (${ids.map(() => '?').join(',')}) ORDER BY invoice_id, sort_order, id`, args: ids })).rows;
  const textBy = new Map();
  for (const x of textRecords) {
    const k = Number(x.invoice_id);
    if (!textBy.has(k)) textBy.set(k, []);
    textBy.get(k).push({ text: x.text, after_item: Number(x.after_item), ...(x.kind === 'space' ? { kind: 'space' } : {}), ...(x.is_priced ? { is_priced: true } : {}), ...(x.is_priced ? { quantity: Number(x.quantity), unit_cost: toPesos(Number(x.unit_cost_centavos)), amount: toPesos(Number(x.amount_centavos)) } : {}) });
  }
  const by = new Map();
  for (const x of rows) { const k = Number(x.invoice_id); if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
  return apiRows.map((r) => {
    const list = by.get(r.id);
    const text_rows = textBy.get(r.id) || [];
    if (!list) return { ...r, text_rows, items: [{ product_service: r.product_service, quantity: 1, unit_cost: r.amount, amount: r.amount }] };
    return { ...r, text_rows, items: list.map((x) => {
      const priced = x.unit_cost_centavos != null && x.amount_centavos != null;
      return { product_service: x.product_service, ...(x.is_title ? { is_title: true } : {}), ...(x.description ? { description: x.description } : {}), quantity: x.is_title ? null : Number(x.quantity), unit_cost: x.is_title ? null : priced ? toPesos(Number(x.unit_cost_centavos)) : null, amount: x.is_title ? null : priced ? toPesos(Number(x.amount_centavos)) : list.length === 1 ? r.amount : null };
    }) };
  });
}
export async function get(id) {
  const r = (await getDb().execute({ sql: 'SELECT * FROM invoices WHERE id = ?', args: [id] })).rows[0];
  return r ? (await withItems(await withCustom([toApi(r)], await activeFields())))[0] : null;
}
const cols = (v) => [v.date_issued, v.invoice_no, v.cr_no, v.client_name, v.client_tin, v.client_address, v.product_service, v.due_date, v.amount_centavos, v.amount_paid_centavos, v.payment_status, v.delivery_date, v.remarks];
const itemStatements = (items, ref) => items.map((it, i) => ({ sql: `INSERT INTO invoice_items (invoice_id, position, product_service, quantity, unit_cost_centavos, amount_centavos, description, is_title) SELECT id, ?, ?, ?, ?, ?, ?, ? FROM invoices WHERE ${ref.where}`, args: [i, it.product_service, it.quantity, it.unit_cost_centavos, it.amount_centavos, it.description || '', it.is_title ? 1 : 0, ...ref.args] }));
const textStatements = (rows, ref) => rows.map((row, i) => ({ sql: `INSERT INTO invoice_text_rows (invoice_id, after_item, sort_order, text, kind, is_priced, quantity, unit_cost_centavos, amount_centavos) SELECT id, ?, ?, ?, ?, ?, ?, ?, ? FROM invoices WHERE ${ref.where}`, args: [row.after_item, i, row.text, row.kind === 'space' ? 'space' : 'description', row.is_priced ? 1 : 0, row.is_priced ? row.quantity : null, row.is_priced ? row.unit_cost_centavos : null, row.is_priced ? row.amount_centavos : null, ...ref.args] }));

// ---- Invoice numbers ------------------------------------------------------------------------------------------------------
// invoice_sequences.last_number is the last number ever assigned per type and only moves forward, so a deleted, cancelled or voided
// invoice's number is never handed out again. Nothing here runs when a form is opened or previewed: nextNumber() only reads.
// create() bumps the counter and inserts the invoice in ONE write batch (a single transaction; SQLite/libSQL allows one writer
// at a time, so two saves cannot read the same counter value). If the insert fails the counter bump is rolled back with it.
const NUMBER_SQL = `(SELECT prefix || ' - ' || printf('%04d', last_number) FROM invoice_sequences WHERE prefix = ?)`; // min 4 digits, grows past 9999
const sequenceRef = (prefix) => ({ where: `invoice_no = ${NUMBER_SQL}`, sql: `(SELECT id FROM invoices WHERE invoice_no = ${NUMBER_SQL})`, args: [prefix] });

// The number the next saved invoice of this type would get. A provisional hint for the form: another save may take it first.
export async function nextNumber(prefix) {
  const db = getDb();
  const row = (await db.execute({ sql: 'SELECT last_number FROM invoice_sequences WHERE prefix = ?', args: [prefix] })).rows[0];
  const last = Math.max(row ? Number(row.last_number) : 0, await highestAssigned(db, prefix)); // never suggest a number already in use
  return { prefix, number: formatInvoiceNo(prefix, last + 1) };
}
// Moves a lagging counter up to the highest number in use (rows imported or inserted outside the app). Never moves it back.
async function syncSequence(prefix) {
  const db = getDb(), high = await highestAssigned(db, prefix);
  await db.batch([
    { sql: 'INSERT OR IGNORE INTO invoice_sequences (prefix, last_number) VALUES (?, 0)', args: [prefix] },
    { sql: 'UPDATE invoice_sequences SET last_number = MAX(last_number, ?) WHERE prefix = ?', args: [high, prefix] },
  ], 'write');
}

// Automatic numbers are assigned at save time. A manual override and its counter update are
// committed with the invoice and its children in a single transaction.
export async function create(v, writes = []) {
  const now = new Date().toISOString(), prefix = v.invoice_prefix, manualNo = v.invoice_no || null;
  const ref = manualNo ? { where: 'invoice_no = ?', args: [manualNo] } : sequenceRef(prefix);
  const numberExpression = manualNo ? '?' : NUMBER_SQL;
  const bump = manualNo
    ? { sql: 'UPDATE invoice_sequences SET last_number = MAX(last_number, ?) WHERE prefix = ?', args: [sequenceOf(manualNo, prefix), prefix] }
    : { sql: 'UPDATE invoice_sequences SET last_number = last_number + 1 WHERE prefix = ?', args: [prefix] };
  for (let attempt = 0; ; attempt++) {
    try {
      const results = await getDb().batch([
        { sql: 'INSERT OR IGNORE INTO invoice_sequences (prefix, last_number) VALUES (?, 0)', args: [prefix] },
        bump,
        { sql: `INSERT INTO invoices (date_issued,invoice_no,terms,cr_no,client_name,client_tin,client_address,product_service,due_date,amount_centavos,amount_paid_centavos,payment_status,delivery_date,remarks,created_at,updated_at) VALUES (?,${numberExpression},?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, args: [v.date_issued, manualNo || prefix, FIXED_TERMS, ...cols(v).slice(2), now, now] },
        ...itemStatements(v.items, ref), ...textStatements(v.text_rows, ref), ...valueStatements(writes, ref),
      ], 'write');
      return get(Number(results[2].lastInsertRowid));
    } catch (e) {
      // Manual collisions must fail rather than silently changing the number the user picked.
      if (!manualNo && attempt < 2 && /UNIQUE/i.test(e.message) && /invoice_no/i.test(e.message)) { await syncSequence(prefix); continue; }
      throw e;
    }
  }
}
// Edits preserve their original number unless explicitly overridden. The corresponding counter
// only advances, and remains unchanged if an edit fails (including a duplicate-number collision).
export async function update(id, v, writes = []) {
  const sequenceWrites = v.invoice_number_changed ? [
    { sql: 'INSERT OR IGNORE INTO invoice_sequences (prefix, last_number) VALUES (?, 0)', args: [v.invoice_prefix] },
    { sql: 'UPDATE invoice_sequences SET last_number = MAX(last_number, ?) WHERE prefix = ?', args: [sequenceOf(v.invoice_no, v.invoice_prefix), v.invoice_prefix] },
  ] : [];
  const [r] = await getDb().batch([
    { sql: `UPDATE invoices SET date_issued=?,invoice_no=?,cr_no=?,client_name=?,client_tin=?,client_address=?,product_service=?,due_date=?,amount_centavos=?,amount_paid_centavos=?,payment_status=?,delivery_date=?,remarks=?,updated_at=? WHERE id=?`, args: [...cols(v), new Date().toISOString(), id] },
    ...sequenceWrites,
    { sql: 'DELETE FROM invoice_items WHERE invoice_id = ?', args: [id] },
    { sql: 'DELETE FROM invoice_text_rows WHERE invoice_id = ?', args: [id] },
    ...itemStatements(v.items, refById(id)), ...textStatements(v.text_rows, refById(id)), ...valueStatements(writes, refById(id)),
  ], 'write');
  return r.rowsAffected ? get(id) : null;
}
export async function remove(id) {
  const [, , , , r] = await getDb().batch([
    { sql: 'DELETE FROM invoice_custom_values WHERE invoice_id = ?', args: [id] },
    { sql: 'DELETE FROM invoice_items WHERE invoice_id = ?', args: [id] },
    { sql: 'DELETE FROM invoice_text_rows WHERE invoice_id = ?', args: [id] },
    { sql: 'DELETE FROM payment_timeline_events WHERE invoice_id = ?', args: [id] },
    { sql: 'DELETE FROM invoices WHERE id = ?', args: [id] },
  ], 'write');
  return r.rowsAffected > 0;
}
export async function distinct(col) {
  return (await getDb().execute(`SELECT DISTINCT ${col} v FROM invoices ORDER BY v COLLATE NOCASE`)).rows.map((r) => r.v);
}
// Product/service names for filter suggestions: item names, plus the summary of invoices that have no item rows yet.
export async function distinctProducts() {
  return (await getDb().execute(`SELECT product_service v FROM invoice_items UNION SELECT product_service FROM invoices WHERE NOT EXISTS (SELECT 1 FROM invoice_items i WHERE i.invoice_id = invoices.id) ORDER BY v COLLATE NOCASE`)).rows.map((r) => r.v);
}
