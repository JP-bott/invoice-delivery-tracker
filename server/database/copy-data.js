// Copies existing invoices from a source SQLite/libSQL DB into the target (Turso) DB.
// Non-destructive: INSERT OR IGNORE, never deletes or overwrites. Ids are preserved.
// Usage: node --env-file=.env server/database/copy-data.js [--dry-run]
import { createClient } from '@libsql/client';
import { initSchema } from './db.js';
import { INVOICE_COLUMNS as BASE_COLUMNS, INVOICE_CLIENT_COLUMNS } from './schema.js';

const dry = process.argv.includes('--dry-run');
const srcUrl = process.env.SOURCE_DATABASE_URL || 'file:./local.db';
const dstUrl = process.env.TURSO_DATABASE_URL;
if (!dstUrl) { console.error('Set TURSO_DATABASE_URL (target) first.'); process.exit(1); }
if (srcUrl === dstUrl) { console.error('Source and target are the same database.'); process.exit(1); }

const src = createClient({ url: srcUrl, authToken: process.env.SOURCE_AUTH_TOKEN || undefined });
const dst = createClient({ url: dstUrl, authToken: process.env.TURSO_AUTH_TOKEN || undefined });

// Client TIN/address exist only in sources that have been upgraded; an older source simply has none to copy.
const have = new Set((await src.execute('PRAGMA table_info(invoices)')).rows.map((r) => r.name));
const INVOICE_COLUMNS = [...BASE_COLUMNS, ...INVOICE_CLIENT_COLUMNS.filter((c) => have.has(c))];
const rows = (await src.execute(`SELECT ${INVOICE_COLUMNS.join(',')} FROM invoices ORDER BY id`)).rows;
console.log(`Source rows: ${rows.length}`);
if (dry) { console.log('Dry run: nothing written.'); process.exit(0); }

await initSchema(dst);
const sql = `INSERT OR IGNORE INTO invoices (${INVOICE_COLUMNS.join(',')}) VALUES (${INVOICE_COLUMNS.map(() => '?').join(',')})`;
let inserted = 0;
for (let i = 0; i < rows.length; i += 50) {
  const results = await dst.batch(rows.slice(i, i + 50).map((r) => ({ sql, args: INVOICE_COLUMNS.map((c) => r[c]) })), 'write');
  inserted += results.reduce((n, r) => n + r.rowsAffected, 0);
}
console.log(`Inserted ${inserted}, skipped ${rows.length - inserted} (id or invoice number already present).`);
