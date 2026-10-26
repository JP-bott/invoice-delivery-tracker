import { createClient } from '@libsql/client';
import { SCHEMA_STATEMENTS, CUSTOM_FIELD_STATEMENTS, ITEM_STATEMENTS, ITEM_PRICING_COLUMNS, CLIENT_STATEMENTS, INVOICE_CLIENT_COLUMNS, SEQUENCE_STATEMENTS, SEQUENCE_PREFIXES, INVOICE_TERMS_COLUMN, PAYMENT_TIMELINE_STATEMENTS } from './schema.js';
import { sequenceOf } from '../../shared/invoiceNumber.js';
import { seedStages } from '../services/paymentTimelineService.js';

const AUTO_DUE_DATE_MIGRATION = 'due_date_from_delivery_v1';

let client;
let ready;

function configError(message) {
  return Object.assign(new Error(message), { status: 503, code: 'DB_NOT_CONFIGURED' });
}

export function getDb() {
  if (!client) {
    const onVercel = Boolean(process.env.VERCEL);
    const url = process.env.TURSO_DATABASE_URL || (onVercel ? '' : 'file:./local.db');
    if (!url) throw configError('Database is not configured: set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN');
    if (onVercel && url.startsWith('file:')) throw configError('A local file database cannot persist on Vercel: use a libsql:// Turso URL');
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  }
  return client;
}

// Idempotent (CREATE ... IF NOT EXISTS), one round trip. Never drops or alters existing data.
export async function initSchema(c = getDb()) {
  await c.batch([...SCHEMA_STATEMENTS, ...CUSTOM_FIELD_STATEMENTS, ...ITEM_STATEMENTS, ...CLIENT_STATEMENTS, ...SEQUENCE_STATEMENTS, ...PAYMENT_TIMELINE_STATEMENTS], 'write');
  const columns = await c.execute('PRAGMA table_info(invoices)');
  if (!columns.rows.some((column) => column.name === 'due_date')) await c.execute('ALTER TABLE invoices ADD COLUMN due_date TEXT');
  for (const name of INVOICE_CLIENT_COLUMNS) if (!columns.rows.some((column) => column.name === name)) await c.execute(`ALTER TABLE invoices ADD COLUMN ${name} TEXT`);
  if (!columns.rows.some((column) => column.name === 'terms')) await c.execute(`ALTER TABLE invoices ADD COLUMN ${INVOICE_TERMS_COLUMN}`);
  // Recalculate previously manual due dates once; the marker and update are atomic.
  await c.batch([
    { sql: `UPDATE invoices SET due_date = CASE
        WHEN delivery_date IS NOT NULL AND delivery_date <> '' THEN date(delivery_date, '+30 days')
        ELSE NULL END WHERE NOT EXISTS (SELECT 1 FROM schema_meta WHERE key = ?)`, args: [AUTO_DUE_DATE_MIGRATION] },
    { sql: "INSERT OR IGNORE INTO schema_meta (key, value) VALUES (?, '1')", args: [AUTO_DUE_DATE_MIGRATION] },
  ], 'write');
  await seedSequences(c);
  const itemColumns = new Set((await c.execute('PRAGMA table_info(invoice_items)')).rows.map((column) => column.name));
  for (const name of ITEM_PRICING_COLUMNS) if (!itemColumns.has(name)) await c.execute(`ALTER TABLE invoice_items ADD COLUMN ${name} INTEGER`);
  const marker = (await c.execute({ sql: 'SELECT value FROM schema_meta WHERE key = ?', args: ['product_options_seeded'] })).rows[0];
  if (!marker) {
    const now = new Date().toISOString();
    const defaults = ['Rice 50kg', 'Cement', 'Office Supplies', 'IT Services', 'Medical Gloves'];
    await c.batch([
      ...defaults.map((name) => ({ sql: 'INSERT OR IGNORE INTO product_options (name, created_at, updated_at) VALUES (?, ?, ?)', args: [name, now, now] })),
      { sql: 'INSERT INTO schema_meta (key, value) VALUES (?, ?)', args: ['product_options_seeded', '1'] },
    ], 'write');
  }
  await seedStages(c);
}

// Highest number ever stored for a type (null when it has none). Numbers that are not plain SI/SVI + digits are ignored.
export async function highestAssigned(c, prefix) {
  const rows = (await c.execute({ sql: 'SELECT invoice_no FROM invoices WHERE invoice_no LIKE ?', args: [`${prefix}%`] })).rows;
  let max = 0;
  for (const r of rows) max = Math.max(max, sequenceOf(r.invoice_no, prefix) ?? 0);
  return max;
}

// One row per type, created once from the invoices already saved (the numbers in use are kept as they are, nothing is renumbered).
async function seedSequences(c) {
  const have = new Set((await c.execute('SELECT prefix FROM invoice_sequences')).rows.map((r) => r.prefix));
  for (const prefix of SEQUENCE_PREFIXES) {
    if (!have.has(prefix)) await c.execute({ sql: 'INSERT OR IGNORE INTO invoice_sequences (prefix, last_number) VALUES (?, ?)', args: [prefix, await highestAssigned(c, prefix)] });
  }
}

// Memoised per process/cold start; a failed attempt is retried on the next request.
export function ensureSchema() {
  if (!ready) ready = initSchema().catch((e) => { ready = undefined; throw e; });
  return ready;
}

export function resetDb() { client = undefined; ready = undefined; }
