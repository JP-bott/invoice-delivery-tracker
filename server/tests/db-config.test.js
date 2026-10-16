import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { getDb, resetDb } from '../database/db.js';
import { SCHEMA_STATEMENTS } from '../database/schema.js';

const keep = { ...process.env };
afterEach(() => { process.env = { ...keep }; resetDb(); });

describe('database configuration on Vercel', () => {
  it('refuses to start without TURSO_DATABASE_URL', () => {
    process.env.VERCEL = '1'; delete process.env.TURSO_DATABASE_URL;
    expect(() => getDb()).toThrow(/not configured/);
  });
  it('rejects a local file database', () => {
    process.env.VERCEL = '1'; process.env.TURSO_DATABASE_URL = 'file:./local.db';
    expect(() => getDb()).toThrow(/cannot persist/);
  });
});

describe('migration file', () => {
  it('contains every schema statement', () => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const sql = norm(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations/001_init.sql'), 'utf8'));
    for (const s of SCHEMA_STATEMENTS) expect(sql).toContain(norm(s) + ';');
  });
});
