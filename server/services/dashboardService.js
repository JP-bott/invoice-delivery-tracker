import { getDb } from '../database/db.js';
import { toPesos } from './money.js';
import { buildWhere } from './filterBuilder.js';
import { toApi } from './invoiceService.js';

const f = (q, cancelled = false) => buildWhere(q, { exact: true, excludeCancelled: !cancelled });
const run = async (sql, args) => (await getDb().execute({ sql, args })).rows;
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

export const handlers = {
  async summary(q) {
    const { where, args } = f(q);
    const r = (await run(`SELECT COUNT(*) n, COALESCE(SUM(amount_centavos),0) val, COALESCE(SUM(amount_paid_centavos),0) paid,
      COALESCE(SUM(MAX(amount_centavos-amount_paid_centavos,0)),0) outstanding,
      COALESCE(SUM(CASE WHEN payment_status IN ('Pending','Partially Paid') THEN MAX(amount_centavos-amount_paid_centavos,0) END),0) pending,
      COALESCE(SUM(delivery_date IS NOT NULL),0) delivered, COALESCE(SUM(delivery_date IS NULL),0) undelivered FROM invoices ${where}`, args))[0];
    return { totalInvoices: Number(r.n), totalValue: toPesos(r.val), totalCollected: toPesos(r.paid), outstandingBalance: toPesos(r.outstanding),
      pendingPayments: toPesos(r.pending), deliveredOrders: Number(r.delivered), pendingDeliveries: Number(r.undelivered) };
  },
  async 'invoice-trends'(q) {
    const { where, args } = f(q);
    let from = q.dateFrom, to = q.dateTo;
    if (!from || !to) {
      const m = (await run(`SELECT MIN(date_issued) a, MAX(date_issued) b FROM invoices ${where}`, args))[0];
      from = from || m.a; to = to || m.b;
    }
    if (!from || !to) return [];
    const d = days(from, to), len = d <= 62 ? 10 : d <= 730 ? 7 : 4;
    return (await run(`SELECT substr(date_issued,1,${len}) period, SUM(amount_centavos) v FROM invoices ${where} GROUP BY period ORDER BY period`, args))
      .map((r) => ({ period: r.period, value: toPesos(r.v) }));
  },
  async 'payment-distribution'(q) {
    const { where, args } = f(q, true); // includes Cancelled
    return (await run(`SELECT payment_status status, COUNT(*) count FROM invoices ${where} GROUP BY payment_status`, args)).map((r) => ({ status: r.status, count: Number(r.count) }));
  },
  async 'invoice-status'(q) {
    const { where, args } = f({ ...q, dateFrom: undefined, dateTo: undefined });
    const today = new Date().toISOString().slice(0, 10);
    const start = q.dateFrom || `${today.slice(0, 7)}-01`;
    const end = q.dateTo || `${today.slice(0, 7)}-31`;
    const totals = { overdue: { value: 0, count: 0 }, dueMonth: { value: 0, count: 0 }, incoming: { value: 0, count: 0 } };
    const rows = await run(`SELECT date_issued, amount_centavos, amount_paid_centavos FROM invoices ${where} AND payment_status IN ('Pending','Partially Paid')`, args);
    for (const row of rows) {
      const outstanding = Math.max(Number(row.amount_centavos) - Number(row.amount_paid_centavos), 0);
      if (!outstanding) continue;
      const bucket = row.date_issued < start ? 'overdue' : row.date_issued <= end ? 'dueMonth' : 'incoming';
      totals[bucket].value += outstanding;
      totals[bucket].count += 1;
    }
    return { start, end, total: Object.values(totals).reduce((sum, item) => sum + item.value, 0), buckets: totals };
  },
  async 'top-clients'(q) {
    const { where, args } = f(q);
    return (await run(`SELECT client_name name, SUM(amount_centavos) v, COUNT(*) c FROM invoices ${where} GROUP BY client_name ORDER BY v DESC LIMIT 10`, args)).map((r) => ({ name: r.name, value: toPesos(r.v), count: Number(r.c) }));
  },
  async 'top-products'(q) {
    const { where, args } = f(q);
    return (await run(`SELECT product_service name, SUM(amount_centavos) v, COUNT(*) c FROM invoices ${where} GROUP BY product_service ORDER BY v DESC LIMIT 10`, args)).map((r) => ({ name: r.name, value: toPesos(r.v), count: Number(r.c) }));
  },
  async 'delivery-summary'(q) {
    const s = await handlers.summary(q);
    return [{ name: 'Delivered', value: s.deliveredOrders }, { name: 'Pending', value: s.pendingDeliveries }];
  },
  async 'recent-invoices'(q) {
    const { where, args } = f(q, true); // includes Cancelled
    return (await run(`SELECT * FROM invoices ${where} ORDER BY date_issued DESC, id DESC LIMIT 8`, args)).map(toApi);
  },
};
