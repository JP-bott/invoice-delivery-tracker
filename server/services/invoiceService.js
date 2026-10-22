import { getDb, highestAssigned } from '../database/db.js';
import { FIXED_TERMS } from '../database/schema.js';
import { formatInvoiceNo } from '../../shared/invoiceNumber.js';
import { toPesos } from './money.js';
import { buildWhere } from './filterBuilder.js';
import { HttpError } from '../http.js';
import { activeFields, valueStatements, refById } from './customFieldService.js';

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
  const rows = (await getDb().execute({ sql: `SELECT invoice_id, product_service, quantity, unit_cost_centavos, amount_centavos FROM invoice_items WHERE invoice_id IN (${ids.map(() => '?').join(',')}) ORDER BY invoice_id, position, id`, args: ids })).rows;
  const by = new Map();
  for (const x of rows) { const k = Number(x.invoice_id); if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
  return apiRows.map((r) => {
    const list = by.get(r.id);
    if (!list) return { ...r, items: [{ product_service: r.product_service, quantity: 1, unit_cost: r.amount, amount: r.amount }] };
    return { ...r, items: list.map((x) => {
      const priced = x.unit_cost_centavos != null && x.amount_centavos != null;
      return { product_service: x.product_service, quantity: Number(x.quantity), unit_cost: priced ? toPesos(Number(x.unit_cost_centavos)) : null, amount: priced ? toPesos(Number(x.amount_centavos)) : list.length === 1 ? r.amount : null };
    }) };
  });
}
export async function get(id) {
  const r = (await getDb().execute({ sql: 'SELECT * FROM invoices WHERE id = ?', args: [id] })).rows[0];
  return r ? (await withItems(await withCustom([toApi(r)], await activeFields())))[0] : null;
}
const cols = (v) => [v.date_issued, v.invoice_no, v.cr_no, v.client_name, v.client_tin, v.client_address, v.product_service, v.due_date, v.amount_centavos, v.amount_paid_centavos, v.payment_status, v.delivery_date, v.remarks];
const itemStatements = (items, ref) => items.map((it, i) => ({ sql: `INSERT INTO invoice_items (invoice_id, position, product_service, quantity, unit_cost_centavos, amount_centavos) SELECT id, ?, ?, ?, ?, ? FROM invoices WHERE ${ref.where}`, args: [i, it.product_service, it.quantity, it.unit_cost_centavos, it.amount_centavos, ...ref.args] }));

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

// v.invoice_prefix (SI | SVI) chooses the sequence; v.invoice_no is never used. writes: validated custom values (see
// customFieldService.validateValues). Number, invoice, items and values commit together.
export async function create(v, writes = []) {
  const now = new Date().toISOString(), prefix = v.invoice_prefix, ref = sequenceRef(prefix);
  for (let attempt = 0; ; attempt++) {
    try {
      const results = await getDb().batch([
        { sql: 'INSERT OR IGNORE INTO invoice_sequences (prefix, last_number) VALUES (?, 0)', args: [prefix] },
        { sql: 'UPDATE invoice_sequences SET last_number = last_number + 1 WHERE prefix = ?', args: [prefix] },
        { sql: `INSERT INTO invoices (date_issued,invoice_no,terms,cr_no,client_name,client_tin,client_address,product_service,due_date,amount_centavos,amount_paid_centavos,payment_status,delivery_date,remarks,created_at,updated_at) VALUES (?,${NUMBER_SQL},?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, args: [v.date_issued, prefix, FIXED_TERMS, ...cols(v).slice(2), now, now] },
        ...itemStatements(v.items, ref), ...valueStatements(writes, ref),
      ], 'write');
      return get(Number(results[2].lastInsertRowid));
    } catch (e) {
      // The counter was behind a number already in use: the whole batch rolled back, so catch the counter up and try again.
      if (attempt < 2 && /UNIQUE/i.test(e.message) && /invoice_no/i.test(e.message)) { await syncSequence(prefix); continue; }
      throw e;
    }
  }
}
// An invoice keeps its number for life: v.invoice_no is the stored one (see validate.js), and terms is never written.
export async function update(id, v, writes = []) {
  const [r] = await getDb().batch([{ sql: `UPDATE invoices SET date_issued=?,invoice_no=?,cr_no=?,client_name=?,client_tin=?,client_address=?,product_service=?,due_date=?,amount_centavos=?,amount_paid_centavos=?,payment_status=?,delivery_date=?,remarks=?,updated_at=? WHERE id=?`, args: [...cols(v), new Date().toISOString(), id] }, { sql: 'DELETE FROM invoice_items WHERE invoice_id = ?', args: [id] }, ...itemStatements(v.items, refById(id)), ...valueStatements(writes, refById(id))], 'write');
  return r.rowsAffected ? get(id) : null;
}
export async function remove(id) {
  const [, , r] = await getDb().batch([
    { sql: 'DELETE FROM invoice_custom_values WHERE invoice_id = ?', args: [id] },
    { sql: 'DELETE FROM invoice_items WHERE invoice_id = ?', args: [id] },
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
