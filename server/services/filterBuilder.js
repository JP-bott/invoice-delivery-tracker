export const esc = (s) => String(s).replace(/[\\%_]/g, (m) => '\\' + m);
const like = (v) => `%${esc(v)}%`;
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// exact: dashboard dropdowns (exact match) vs invoice list (contains)
export function buildWhere(q = {}, { exact = false, excludeCancelled = false } = {}) {
  const w = [], a = [];
  if (excludeCancelled) w.push(`payment_status <> 'Cancelled'`);
  if (str(q.dateFrom)) { w.push('date_issued >= ?'); a.push(q.dateFrom); }
  if (str(q.dateTo)) { w.push('date_issued <= ?'); a.push(q.dateTo); }
  for (const [k, col] of [['client', 'client_name'], ['product', 'product_service']]) {
    if (!str(q[k])) continue;
    if (exact) { w.push(`${col} = ?`); a.push(q[k].trim()); }
    else { w.push(`${col} LIKE ? ESCAPE '\\'`); a.push(like(q[k].trim())); }
  }
  if (str(q.paymentStatus)) { w.push('payment_status = ?'); a.push(q.paymentStatus); }
  if (q.deliveryStatus === 'Pending') w.push('delivery_date IS NULL');
  if (q.deliveryStatus === 'Delivered') w.push('delivery_date IS NOT NULL');
  if (str(q.q)) {
    w.push(`(invoice_no LIKE ? ESCAPE '\\' OR cr_no LIKE ? ESCAPE '\\' OR client_name LIKE ? ESCAPE '\\' OR product_service LIKE ? ESCAPE '\\')`);
    a.push(...Array(4).fill(like(q.q.trim())));
  }
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', args: a };
}
