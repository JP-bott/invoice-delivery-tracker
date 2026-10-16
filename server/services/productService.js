import { getDb } from '../database/db.js';
import { HttpError } from '../http.js';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const toApi = (row) => ({ id: Number(row.id), name: row.name, created_at: row.created_at, updated_at: row.updated_at });

export async function list() {
  const rows = (await getDb().execute('SELECT * FROM product_options ORDER BY name COLLATE NOCASE')).rows;
  return rows.map(toApi);
}

export async function create(body = {}) {
  const name = clean(body.name);
  if (!name) throw new HttpError(422, 'Option name is required', 'VALIDATION_ERROR');
  const now = new Date().toISOString();
  const result = await getDb().execute({ sql: 'INSERT INTO product_options (name, created_at, updated_at) VALUES (?, ?, ?)', args: [name, now, now] });
  return toApi((await getDb().execute({ sql: 'SELECT * FROM product_options WHERE id = ?', args: [result.lastInsertRowid] })).rows[0]);
}

export async function update(id, body = {}) {
  if (id == null) return null;
  const name = clean(body.name);
  if (!name) throw new HttpError(422, 'Option name is required', 'VALIDATION_ERROR');
  const result = await getDb().execute({ sql: 'UPDATE product_options SET name = ?, updated_at = ? WHERE id = ?', args: [name, new Date().toISOString(), id] });
  if (!result.rowsAffected) return null;
  return toApi((await getDb().execute({ sql: 'SELECT * FROM product_options WHERE id = ?', args: [id] })).rows[0]);
}

export async function remove(id) {
  if (id == null) return false;
  return (await getDb().execute({ sql: 'DELETE FROM product_options WHERE id = ?', args: [id] })).rowsAffected > 0;
}
