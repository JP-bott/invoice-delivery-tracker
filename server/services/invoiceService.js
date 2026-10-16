import { getDb } from '../database/db.js';
import { toPesos } from './money.js';
import { buildWhere } from './filterBuilder.js';
import { HttpError } from '../http.js';

const SORTS = { date_issued: 'date_issued', invoice_no: 'invoice_no', cr_no: 'cr_no', client_name: 'client_name', product_service: 'product_service', amount: 'amount_centavos', amount_paid: 'amount_paid_centavos', payment_status: 'payment_status', delivery_date: 'delivery_date' };

export const toApi = (r) => ({
  id: Number(r.id), date_issued: r.date_issued, invoice_no: r.invoice_no, cr_no: r.cr_no,
  client_name: r.client_name, product_service: r.product_service,
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
  const { where, args } = buildWhere(q);
  const db = getDb();
  const total = Number((await db.execute({ sql: `SELECT COUNT(*) c FROM invoices ${where}`, args })).rows[0].c);
  const rows = (await db.execute({ sql: `SELECT * FROM invoices ${where} ORDER BY ${col} ${dir}, id DESC LIMIT ? OFFSET ?`, args: [...args, pageSize, (page - 1) * pageSize] })).rows;
  return { data: rows.map(toApi), page, pageSize, total };
}
export async function get(id) {
  const r = (await getDb().execute({ sql: 'SELECT * FROM invoices WHERE id = ?', args: [id] })).rows[0];
  return r ? toApi(r) : null;
}
const cols = (v) => [v.date_issued, v.invoice_no, v.cr_no, v.client_name, v.product_service, v.amount_centavos, v.amount_paid_centavos, v.payment_status, v.delivery_date, v.remarks];
export async function create(v) {
  const now = new Date().toISOString();
  const r = await getDb().execute({ sql: `INSERT INTO invoices (date_issued,invoice_no,cr_no,client_name,product_service,amount_centavos,amount_paid_centavos,payment_status,delivery_date,remarks,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, args: [...cols(v), now, now] });
  return get(Number(r.lastInsertRowid));
}
export async function update(id, v) {
  const r = await getDb().execute({ sql: `UPDATE invoices SET date_issued=?,invoice_no=?,cr_no=?,client_name=?,product_service=?,amount_centavos=?,amount_paid_centavos=?,payment_status=?,delivery_date=?,remarks=?,updated_at=? WHERE id=?`, args: [...cols(v), new Date().toISOString(), id] });
  return r.rowsAffected ? get(id) : null;
}
export async function remove(id) {
  return (await getDb().execute({ sql: 'DELETE FROM invoices WHERE id = ?', args: [id] })).rowsAffected > 0;
}
export async function distinct(col) {
  return (await getDb().execute(`SELECT DISTINCT ${col} v FROM invoices ORDER BY v COLLATE NOCASE`)).rows.map((r) => r.v);
}
