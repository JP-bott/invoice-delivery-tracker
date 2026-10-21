// Registered clients (Settings > Clients): name, TIN and address, used to fill the Add/Edit Invoice form.
// Same shape as productService: small functions, HttpError for expected failures, ISO timestamps.
// Invoices keep their own copy of these details (see invoiceService), so nothing here rewrites an invoice.
import { getDb } from '../database/db.js';
import { HttpError } from '../http.js';

export const MAX = { name: 200, tin: 30, address: 300 };
const TIN_DIGITS = [9, 14]; // a Philippine TIN is 9 digits, plus a 3-5 digit branch code: 000-000-000 or 000-000-000-00000

const squash = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const toApi = (r) => ({ id: Number(r.id), name: r.name, tin: r.tin ?? null, address: r.address ?? null, created_at: r.created_at, updated_at: r.updated_at });
const byId = async (id) => (await getDb().execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [id] })).rows[0];

// Returns { name, tin, address } (tin/address null when empty) or throws a 422 whose `fields` the form shows under each input.
function clean(body = {}) {
  const f = {}, name = squash(body.name), tin = squash(body.tin), address = squash(body.address);
  if (!name) f.name = 'Enter the client name.';
  else if (name.length > MAX.name) f.name = `Must be ${MAX.name} characters or fewer.`;
  if (tin) {
    const digits = tin.replace(/\D/g, '').length;
    if (tin.length > MAX.tin) f.tin = `Must be ${MAX.tin} characters or fewer.`;
    else if (/[^0-9\s-]/.test(tin) || digits < TIN_DIGITS[0] || digits > TIN_DIGITS[1]) f.tin = `Use ${TIN_DIGITS[0]} to ${TIN_DIGITS[1]} digits, with hyphens if you like (e.g. 123-456-789-00000).`;
  }
  if (address.length > MAX.address) f.address = `Must be ${MAX.address} characters or fewer.`;
  if (Object.keys(f).length) throw new HttpError(422, 'Please fix the highlighted fields', 'VALIDATION_ERROR', f);
  return { name, tin: tin || null, address: address || null };
}

async function assertNameFree(name, exceptId = null) {
  const row = (await getDb().execute({ sql: 'SELECT id FROM clients WHERE name = ? COLLATE NOCASE AND id <> ?', args: [name, exceptId ?? -1] })).rows[0];
  if (row) throw new HttpError(409, 'A client with this name already exists', 'DUPLICATE', { name: 'A client with this name already exists.' });
}

export async function list() {
  return (await getDb().execute('SELECT * FROM clients ORDER BY name COLLATE NOCASE')).rows.map(toApi);
}

export async function create(body = {}) {
  const c = clean(body);
  await assertNameFree(c.name);
  const now = new Date().toISOString();
  const r = await getDb().execute({ sql: 'INSERT INTO clients (name, tin, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', args: [c.name, c.tin, c.address, now, now] });
  return toApi(await byId(Number(r.lastInsertRowid)));
}

export async function update(id, body = {}) {
  if (id == null) return null;
  if (!(await byId(id))) return null;
  const c = clean(body);
  await assertNameFree(c.name, id);
  await getDb().execute({ sql: 'UPDATE clients SET name = ?, tin = ?, address = ?, updated_at = ? WHERE id = ?', args: [c.name, c.tin, c.address, new Date().toISOString(), id] });
  return toApi(await byId(id));
}

export async function remove(id) {
  if (id == null) return false;
  return (await getDb().execute({ sql: 'DELETE FROM clients WHERE id = ?', args: [id] })).rowsAffected > 0;
}
