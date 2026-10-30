import { describe, it, expect } from 'vitest';
import { createClient } from '@libsql/client';
import { priceInvoice, computeTotals } from '../../shared/pricing.js';
import { sheetPricing } from '../../client/src/utils/sheetPricing.js';
import { validateInvoice } from '../services/validate.js';
import { initSchema, resetDb } from '../database/db.js';
import { handle } from '../handler.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const product = { product_service: 'ChatGPT Plus', is_title: true, quantity: '1', unit_cost: '' };
const descriptions = [
  { text: '1 yr (Oct 30, 2026 - Oct 30, 2027)', after_item: 1, is_priced: true, quantity: '1', unit_cost: '1000' },
  { text: '1 yr (Nov 1, 2026 - Nov 1, 2027)', after_item: 1, is_priced: true, quantity: '5', unit_cost: '1000' },
];
const base = { date_issued: '2026-10-30', invoice_prefix: 'SI', client_name: 'Test', payment_status: 'Pending', amount_paid: 0 };

describe('invoice title rows and billable descriptions', () => {
  it('computes zero for a title and invoices supporting specifications exactly once', () => {
    const p = priceInvoice([product], descriptions);
    expect(p.ok).toBe(true);
    expect(p.lines[0].amount).toBe(0);
    expect(p.textLines.map(x => x.amount)).toEqual([100000, 500000]);
    expect(p.childrenByProduct).toEqual([600000]);
    expect(p.subtotal).toBe(600000);
    expect(computeTotals(p.subtotal, 'vatable', 0)).toMatchObject({ total: 600000, net: Math.round(600000 / 1.12) });
  });
  it('prints the same heading and detail row order in the three-column view', () => {
    const p = sheetPricing({ items: [product], text_rows: descriptions });
    expect(p.simplified).toBe(true);
    expect(p.total).toBe(600000);
    expect(p.rows).toMatchObject([
      { q: '', d: 'ChatGPT Plus', a: '', title: true },
      { q: '1', d: descriptions[0].text, a: '1,000.00', spec: true },
      { q: '5', d: descriptions[1].text, a: '5,000.00', spec: true },
    ]);
  });
  it('keeps ordinary products and unpriced notes backward compatible', () => {
    const p = priceInvoice([{ product_service: 'Regular', quantity: 2, unit_cost: 100 }], [{ text: 'support', after_item: 1 }]);
    expect(p.subtotal).toBe(20000);
    const sheet = sheetPricing({ items: [{ product_service: 'Regular', quantity: 2, unit_cost: 100 }], text_rows: [{ text: 'support', after_item: 1 }] });
    expect(sheet.simplified).toBe(false);
    expect(sheet.rows[1]).toMatchObject({ q: '', d: 'support', a: '', note: true });
  });
  it('validates priced description amount and drops hidden fields when unpriced', () => {
    const good = validateInvoice({ ...base, items: [product], text_rows: descriptions });
    expect(good.errors).toEqual({});
    expect(good.value.amount_centavos).toBe(600000);
    expect(good.value.text_rows[0].amount_centavos).toBe(100000);
    const invalid = validateInvoice({ ...base, items: [product], text_rows: [{ ...descriptions[0], quantity: 0, unit_cost: -1 }] });
    expect(invalid.errors.text_rows_0_quantity).toBeTruthy();
    expect(invalid.errors.text_rows_0_unit_cost).toBeTruthy();
    const off = validateInvoice({ ...base, items: [product], text_rows: [{ ...descriptions[0], is_priced: false }] });
    expect(off.errors).toEqual({});
    expect(off.value.amount_centavos).toBe(0);
    expect(off.value.text_rows[0].unit_cost_centavos).toBeUndefined();
  });
  it('saves, reloads, edits and preserves SI invoice numbering and priced rows', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'invoice-role-api-')), 'data.db');
    process.env.TURSO_DATABASE_URL = 'file:' + file;
    resetDb();
    const send = (method, route, body) => handle({ method, path: route, body });
    const created = await send('POST', '/api/invoices', { ...base, items: [product], text_rows: descriptions });
    expect(created.status).toBe(201);
    expect(created.body.invoice_no).toMatch(/^SI - /);
    expect(created.body.amount).toBe(6000);
    const id = created.body.id;
    const fresh = await send('GET', '/api/invoices/' + id);
    expect(fresh.body.items[0]).toMatchObject({ product_service: 'ChatGPT Plus', is_title: true });
    expect(fresh.body.text_rows[0]).toMatchObject({ is_priced: true, quantity: 1, unit_cost: 1000, amount: 1000 });
    const editing = await send('PUT', '/api/invoices/' + id, {
      ...base, items: [product],
      text_rows: [{ ...descriptions[0], is_priced: false }, descriptions[1]],
    });
    expect(editing.status).toBe(200);
    expect(editing.body.invoice_no).toBe(created.body.invoice_no);
    expect(editing.body.amount).toBe(5000);
    expect(editing.body.text_rows[0].is_priced).toBeUndefined();
    expect(editing.body.text_rows[0].amount).toBeUndefined();
    const db = createClient({ url: 'file:' + file });
    try {
      const row = (await db.execute({ sql: 'SELECT is_priced, unit_cost_centavos, amount_centavos FROM invoice_text_rows WHERE invoice_id = ? AND sort_order = 0', args: [id] })).rows[0];
      expect(Number(row.is_priced)).toBe(0);
      expect(row.unit_cost_centavos).toBeNull();
      expect(row.amount_centavos).toBeNull();
    } finally { db.close(); }
  });
  it('applies the additive migration twice without changing legacy rows', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'invoice-roles-')), 'data.db');
    const db = createClient({ url: 'file:' + file });
    try {
      await initSchema(db); await initSchema(db);
      const items = (await db.execute('PRAGMA table_info(invoice_items)')).rows.map(x => x.name);
      const texts = (await db.execute('PRAGMA table_info(invoice_text_rows)')).rows.map(x => x.name);
      expect(items).toContain('is_title');
      for (const name of ['is_priced', 'quantity', 'unit_cost_centavos', 'amount_centavos']) expect(texts).toContain(name);
    } finally { db.close(); }
  });
});
