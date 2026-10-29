import { beforeAll, describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createClient } from '@libsql/client';
import { initSchema } from '../database/db.js';
import { validateInvoice } from '../services/validate.js';
import { sheetPricing } from '../../client/src/utils/sheetPricing.js';

let handle, dbPath;
beforeAll(async () => {
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'idt-text-')), 'data.db');
  process.env.TURSO_DATABASE_URL = 'file:' + dbPath;
  ({ handle } = await import('../handler.js'));
});
const call = (method, route, body) => handle({ method, path: route, body });
const payload = (extra = {}) => ({ invoice_prefix: 'SVI', date_issued: '2026-10-01', client_name: 'Acme', payment_status: 'Pending', amount_paid: 0,
  items: [{ product_service: 'IT Services', unit_cost: 200, quantity: 2 }, { product_service: 'Office Supplies', unit_cost: 50, quantity: 1 }], ...extra });
const texts = [
  { text: 'Project: Systems Upgrade', after_item: 0 },
  { text: 'Installation and configuration\nTesting included', after_item: 1 },
  { text: '30 days support included', after_item: 2 },
  { text: 'Service warranty applies', after_item: 2 },
];

describe('independent invoice nature-of-service text rows', () => {
  it('validates text and positions without changing item prices', () => {
    const result = validateInvoice(payload({ text_rows: texts }));
    expect(result.errors).toEqual({});
    expect(result.value.amount_centavos).toBe(45000);
    expect(result.value.text_rows).toEqual(texts);
    expect(validateInvoice(payload({ text_rows: [{ text: '   ', after_item: 0 }] })).errors.text_rows_0_text).toBeTruthy();
    expect(validateInvoice(payload({ text_rows: [{ text: 'test', after_item: 3 }] })).errors.text_rows_0_after_item).toBeTruthy();
    expect(validateInvoice(payload({ text_rows: [{ text: 'x'.repeat(2001), after_item: 0 }] })).errors.text_rows_0_text).toBeTruthy();
    expect(validateInvoice(payload({ text_rows: Array.from({ length: 51 }, () => ({ text: 'x', after_item: 0 })) })).errors.text_rows).toBeTruthy();
  });
  it('interleaves separate text rows in the sheet while leaving totals unchanged', () => {
    const invoice = payload({ text_rows: texts });
    const { rows, total } = sheetPricing(invoice);
    expect(rows.map((r) => r.d)).toEqual([texts[0].text, 'IT Services', texts[1].text, 'Office Supplies', texts[2].text, texts[3].text]);
    expect(rows.filter((r) => r.note)).toHaveLength(4);
    expect(rows.filter((r) => r.note).every((r) => !r.q && !r.u && !r.a)).toBe(true);
    expect(total).toBe(45000);
  });
  it('persists, reorders, exports, edits, and deletes supplementary rows', async () => {
    const created = await call('POST', '/api/invoices', payload({ text_rows: texts }));
    expect(created.status).toBe(201);
    expect(created.body.amount).toBe(450);
    expect(created.body.items).toHaveLength(2);
    expect(created.body.text_rows).toEqual(texts);
    const id = created.body.id;
    expect((await call('GET', '/api/invoices/' + id)).body.text_rows).toEqual(texts);
    const listing = await call('GET', '/api/invoices');
    expect(listing.body.data.find((x) => x.id === id).text_rows).toEqual(texts);
    const exported = await call('GET', '/api/invoices/export-data');
    expect(exported.body.data.find((x) => x.id === id).text_rows).toEqual(texts);
    const reordered = [{ text: 'Now first', after_item: 0 }, { text: 'Now between', after_item: 1 }];
    const changed = await call('PUT', '/api/invoices/' + id, payload({ text_rows: reordered }));
    expect(changed.status).toBe(200);
    expect(changed.body.text_rows).toEqual(reordered);
    const legacyEdit = await call('PUT', '/api/invoices/' + id, payload());
    expect(legacyEdit.status).toBe(200);
    expect(legacyEdit.body.text_rows).toEqual(reordered);
    const db = createClient({ url: 'file:' + dbPath });
    expect(Number((await db.execute({ sql: 'SELECT COUNT(*) n FROM invoice_text_rows WHERE invoice_id = ?', args: [id] })).rows[0].n)).toBe(2);
    expect((await call('DELETE', '/api/invoices/' + id)).status).toBe(204);
    expect(Number((await db.execute({ sql: 'SELECT COUNT(*) n FROM invoice_text_rows WHERE invoice_id = ?', args: [id] })).rows[0].n)).toBe(0);
    db.close();
  });
  it('creates the new table idempotently for an existing database', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'idt-upgrade-')), 'old.db');
    const c = createClient({ url: 'file:' + file });
    await initSchema(c);
    await initSchema(c);
    const names = (await c.execute('SELECT name FROM sqlite_master WHERE type = \'table\'')).rows.map((r) => r.name);
    expect(names).toContain('invoice_text_rows');
    c.close();
  });
});
