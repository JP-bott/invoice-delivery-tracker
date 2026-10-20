export const esc = (s) => String(s).replace(/[\\%_]/g, (m) => '\\' + m);
const like = (v) => `%${esc(v)}%`;
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// exact: dashboard dropdowns (exact match) vs invoice list (contains)
// customFields: active field definitions. Only these ids are searched/filtered, so archived or unknown ids are ignored.
export function buildWhere(q = {}, { exact = false, excludeCancelled = false, customFields = [] } = {}) {
  const w = [], a = [];
  if (excludeCancelled) w.push(`payment_status <> 'Cancelled'`);
  if (str(q.dateFrom)) { w.push('date_issued >= ?'); a.push(q.dateFrom); }
  if (str(q.dateTo)) { w.push('date_issued <= ?'); a.push(q.dateTo); }
  for (const [k, col] of [['client', 'client_name'], ['product', 'product_service']]) {
    if (!str(q[k])) continue;
    if (exact) { w.push(`${col} = ?`); a.push(q[k].trim()); }
    else { w.push(`${col} LIKE ? ESCAPE '\\'`); a.push(like(q[k].trim())); }
  }
  if (q.paymentStatus === 'unpaid') w.push("payment_status IN ('Pending','Partially Paid')");
  else if (str(q.paymentStatus)) { w.push('payment_status = ?'); a.push(q.paymentStatus); }
  if (q.deliveryStatus === 'Pending') w.push('delivery_date IS NULL');
  if (q.deliveryStatus === 'Delivered') w.push('delivery_date IS NOT NULL');
  if (str(q.q)) {
    const searchable = customFields.filter((f) => f.input_type !== 'checkbox').map((f) => f.id);
    const inCustom = searchable.length
      ? ` OR EXISTS (SELECT 1 FROM invoice_custom_values cv WHERE cv.invoice_id = invoices.id AND cv.field_id IN (${searchable.map(() => '?').join(',')}) AND cv.value LIKE ? ESCAPE '\\')`
      : '';
    w.push(`(invoice_no LIKE ? ESCAPE '\\' OR cr_no LIKE ? ESCAPE '\\' OR client_name LIKE ? ESCAPE '\\' OR product_service LIKE ? ESCAPE '\\'${inCustom})`);
    a.push(...Array(4).fill(like(q.q.trim())), ...(searchable.length ? [...searchable, like(q.q.trim())] : []));
  }
  for (const f of customFields) {
    const v = str(q[`cf_${f.id}`]);
    if (!v) continue;
    const has = (cond, ...params) => { w.push(`EXISTS (SELECT 1 FROM invoice_custom_values cv WHERE cv.invoice_id = invoices.id AND cv.field_id = ? AND ${cond})`); a.push(f.id, ...params); };
    if (f.input_type === 'checkbox') {
      if (v === 'true') has(`cv.value = 'true'`);
      else if (v === 'false') { w.push(`NOT EXISTS (SELECT 1 FROM invoice_custom_values cv WHERE cv.invoice_id = invoices.id AND cv.field_id = ? AND cv.value = 'true')`); a.push(f.id); }
    } else if (f.input_type === 'dropdown' || f.input_type === 'date') has('cv.value = ? COLLATE NOCASE', v);
    else if (f.input_type === 'number') {
      const n = Number(v.replace(/,/g, ''));
      if (Number.isFinite(n)) has('CAST(cv.value AS REAL) = ?', n); else w.push('0');
    } else has(`cv.value LIKE ? ESCAPE '\\'`, like(v));
  }
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', args: a };
}
