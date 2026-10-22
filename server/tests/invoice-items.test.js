import { describe, it, expect, beforeAll } from 'vitest';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { ITEM_STATEMENTS, SCHEMA_STATEMENTS } from '../database/schema.js';
import { validateInvoice } from '../services/validate.js';
import { itemsOf, itemsSummary, formatQty } from '../../client/src/utils/items.js';

let handle, dbFile;
beforeAll(async () => {
  dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'idt-items-')), 'test.db');
  process.env.TURSO_DATABASE_URL = 'file:' + dbFile;
  ({ handle } = await import('../handler.js'));
});
const call = (method, url, body) => { const u = new URL(url, 'http://x'); return handle({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body }); };
const GET = (u) => call('GET', u); const POST = (u, b) => call('POST', u, b); const PUT = (u, b) => call('PUT', u, b); const DEL = (u) => call('DELETE', u);
const base = { invoice_prefix: 'SVI', date_issued: '2026-10-01', client_name: 'Acme', amount: 500, payment_status: 'Pending', amount_paid: 0 };
const inv = (extra = {}) => ({ ...base, ...extra });
const two = [{ product_service: 'Cement', unit_cost: '30', quantity: '10' }, { product_service: 'IT Services', unit_cost: '80', quantity: '2.5' }]; // 300 + 200 = 500 (matches base)

describe('item validation', () => {
  const v = (o) => validateInvoice({ ...base, ...o });
  it('accepts several items and builds the product summary', () => {
    const r = v({ items: two });
    expect(r.errors).toEqual({});
    expect(r.value.items).toEqual([{ product_service: 'Cement', quantity: 10, unit_cost_centavos: 3000, amount_centavos: 30000 }, { product_service: 'IT Services', quantity: 2.5, unit_cost_centavos: 8000, amount_centavos: 20000 }]);
    expect(r.value.amount_centavos).toBe(50000);
    expect(r.value.product_service).toBe('Cement, IT Services');
  });
  it('treats a lone product_service as one item with quantity 1', () => {
    expect(v({ product_service: 'P' }).value.items).toEqual([{ product_service: 'P', quantity: 1, unit_cost_centavos: 50000, amount_centavos: 50000 }]);
  });
  it('flags missing products and bad quantities per row', () => {
    const e = v({ items: [{ product_service: '', unit_cost: '1', quantity: '0' }, { product_service: 'A', unit_cost: '1', quantity: '1.2345' }, { product_service: 'B', unit_cost: '1', quantity: '2' }] }).errors;
    expect(Object.keys(e).sort()).toEqual(['items_0_product_service', 'items_0_quantity', 'items_1_quantity']);
    expect(v({}).errors.product_service).toBeTruthy();
    expect(v({ items: [] }).errors.product_service).toBeTruthy();
    expect(v({ items: Array.from({ length: 31 }, () => ({ product_service: 'A', unit_cost: 1, quantity: 1 })) }).errors.product_service).toMatch(/At most 30/);
  });
});

describe('invoice items API', () => {
  it('saves, returns and replaces items in order', async () => {
    const created = await POST('/api/invoices', inv({ items: two }));
    expect(created.status).toBe(201);
    expect(created.body.items).toEqual([{ product_service: 'Cement', quantity: 10, unit_cost: 30, amount: 300 }, { product_service: 'IT Services', quantity: 2.5, unit_cost: 80, amount: 200 }]);
    expect(created.body.amount).toBe(500);
    expect(created.body.product_service).toBe('Cement, IT Services');
    const upd = await PUT(`/api/invoices/${created.body.id}`, inv({ items: [{ product_service: 'Rice 50kg', unit_cost: '100', quantity: 3 }], amount_paid: 0 }));
    expect(upd.status).toBe(200);
    expect(upd.body.items).toEqual([{ product_service: 'Rice 50kg', quantity: 3, unit_cost: 100, amount: 300 }]);
    expect(upd.body.amount).toBe(300);
    expect(upd.body.product_service).toBe('Rice 50kg');
    expect((await GET(`/api/invoices/${created.body.id}`)).body.items).toHaveLength(1);
  });
  it('returns items in the list and the product filter still matches any item', async () => {
    const c = await POST('/api/invoices', inv({ items: [{ product_service: 'Zebra Crossing Paint', unit_cost: '50', quantity: 4 }, { product_service: 'Brushes', unit_cost: '37.50', quantity: 8 }] }));
    const list = (await GET('/api/invoices?product=Brushes')).body;
    expect(list.data.map((r) => r.id)).toContain(c.body.id);
    expect(list.data.find((r) => r.id === c.body.id).items).toHaveLength(2);
  });
  it('rejects invalid items with row-keyed errors', async () => {
    const r = await POST('/api/invoices', inv({ items: [{ product_service: 'A', unit_cost: '5', quantity: 0 }] }));
    expect(r.status).toBe(422);
    expect(r.body.error.fields.items_0_quantity).toBeTruthy();
  });
  it('still accepts the older single product_service payload', async () => {
    const r = await POST('/api/invoices', inv({ product_service: 'Legacy Payload' }));
    expect(r.status).toBe(201);
    expect(r.body.items).toEqual([{ product_service: 'Legacy Payload', quantity: 1, unit_cost: 500, amount: 500 }]);
  });
  it('reads invoices saved before line items existed as one item, quantity 1', async () => {
    const db = createClient({ url: 'file:' + dbFile });
    const r = await db.execute({ sql: `INSERT INTO invoices (date_issued,invoice_no,client_name,product_service,amount_centavos,amount_paid_centavos,payment_status,created_at,updated_at) VALUES ('2026-01-01','OLD-ITEMS','Old Client','Old Product',50000,0,'Pending','t','t')`, args: [] });
    const got = await GET(`/api/invoices/${Number(r.lastInsertRowid)}`);
    expect(got.body.items).toEqual([{ product_service: 'Old Product', quantity: 1, unit_cost: 500, amount: 500 }]);
  });
  it('filter suggestions list single product names, not combined summaries', async () => {
    const names = (await GET('/api/filters/products')).body;
    expect(names).toContain('Cement'); expect(names).toContain('IT Services'); expect(names).toContain('Old Product');
    expect(names).not.toContain('Cement, IT Services');
  });
  it('deleting an invoice removes its items', async () => {
    const c = await POST('/api/invoices', inv({ items: two }));
    expect((await DEL(`/api/invoices/${c.body.id}`)).status).toBe(204);
    const db = createClient({ url: 'file:' + dbFile });
    expect(Number((await db.execute({ sql: 'SELECT COUNT(*) c FROM invoice_items WHERE invoice_id = ?', args: [c.body.id] })).rows[0].c)).toBe(0);
  });
});

describe('client item helpers', () => {
  it('summarises and falls back for older records', () => {
    expect(itemsSummary({ items: two })).toBe('Cement × 10, IT Services × 2.5');
    expect(itemsSummary({ items: [{ product_service: 'Cement', quantity: 1 }] })).toBe('Cement');
    expect(itemsSummary({ product_service: 'Old' })).toBe('Old');
    expect(itemsOf({ items: [{ product_service: ' ', quantity: 2 }] })).toEqual([]);
    expect(formatQty('1,000')).toBe('1,000'); expect(formatQty('0')).toBe('');
  });
});

describe('items migration file', () => {
  it('contains every item statement', () => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const sql = norm(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations/003_invoice_items.sql'), 'utf8'));
    for (const s of ITEM_STATEMENTS) expect(sql).toContain(norm(s) + ';');
    expect(SCHEMA_STATEMENTS.join('')).not.toContain('invoice_items'); // additive: invoices table untouched
  });
});
