import { createClient } from '@libsql/client';
import { SCHEMA_STATEMENTS } from './schema.js';

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
  await c.batch(SCHEMA_STATEMENTS, 'write');
  const columns = await c.execute('PRAGMA table_info(invoices)');
  if (!columns.rows.some((column) => column.name === 'due_date')) await c.execute('ALTER TABLE invoices ADD COLUMN due_date TEXT');
  const invoiceColumns = new Map(columns.rows.map((column) => [column.name, column]));
  const additions = [
    ['total_sales_centavos', 'INTEGER NOT NULL DEFAULT 0'],
    ['vat_centavos', 'INTEGER NOT NULL DEFAULT 0'],
    ['net_of_vat_centavos', 'INTEGER NOT NULL DEFAULT 0'],
    ['withholding_centavos', 'INTEGER NOT NULL DEFAULT 0'],
    ['total_amount_due_centavos', 'INTEGER NOT NULL DEFAULT 0'],
    ['vat_type', "TEXT NOT NULL DEFAULT 'VATable'"],
    ['withholding_rate_basis_points', 'INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [name, definition] of additions) if (!invoiceColumns.has(name)) await c.execute(`ALTER TABLE invoices ADD COLUMN ${name} ${definition}`);
  await c.execute(`UPDATE invoices SET total_sales_centavos = amount_centavos, net_of_vat_centavos = amount_centavos, total_amount_due_centavos = amount_centavos WHERE total_sales_centavos = 0 AND amount_centavos > 0`);
  const marker = (await c.execute({ sql: 'SELECT value FROM schema_meta WHERE key = ?', args: ['product_options_seeded'] })).rows[0];
  if (!marker) {
    const now = new Date().toISOString();
    const defaults = ['Rice 50kg', 'Cement', 'Office Supplies', 'IT Services', 'Medical Gloves'];
    await c.batch([
      ...defaults.map((name) => ({ sql: 'INSERT OR IGNORE INTO product_options (name, created_at, updated_at) VALUES (?, ?, ?)', args: [name, now, now] })),
      { sql: 'INSERT INTO schema_meta (key, value) VALUES (?, ?)', args: ['product_options_seeded', '1'] },
    ], 'write');
  }
}

// Memoised per process/cold start; a failed attempt is retried on the next request.
export function ensureSchema() {
  if (!ready) ready = initSchema().catch((e) => { ready = undefined; throw e; });
  return ready;
}

export function resetDb() { client = undefined; ready = undefined; }
