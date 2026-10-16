import { getDb, initSchema } from './db.js';
await initSchema();
const clients = ['Acme Trading', 'Visayas Foods', 'Cebu Hardware', 'Mactan Supplies', 'Island Pharma'];
const prods = ['Rice 50kg', 'Cement', 'Office Supplies', 'IT Services', 'Medical Gloves'];
const stats = ['Paid', 'Paid', 'Partially Paid', 'Pending', 'Cancelled'];
const now = new Date(); let n = 0;
for (let i = 1; i <= 40; i++) {
  const d = new Date(now.getTime() - i * 4 * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
  const amt = ((i * 7919) % 90000 + 5000) * 100 + (i % 4) * 25, st = stats[i % 5];
  const paid = st === 'Paid' ? amt : st === 'Partially Paid' ? Math.floor(amt / 3) : 0;
  const del = i % 3 ? new Date(Date.parse(d) + 3 * 86400000).toISOString().slice(0, 10) : null;
  const ts = new Date().toISOString();
  const r = await getDb().execute({
    sql: `INSERT OR IGNORE INTO invoices (date_issued,invoice_no,cr_no,client_name,product_service,amount_centavos,amount_paid_centavos,payment_status,delivery_date,remarks,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [d, `INV-${String(i).padStart(3, '0')}`, i % 2 ? `CR-${i}` : null, clients[i % 5], prods[(i * 3) % 5], amt, paid, st, del, null, ts, ts],
  });
  n += r.rowsAffected;
}
console.log(`Seeded ${n} new invoices`);
