import { getDb } from '../database/db.js';
import { toPesos } from './money.js';
import { buildWhere } from './filterBuilder.js';
import { HttpError } from '../http.js';
import { computeInvoiceTotals } from '../../shared/invoiceTotals.js';

export const INVOICE_NUMBER_CONFIG = { prefix: 'SVI', width: 4 };

const SORTS = { date_issued: 'date_issued', invoice_no: 'invoice_no', cr_no: 'cr_no', client_name: 'client_name', product_service: 'product_service', due_date: 'due_date', amount: 'amount_centavos', amount_paid: 'amount_paid_centavos', payment_status: 'payment_status', delivery_date: 'delivery_date' };

export const toApi = (r) => ({
  id: Number(r.id), date_issued: r.date_issued, invoice_no: r.invoice_no, cr_no: r.cr_no,
  client_name: r.client_name, product_service: r.product_service, due_date: r.due_date,
  amount: toPesos(r.amount_centavos), amount_paid: toPesos(r.amount_paid_centavos),
  total_sales: toPesos(r.total_sales_centavos), vat: toPesos(r.vat_centavos), net_of_vat: toPesos(r.net_of_vat_centavos),
  withholding_tax: toPesos(r.withholding_centavos), total_amount_due: toPesos(r.total_amount_due_centavos),
  vat_type: r.vat_type, withholding_rate: r.withholding_rate_basis_points / 100,
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
const numberPattern = new RegExp(`^${INVOICE_NUMBER_CONFIG.prefix}(\\d+)$`, 'i');
const formatInvoiceNumber = (number) => `${INVOICE_NUMBER_CONFIG.prefix}${String(number).padStart(INVOICE_NUMBER_CONFIG.width, '0')}`;
export async function nextInvoiceNumber() {
  const rows = (await getDb().execute({ sql: 'SELECT invoice_no FROM invoices WHERE invoice_no LIKE ?', args: [`${INVOICE_NUMBER_CONFIG.prefix}%`] })).rows;
  const highest = rows.reduce((max, row) => {
    const match = String(row.invoice_no).match(numberPattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return formatInvoiceNumber(highest + 1);
}
const totalsCols = (v) => {
  const totals = computeInvoiceTotals({ amount: v.amount_centavos / 100, vatType: v.vat_type, withholdingRate: v.withholding_rate_basis_points / 100 });
  return [Math.round(totals.totalSales * 100), Math.round(totals.vat * 100), Math.round(totals.netOfVat * 100), Math.round(totals.withholdingTax * 100), Math.round(totals.totalAmountDue * 100), totals.vatType, v.withholding_rate_basis_points];
};
const cols = (v, invoiceNo) => [v.date_issued, invoiceNo || v.invoice_no, v.cr_no, v.client_name, v.product_service, v.due_date, v.amount_centavos, ...totalsCols(v), v.amount_paid_centavos, v.payment_status, v.delivery_date, v.remarks];
export async function create(v) {
  const now = new Date().toISOString();
  const db = getDb();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const invoiceNo = v.auto_number ? await nextInvoiceNumber() : v.invoice_no;
    try {
      const r = await db.execute({ sql: `INSERT INTO invoices (date_issued,invoice_no,cr_no,client_name,product_service,due_date,amount_centavos,total_sales_centavos,vat_centavos,net_of_vat_centavos,withholding_centavos,total_amount_due_centavos,vat_type,withholding_rate_basis_points,amount_paid_centavos,payment_status,delivery_date,remarks,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, args: [...cols(v, invoiceNo), now, now] });
      return get(Number(r.lastInsertRowid));
    } catch (error) {
      if (!v.auto_number || !/UNIQUE/i.test(error.message) || attempt === 2) throw error;
    }
  }
}
export async function update(id, v) {
  const r = await getDb().execute({ sql: `UPDATE invoices SET date_issued=?,invoice_no=?,cr_no=?,client_name=?,product_service=?,due_date=?,amount_centavos=?,total_sales_centavos=?,vat_centavos=?,net_of_vat_centavos=?,withholding_centavos=?,total_amount_due_centavos=?,vat_type=?,withholding_rate_basis_points=?,amount_paid_centavos=?,payment_status=?,delivery_date=?,remarks=?,updated_at=? WHERE id=?`, args: [...cols(v), new Date().toISOString(), id] });
  return r.rowsAffected ? get(id) : null;
}
export async function remove(id) {
  return (await getDb().execute({ sql: 'DELETE FROM invoices WHERE id = ?', args: [id] })).rowsAffected > 0;
}
export async function distinct(col) {
  return (await getDb().execute(`SELECT DISTINCT ${col} v FROM invoices ORDER BY v COLLATE NOCASE`)).rows.map((r) => r.v);
}
