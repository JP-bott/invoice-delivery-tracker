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
}

// Memoised per process/cold start; a failed attempt is retried on the next request.
export function ensureSchema() {
  if (!ready) ready = initSchema().catch((e) => { ready = undefined; throw e; });
  return ready;
}

export function resetDb() { client = undefined; ready = undefined; }
