import { getDb } from '../database/db.js';
import { toPesos } from './money.js';
import { buildWhere } from './filterBuilder.js';
import { toApi } from './invoiceService.js';

const f = (q, cancelled = false) => buildWhere(q, { exact: true, excludeCancelled: !cancelled });
const run = async (sql, args) => (await getDb().execute({ sql, args })).rows;
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
const datePart = (value) => String(value).slice(0, 10);
const monthStart = (value) => `${value.slice(0, 7)}-01`;
const shiftMonth = (value, amount) => { const date = new Date(`${monthStart(value)}T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + amount); return date.toISOString().slice(0, 10); };
const monthEnd = (value) => { const date = new Date(`${monthStart(value)}T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); date.setUTCDate(0); return date.toISOString().slice(0, 10); };
const moneyRow = (r) => ({
  id: Number(r.id), invoice_no: r.invoice_no, client_name: r.client_name, product_service: r.product_service,
  date_issued: r.date_issued, due_date: r.due_date, amount: toPesos(r.amount_centavos), amount_paid: toPesos(r.amount_paid_centavos),
  outstanding: toPesos(Math.max(Number(r.amount_centavos) - Number(r.amount_paid_centavos), 0)), payment_status: r.payment_status,
  delivery_date: r.delivery_date, remarks: r.remarks,
});
const groupClients = (rows) => Object.values(rows.reduce((groups, row) => {
  const group = groups[row.client_name] || { name: row.client_name, count: 0, outstanding: 0 };
  group.count += 1; group.outstanding += row.outstanding_centavos; groups[row.client_name] = group; return groups;
}, {})).sort((a, b) => b.outstanding - a.outstanding).map((group) => ({ ...group, outstanding: toPesos(group.outstanding) }));

export const handlers = {
  async analytics(q) {
    const today = q.asOf || new Date().toISOString().slice(0, 10);
    const from = q.dateFrom || monthStart(today), to = q.dateTo || monthEnd(today);
    const filters = { ...q, dateFrom: undefined, dateTo: undefined, asOf: undefined };
    const base = f(filters);
    const revenueRows = await run(`SELECT * FROM invoices ${base.where} AND date_issued >= ? AND date_issued <= ?`, [...base.args, from, to]);
    const span = Math.max(1, days(from, to));
    const previousFrom = new Date(`${from}T00:00:00Z`); previousFrom.setUTCDate(previousFrom.getUTCDate() - span);
    const previousTo = new Date(`${from}T00:00:00Z`); previousTo.setUTCDate(previousTo.getUTCDate() - 1);
    const previousRows = await run(`SELECT date_issued, amount_paid_centavos FROM invoices ${base.where} AND date_issued >= ? AND date_issued <= ?`, [...base.args, previousFrom.toISOString().slice(0, 10), previousTo.toISOString().slice(0, 10)]);
    const months = [];
    for (let cursor = monthStart(from); cursor <= to; cursor = shiftMonth(cursor, 1)) {
      const next = shiftMonth(cursor, 1);
      months.push({ key: cursor.slice(0, 7), label: new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(`${cursor}T00:00:00Z`)), value: 0, comparison: 0 });
      if (next <= cursor) break;
    }
    const revenueByMonth = Object.fromEntries(months.map((month) => [month.key, month]));
    revenueRows.forEach((row) => { const month = revenueByMonth[datePart(row.date_issued).slice(0, 7)]; if (month) month.value += Number(row.amount_paid_centavos); });
    previousRows.forEach((row) => { const previousMonth = monthStart(row.date_issued); const startMonth = monthStart(previousFrom.toISOString().slice(0, 10)); const index = (Number(previousMonth.slice(0, 4)) * 12 + Number(previousMonth.slice(5, 7))) - (Number(startMonth.slice(0, 4)) * 12 + Number(startMonth.slice(5, 7))); const month = months[index]; if (month) month.comparison += Number(row.amount_paid_centavos); });
    const receivableRows = await run(`SELECT * FROM invoices ${base.where} AND payment_status IN ('Pending','Partially Paid')`, base.args);
    const buckets = [
      ['overdue', 'Overdue'], ['today', 'Due today'], ['week', 'Due this week'], ['month', 'Due this month'],
      ['next30', 'Due in next 30 days'], ['upcoming', 'Upcoming / Later'], ['noDue', 'No due date'],
    ].map(([key, label]) => ({ key, label, count: 0, amount_centavos: 0, records: [] }));
    const bucketMap = Object.fromEntries(buckets.map((bucket) => [bucket.key, bucket]));
    const addDays = (date, amount) => { const next = new Date(`${date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + amount); return next.toISOString().slice(0, 10); };
    for (const row of receivableRows) {
      const outstanding = Math.max(Number(row.amount_centavos) - Number(row.amount_paid_centavos), 0); if (!outstanding) continue;
      const key = !row.due_date ? 'noDue' : row.due_date < today ? 'overdue' : row.due_date === today ? 'today' : row.due_date <= addDays(today, 7) ? 'week' : row.due_date <= monthEnd(today) ? 'month' : row.due_date <= addDays(today, 30) ? 'next30' : 'upcoming';
      const bucket = bucketMap[key]; bucket.count += 1; bucket.amount_centavos += outstanding; bucket.records.push({ ...moneyRow(row), outstanding_centavos: outstanding });
    }
    const receivables = buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, count: bucket.count, amount: toPesos(bucket.amount_centavos), clients: groupClients(bucket.records), records: bucket.records.map((row) => { const { outstanding_centavos, ...record } = row; return record; }) }));
    return { revenue: { from, to, proxy: true, total: toPesos(revenueRows.reduce((sum, row) => sum + Number(row.amount_paid_centavos), 0)), records: revenueRows.filter((row) => Number(row.amount_paid_centavos) > 0).map(moneyRow), months: months.map((month) => ({ ...month, value: toPesos(month.value), comparison: toPesos(month.comparison) })) }, receivables: { asOf: today, total: toPesos(buckets.reduce((sum, bucket) => sum + bucket.amount_centavos, 0)), categories: receivables } };
  },
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
