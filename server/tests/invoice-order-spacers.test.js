import { describe, it, expect } from 'vitest';
import { orderedInvoiceLines, insertSupportingLine, appendProduct, moveProductGroup, moveSupportingLine, removeProduct, blankSpace } from '../../client/src/utils/invoiceLines.js';
import { sheetPricing } from '../../client/src/utils/sheetPricing.js';
import { validateInvoice } from '../services/validate.js';
import { initSchema } from '../database/db.js';
import { createClient } from '@libsql/client';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const products = [
  { product_service: 'ChatGPT Plus', is_title: true },
  { product_service: 'Other subscription', is_title: true },
];
const descriptions = [
  { after_item: 1, text: 'One year', is_priced: true, unit_cost: '1000', quantity: '1' },
  { after_item: 1, text: 'Five seats', is_priced: true, unit_cost: '1000', quantity: '5' },
  { after_item: 2, text: 'Second product note' },
];
const base = { date_issued: '2026-10-30', invoice_prefix: 'SI', client_name: 'Client', payment_status: 'Pending', amount_paid: 0 };
describe('invoice visual ordering, product groups and blank spaces', () => {
  it('preserves group ordering and moves a complete product section', () => {
    const moved = moveProductGroup(products, descriptions, 0, 1);
    expect(orderedInvoiceLines(moved.items, moved.text_rows).map(x => x.value.product_service || x.value.text))
      .toEqual(['Other subscription', 'Second product note', 'ChatGPT Plus', 'One year', 'Five seats']);
  });
  it('moves one description to another section while keeping its pricing', () => {
    const result = moveSupportingLine(products, descriptions, 0, 2);
    const moved = moveSupportingLine(result.items, result.text_rows, 0, 1);
    expect(moved.text_rows.find(x => x.text === 'One year').unit_cost).toBe('1000');
    expect(orderedInvoiceLines(moved.items, moved.text_rows).length).toBe(5);
  });
  it('inserts arbitrary blank rows as true empty invoice rows', () => {
    const combined = insertSupportingLine(products, descriptions, 1, blankSpace());
    const ordered = orderedInvoiceLines(combined.items, combined.text_rows);
    expect(ordered[2].kind).toBe('space');
    const sheet = sheetPricing(combined);
    expect(sheet.rows[2]).toMatchObject({ q: '', d: '', u: '', a: '', spacer: true });
    expect(sheet.total).toBe(600000);
  });
  it('validates and saves a blank row without requiring description text', () => {
    const fields = { ...base, items: [products[0]], text_rows: [{ ...blankSpace(), after_item: 1 }] };
    const result = validateInvoice(fields);
    expect(result.errors).toEqual({});
    expect(result.value.text_rows).toEqual([{ text: '', kind: 'space', after_item: 1 }]);
    expect(result.value.amount_centavos).toBe(0);
  });
  it('reassigns child descriptions when removing a product', () => {
    const next = removeProduct(products, descriptions, 0);
    expect(next.items).toHaveLength(1);
    expect(next.text_rows.every(x => x.after_item === 1)).toBe(true);
    expect(appendProduct(next.items, next.text_rows, { product_service: 'New', is_title: true }).items).toHaveLength(2);
  });
  it('adds the kind column idempotently without rewriting old data', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'invoice-spacer-')), 'test.db');
    const client = createClient({ url: 'file:' + file });
    await initSchema(client); await initSchema(client);
    const info = (await client.execute('PRAGMA table_info(invoice_text_rows)')).rows;
    expect(info.map(x => x.name)).toContain('kind');
    client.close();
  });
});
