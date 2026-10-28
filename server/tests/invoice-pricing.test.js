import { describe, it, expect, beforeAll } from 'vitest';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { SCHEMA_STATEMENTS, CUSTOM_FIELD_STATEMENTS, ITEM_STATEMENTS, ITEM_PRICING_COLUMNS, SEQUENCE_STATEMENTS, INVOICE_TERMS_COLUMN } from '../database/schema.js';
import { initSchema } from '../database/db.js';
import { validateInvoice } from '../services/validate.js';
import { parseUnitCost, parseQtyMilli, lineAmountCentavos, priceItems, computeTotals } from '../../shared/pricing.js';
import { splitInvoiceNo, sequenceOf, formatInvoiceNo, sheetInvoiceNo } from '../../shared/invoiceNumber.js';
import { sheetPricing } from '../../client/src/utils/sheetPricing.js';
import { sanitizeDecimal, deriveUnitCost } from '../../client/src/utils/items.js';

let handle, dbFile;
beforeAll(async () => {
  dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'idt-pricing-')), 'test.db');
  process.env.TURSO_DATABASE_URL = 'file:' + dbFile;
  ({ handle } = await import('../handler.js'));
});
const call = (method, url, body) => { const u = new URL(url, 'http://x'); return handle({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body }); };
const GET = (u) => call('GET', u); const POST = (u, b) => call('POST', u, b); const PUT = (u, b) => call('PUT', u, b); const DEL = (u) => call('DELETE', u);
const base = { date_issued: '2026-10-01', invoice_prefix: 'SVI', client_name: 'Acme', payment_status: 'Pending', amount_paid: 0 };
const inv = (extra = {}) => ({ ...base, ...extra });
const raw = () => createClient({ url: 'file:' + dbFile });

describe('line item maths', () => {
  it('parses unit costs and quantities strictly', () => {
    expect(parseUnitCost('1,250.5')).toBe(125050); expect(parseUnitCost('0')).toBe(0); expect(parseUnitCost(12.5)).toBe(1250);
    for (const bad of ['-1', '-0.01', 'abc', '1e3', '', '1.234', '.5', '1,25', ' ', null, undefined]) expect(parseUnitCost(bad)).toBe(null);
    expect(parseQtyMilli('2.5')).toBe(2500); expect(parseQtyMilli('1,000')).toBe(1000000);
    for (const bad of ['0', '0.000', '-2', '1.2345', 'x', '', '1000001']) expect(parseQtyMilli(bad)).toBe(null);
  });
  it('Line Item Amount = Unit Cost x Quantity, rounded half-up to the centavo', () => {
    expect(lineAmountCentavos(parseUnitCost('166.67'), parseQtyMilli('3'))).toBe(50001);
    expect(lineAmountCentavos(parseUnitCost('0.05'), parseQtyMilli('0.5'))).toBe(3); // 2.5 centavos -> 3
    expect(lineAmountCentavos(parseUnitCost('1250.50'), parseQtyMilli('2'))).toBe(250100);
    expect(lineAmountCentavos(100_000_000_000, 1_000_000_000)).toBe(100_000_000_000_000_000 / 1); // big values stay exact (BigInt)
  });
  it('Subtotal is the sum of the line amounts and any bad line invalidates it', () => {
    const p = priceItems([{ unit_cost: '1,250.50', quantity: '2' }, { unit_cost: '0.10', quantity: '0.5' }, { unit_cost: '99.99', quantity: '1' }]);
    expect(p.lines.map((l) => l.amount)).toEqual([250100, 5, 9999]); expect(p.subtotal).toBe(260104); expect(p.ok).toBe(true);
    const bad = priceItems([{ unit_cost: '10', quantity: '1' }, { unit_cost: '', quantity: '1' }]);
    expect(bad.ok).toBe(false); expect(bad.subtotal).toBe(null); expect(bad.lines[1].errors.unit_cost).toBeTruthy();
    expect(priceItems([]).ok).toBe(false);
  });
  it('rejects a line whose amount is too large', () => {
    expect(priceItems([{ unit_cost: '1000000000', quantity: '1000000' }]).ok).toBe(false);
  });
});

describe('existing VAT / withholding arithmetic is unchanged', () => {
  it('VATable: amount is VAT-inclusive, VAT is extracted at 12%', () => {
    expect(computeTotals(112000, 'vatable', 0)).toEqual({ total: 112000, net: 100000, vat: 12000, sV: 100000, sE: 0, sZ: 0, wht: 0, grand: 112000, has: true });
    const t = computeTotals(112000, 'vatable', 0.02); // withholding is on the net of VAT
    expect(t.wht).toBe(2000); expect(t.grand).toBe(110000);
  });
  it('rounds exactly as before (net = round(total/1.12), VAT = total - net)', () => {
    const t = computeTotals(50001, 'vatable', 0.05);
    expect(t.net).toBe(Math.round(50001 / 1.12)); expect(t.vat).toBe(50001 - t.net); expect(t.wht).toBe(Math.round(t.net * 0.05)); expect(t.net + t.vat).toBe(50001);
  });
  it('VAT-exempt and zero-rated sales add no VAT', () => {
    expect(computeTotals(100000, 'exempt', 0)).toMatchObject({ net: 100000, vat: 0, sE: 100000, grand: 100000 });
    expect(computeTotals(100000, 'zero', 0.01)).toMatchObject({ vat: 0, sZ: 100000, wht: 1000, grand: 99000 });
    expect(computeTotals(0, 'vatable', 0).has).toBe(false);
  });
});

describe('SVI / SI number parsing', () => {
  it('splits stored numbers for editing, including older formats', () => {
    expect(splitInvoiceNo('SVI - 001')).toEqual({ prefix: 'SVI', number: '001' }); expect(splitInvoiceNo('SI - 2026-001')).toEqual({ prefix: 'SI', number: '2026-001' });
    expect(splitInvoiceNo('SVI001')).toEqual({ prefix: 'SVI', number: '001' }); expect(splitInvoiceNo('VI00123')).toEqual({ prefix: 'VI', number: '00123' }); expect(splitInvoiceNo('INV-9')).toEqual({ prefix: '', number: 'INV-9' });
  });
});

describe('validation', () => {
  const v = (o) => validateInvoice({ ...base, ...o });
  const item = { product_service: 'A', unit_cost: '10', quantity: '2' };
  it('requires a unit cost and quantity on every line, keyed per row', () => {
    const e = v({ items: [item, { product_service: 'B', unit_cost: '', quantity: '1' }, { product_service: 'C', unit_cost: '-5', quantity: '-1' }, { product_service: 'D', unit_cost: 'abc', quantity: '' }] }).errors;
    expect(Object.keys(e).sort()).toEqual(['items_1_unit_cost', 'items_2_quantity', 'items_2_unit_cost', 'items_3_quantity', 'items_3_unit_cost']);
  });
  it('derives the amount from the items and ignores a submitted amount', () => {
    const r = v({ amount: 1, items: [item, { product_service: 'B', unit_cost: '0.25', quantity: '3' }] });
    expect(r.errors).toEqual({}); expect(r.value.amount_centavos).toBe(2075);
  });
  it('checks Amount Paid against the derived amount', () => {
    expect(v({ items: [item], payment_status: 'Paid', amount_paid: 20 }).errors).toEqual({});
    expect(v({ items: [item], payment_status: 'Paid', amount_paid: 19 }).errors.amount_paid).toBeTruthy();
    expect(v({ items: [item], payment_status: 'Partially Paid', amount_paid: 21 }).errors.amount_paid).toBeTruthy();
  });
  it('requires at least one line item and a valid number', () => {
    expect(v({ items: [] }).errors.product_service).toBeTruthy();
    expect(v({ items: [item], invoice_prefix: 'SVI' }).errors).toEqual({});
    for (const bad of [undefined, '', 'VI', 'INV']) expect(v({ items: [item], invoice_prefix: bad }).errors.invoice_prefix).toBeTruthy();
    expect(v({ items: [item], invoice_prefix: 'SI', invoice_no: 'SI - 0100', terms: '60-days' }).value).toMatchObject({ invoice_no: 'SI - 0100', terms: '30-days' });
  });
});

describe('invoice API: itemised pricing', () => {
  const items = [{ product_service: 'Cement', unit_cost: '1,250.50', quantity: '2' }, { product_service: 'IT Services', unit_cost: '99.99', quantity: '1.5' }];
  it('saves line amounts and an amount derived from them; reopening returns the same figures', async () => {
    const c = await POST('/api/invoices', inv({ items, amount: 5 }));
    expect(c.status).toBe(201);
    expect(c.body.items).toEqual([{ product_service: 'Cement', quantity: 2, unit_cost: 1250.5, amount: 2501 }, { product_service: 'IT Services', quantity: 1.5, unit_cost: 99.99, amount: 149.99 }]); // 99.99 x 1.5 = 149.985 -> 149.99
    expect(c.body.amount).toBe(2650.99);
    const g = (await GET(`/api/invoices/${c.body.id}`)).body;
    expect(g.amount).toBe(2650.99); expect(g.items).toEqual(c.body.items);
    expect((await GET('/api/invoices?pageSize=100')).body.data.find((r) => r.id === c.body.id).amount).toBe(2650.99);
    const db = raw();
    const stored = (await db.execute({ sql: 'SELECT amount_centavos a FROM invoices WHERE id = ?', args: [c.body.id] })).rows[0].a;
    const lines = (await db.execute({ sql: 'SELECT SUM(amount_centavos) s FROM invoice_items WHERE invoice_id = ?', args: [c.body.id] })).rows[0].s;
    expect(Number(stored)).toBe(Number(lines)); expect(Number(stored)).toBe(265099);
  });
  it('recalculates when unit cost or quantity change on edit', async () => {
    const c = await POST('/api/invoices', inv({ items }));
    const u = await PUT(`/api/invoices/${c.body.id}`, inv({ items: [{ ...items[0], quantity: '3' }, items[1], { product_service: 'Rice 50kg', unit_cost: '10', quantity: '4' }] }));
    expect(u.status).toBe(200); expect(u.body.amount).toBe(3751.5 + 149.99 + 40);
    expect(u.body.items.map((i) => i.amount)).toEqual([3751.5, 149.99, 40]);
  });
  it('a single item works, and a legacy payload (product_service + amount) is one item of quantity 1', async () => {
    const one = await POST('/api/invoices', inv({ items: [{ product_service: 'Cement', unit_cost: '500', quantity: '1' }] }));
    expect(one.body.amount).toBe(500);
    const legacy = await POST('/api/invoices', inv({ product_service: 'Cement', amount: '1,500.50' }));
    expect(legacy.body.amount).toBe(1500.5); expect(legacy.body.items).toEqual([{ product_service: 'Cement', quantity: 1, unit_cost: 1500.5, amount: 1500.5 }]);
    expect((await POST('/api/invoices', inv({ product_service: 'Cement', amount: 'abc' }))).body.error.fields.amount).toBeTruthy();
  });
  it('rejects negative, non-numeric and missing values without saving', async () => {
    const before = (await GET('/api/invoices?pageSize=100')).body.total;
    for (const it of [{ unit_cost: '-1', quantity: '1' }, { unit_cost: '1', quantity: '-1' }, { unit_cost: '', quantity: '1' }, { unit_cost: '1', quantity: '0' }, { unit_cost: '1e3', quantity: '1' }, { unit_cost: '1', quantity: 'x' }]) {
      const r = await POST('/api/invoices', inv({ items: [{ product_service: 'A', ...it }] }));
      expect(r.status).toBe(422);
    }
    expect((await GET('/api/invoices?pageSize=100')).body.total).toBe(before);
  });
  it('enforces Amount Paid against the derived amount', async () => {
    expect((await POST('/api/invoices', inv({ items, payment_status: 'Paid', amount_paid: 2650.99 }))).status).toBe(201);
    const bad = await POST('/api/invoices', inv({ items, payment_status: 'Paid', amount_paid: 2650 }));
    expect(bad.status).toBe(422); expect(bad.body.error.fields.amount_paid).toBeTruthy();
  });
});

describe('invoice API: SI / SVI running numbers and fixed terms', () => {
  const one = [{ product_service: 'A', unit_cost: '10', quantity: '1' }];
  const post = (prefix, extra = {}) => POST('/api/invoices', { ...base, invoice_prefix: prefix, items: one, ...extra });
  const next = async (prefix) => (await GET(`/api/invoices/next-number?prefix=${prefix}`)).body.number;
  const seqRow = async (prefix) => Number((await raw().execute({ sql: 'SELECT last_number n FROM invoice_sequences WHERE prefix = ?', args: [prefix] })).rows[0].n);
  it('numbers each type independently and stores "SI - 0001" / "SVI - 0001" style values', async () => {
    const si = await seqRow('SI'), svi = await seqRow('SVI'); // earlier tests in this file already saved invoices
    expect(await next('SI')).toBe(formatInvoiceNo('SI', si + 1)); expect(await next('SVI')).toBe(formatInvoiceNo('SVI', svi + 1));
    const a = await post('SI'), b = await post('SVI'), c = await post('SI'), d = await post('si'); // type is case-insensitive
    expect([a, b, c, d].map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect([a, b, c, d].map((r) => r.body.invoice_no)).toEqual([formatInvoiceNo('SI', si + 1), formatInvoiceNo('SVI', svi + 1), formatInvoiceNo('SI', si + 2), formatInvoiceNo('SI', si + 3)]);
    expect(a.body.invoice_no).toMatch(/^SI - \d{4,}$/);
    expect((await GET(`/api/invoices/${a.body.id}`)).body.invoice_no).toBe(a.body.invoice_no);
    expect(await next('SI')).toBe(formatInvoiceNo('SI', si + 4)); expect(await next('SVI')).toBe(formatInvoiceNo('SVI', svi + 2));
  });
  it('showing the next number consumes nothing, however often it is asked for', async () => {
    const before = [await seqRow('SI'), await seqRow('SVI')];
    for (let i = 0; i < 3; i++) { await next('SI'); await next('SVI'); }
    expect([await seqRow('SI'), await seqRow('SVI')]).toEqual(before);
    expect((await post('SI')).body.invoice_no).toBe(formatInvoiceNo('SI', before[0] + 1));
  });
  it('asks for a valid type: the suggestion needs SI or SVI, and so does a new invoice', async () => {
    for (const q of ['', 'prefix=VI', 'prefix=XX']) { const r = await GET(`/api/invoices/next-number?${q}`); expect(r.status).toBe(422); }
    for (const bad of [undefined, '', 'VI', 'SIX']) { const r = await post(bad); expect(r.status).toBe(422); expect(r.body.error.fields.invoice_prefix).toBeTruthy(); }
    expect((await call('POST', '/api/invoices/next-number', {})).status).toBe(404);
  });
  it('accepts a manually chosen number, advances only its sequence, and keeps terms fixed', async () => {
    const before = await seqRow('SI'), svi = await seqRow('SVI'), number = formatInvoiceNo('SI', before + 50);
    const r = await post('SI', { invoice_no: number, terms: 'COD' });
    expect(r.status).toBe(201); expect(r.body.invoice_no).toBe(number); expect(r.body.terms).toBe('30-days');
    expect(await seqRow('SI')).toBe(before + 50); expect(await seqRow('SVI')).toBe(svi);
    expect(await next('SI')).toBe(formatInvoiceNo('SI', before + 51));
  });
  it('allows changing an existing SI/SVI number without changing its type', async () => {
    const c = await post('SVI'), no = c.body.invoice_no, custom = formatInvoiceNo('SVI', (await seqRow('SVI')) + 30);
    const u = await PUT(`/api/invoices/${c.body.id}`, { ...base, items: one, invoice_prefix: 'SI', invoice_no: custom, terms: '90-days', remarks: 'edited' });
    expect(u.status).toBe(200); expect(u.body.invoice_no).toBe(custom); expect(u.body.terms).toBe('30-days'); expect(u.body.remarks).toBe('edited');
    expect(await next('SVI')).toBe(formatInvoiceNo('SVI', sequenceOf(custom, 'SVI') + 1));
    const unchanged = await PUT(`/api/invoices/${c.body.id}`, { ...base, items: one });
    expect(unchanged.status).toBe(200); expect(unchanged.body.invoice_no).toBe(custom);
    expect(no).not.toBe(custom);
  });
  it('rejects duplicate, mismatched, empty and invalid numbers', async () => {
    const a = await post('SI'), b = await post('SI'), before = await seqRow('SI');
    const duplicate = await post('SI', { invoice_no: a.body.invoice_no });
    expect(duplicate.status).toBe(409); expect(duplicate.body.error.fields.invoice_no).toBeTruthy();
    const editDuplicate = await PUT(`/api/invoices/${b.body.id}`, { ...base, items: one, invoice_no: a.body.invoice_no });
    expect(editDuplicate.status).toBe(409); expect((await GET(`/api/invoices/${b.body.id}`)).body.invoice_no).toBe(b.body.invoice_no);
    for (const invoice_no of ['SI - 0000', 'SI - abc', 'SVI - 9999', 'SI - 1.5', 'SI - 9007199254740993', '']) {
      const r = await post('SI', { invoice_no });
      expect(r.status).toBe(422); expect(r.body.error.fields.invoice_no).toBeTruthy();
    }
    expect(await seqRow('SI')).toBe(before);
  });
  it('a lower manual number does not reset the high-water mark for automatic allocation', async () => {
    const before = await seqRow('SI');
    const high = await post('SI', { invoice_no: formatInvoiceNo('SI', before + 3) });
    expect(high.status).toBe(201);
    const gap = await post('SI', { invoice_no: formatInvoiceNo('SI', before + 1) });
    expect(gap.status).toBe(201);
    expect(await seqRow('SI')).toBe(before + 3);
    expect((await post('SI')).body.invoice_no).toBe(formatInvoiceNo('SI', before + 4));
  });
  it('never reuses a number after its invoice is deleted or cancelled', async () => {
    const x = await post('SVI'), y = await post('SVI');
    expect((await DEL(`/api/invoices/${y.body.id}`)).status).toBe(204); // the highest one
    expect(await next('SVI')).toBe(formatInvoiceNo('SVI', sequenceOf(y.body.invoice_no, 'SVI') + 1));
    const z = await post('SVI'); expect(z.body.invoice_no).not.toBe(y.body.invoice_no); expect(sequenceOf(z.body.invoice_no, 'SVI')).toBe(sequenceOf(y.body.invoice_no, 'SVI') + 1);
    const cx = await PUT(`/api/invoices/${x.body.id}`, { ...base, items: one, payment_status: 'Cancelled' });
    expect(cx.status).toBe(200); expect(cx.body.invoice_no).toBe(x.body.invoice_no);
    expect(sequenceOf((await post('SVI')).body.invoice_no, 'SVI')).toBe(sequenceOf(z.body.invoice_no, 'SVI') + 1);
  });
  it('simultaneous saves get unique, gapless numbers and the two types stay independent', async () => {
    const siBefore = await seqRow('SI'), sviBefore = await seqRow('SVI');
    const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => post(i % 3 ? 'SI' : 'SVI')));
    expect(rs.map((r) => r.status)).toEqual(Array(12).fill(201));
    const nums = rs.map((r) => r.body.invoice_no);
    expect(new Set(nums).size).toBe(12);
    const of = (prefix, from) => nums.filter((x) => x.startsWith(prefix + ' ')).map((x) => sequenceOf(x, prefix)).sort((p, q) => p - q).map((v) => v - from);
    expect(of('SI', siBefore)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); expect(of('SVI', sviBefore)).toEqual([1, 2, 3, 4]);
  });
  it('pads to at least four digits and grows naturally past 9999', async () => {
    await raw().execute(`UPDATE invoice_sequences SET last_number = 9998 WHERE prefix = 'SI'`);
    expect([(await post('SI')).body.invoice_no, (await post('SI')).body.invoice_no, (await post('SI')).body.invoice_no]).toEqual(['SI - 9999', 'SI - 10000', 'SI - 10001']);
    expect(formatInvoiceNo('SVI', 7)).toBe('SVI - 0007');
  });
  it('catches the counter up when a number is already in use (nothing is duplicated, nothing is lost)', async () => {
    const db = raw(), taken = formatInvoiceNo('SVI', (await seqRow('SVI')) + 1);
    await db.execute({ sql: `INSERT INTO invoices (date_issued,invoice_no,client_name,product_service,amount_centavos,amount_paid_centavos,payment_status,created_at,updated_at) VALUES ('2026-01-01',?,'Imported','X',100,0,'Pending','t','t')`, args: [taken] });
    expect(await next('SVI')).not.toBe(taken); // the suggestion already skips it
    const count = async () => Number((await db.execute('SELECT COUNT(*) c FROM invoices')).rows[0].c);
    const before = await count(), r = await post('SVI');
    expect(r.status).toBe(201); expect(r.body.invoice_no).not.toBe(taken);
    expect(await count()).toBe(before + 1);
    expect(await seqRow('SVI')).toBe(sequenceOf(r.body.invoice_no, 'SVI'));
  });
  it('rolls the number back with the invoice when the save fails', async () => {
    const db = raw(), before = await seqRow('SI'), invoices = Number((await db.execute('SELECT COUNT(*) c FROM invoices')).rows[0].c);
    await db.execute(`CREATE TRIGGER IF NOT EXISTS t_fail BEFORE INSERT ON invoice_items WHEN NEW.product_service = 'EXPLODE' BEGIN SELECT RAISE(ABORT, 'boom'); END`);
    const r = await post('SI', { items: [{ product_service: 'EXPLODE', unit_cost: '1', quantity: '1' }] });
    await db.execute('DROP TRIGGER t_fail');
    expect(r.status).toBe(500);
    expect(await seqRow('SI')).toBe(before);
    expect(Number((await db.execute('SELECT COUNT(*) c FROM invoices')).rows[0].c)).toBe(invoices);
  });
  it('the database refuses duplicate numbers and any terms other than 30-days', async () => {
    const db = raw(), r = await post('SI');
    await expect_rejects(db.execute({ sql: `INSERT INTO invoices (date_issued,invoice_no,client_name,product_service,created_at,updated_at) VALUES ('2026-01-01',?,'C','P','t','t')`, args: [r.body.invoice_no.toLowerCase()] }), /UNIQUE/);
    await expect_rejects(db.execute({ sql: `UPDATE invoices SET terms = '60-days' WHERE id = ?`, args: [r.body.id] }), /CHECK/);
    await expect_rejects(db.execute({ sql: `UPDATE invoice_sequences SET last_number = -1 WHERE prefix = 'SI'` }), /CHECK/);
  });
  it('every saved and listed invoice reports terms 30-days', async () => {
    const list = (await GET('/api/invoices?pageSize=100')).body.data;
    expect(list.length).toBeGreaterThan(0); expect(list.every((x) => x.terms === '30-days')).toBe(true);
  });
});
async function expect_rejects(promise, re) { let msg = ''; try { await promise; } catch (e) { msg = String(e.message); } expect(msg).toMatch(re); }

describe('invoice numbering upgrade', () => {
  const insert = (c, no) => c.execute({ sql: `INSERT INTO invoices (date_issued,invoice_no,client_name,product_service,amount_centavos,amount_paid_centavos,payment_status,created_at,updated_at) VALUES ('2026-01-01',?,'C','P',100,0,'Pending','t','t')`, args: [no] });
  it('starts each type from its highest existing number, keeps every old number, and is idempotent', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'idt-seq-')), 'old.db'), c = createClient({ url: 'file:' + file });
    await c.batch([...SCHEMA_STATEMENTS, ...CUSTOM_FIELD_STATEMENTS, ...ITEM_STATEMENTS], 'write');
    const old = ['SI - 09878', 'SI - 0005', 'SVI - 0704', 'SVI- 0726', 'SVI001', 'VI00123', 'OLD-1', 'SI - 2026-001', 'SIGMA-9'];
    for (const no of old) await insert(c, no);
    expect((await c.execute('PRAGMA table_info(invoices)')).rows.map((r) => r.name)).not.toContain('terms');
    await initSchema(c); await initSchema(c);
    const seq = Object.fromEntries((await c.execute('SELECT prefix, last_number FROM invoice_sequences')).rows.map((r) => [r.prefix, Number(r.last_number)]));
    expect(seq).toEqual({ SI: 9878, SVI: 726 });
    expect((await c.execute('SELECT invoice_no FROM invoices ORDER BY id')).rows.map((r) => r.invoice_no)).toEqual(old);
    expect((await c.execute('SELECT DISTINCT terms FROM invoices')).rows.map((r) => r.terms)).toEqual(['30-days']);
  });
  it('a database with no SI / SVI numbers starts both sequences at 0001', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'idt-seq0-')), 'new.db'), c = createClient({ url: 'file:' + file });
    await initSchema(c);
    expect((await c.execute('SELECT prefix, last_number FROM invoice_sequences ORDER BY prefix')).rows.map((r) => [r.prefix, Number(r.last_number)])).toEqual([['SI', 0], ['SVI', 0]]);
  });
  it('migrations/006 contains the sequence table and the terms column', () => {
    const norm = (x) => x.replace(/\s+/g, ' ').trim();
    const sql = norm(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations/006_invoice_sequences_terms.sql'), 'utf8'));
    for (const st of SEQUENCE_STATEMENTS) expect(sql).toContain(norm(st) + ';');
    expect(sql).toContain(`ALTER TABLE invoices ADD COLUMN ${INVOICE_TERMS_COLUMN};`);
    expect(SCHEMA_STATEMENTS.join('')).not.toContain('terms'); // additive: the 001 table is untouched
  });
});

describe('invoice number helpers', () => {
  it('sheetInvoiceNo shows only "No. 0006" while the stored value keeps the type', () => {
    expect(sheetInvoiceNo('SI - 0006')).toBe('No. 0006'); expect(sheetInvoiceNo('SVI - 0013')).toBe('No. 0013');
    expect(sheetInvoiceNo('SVI- 0726')).toBe('No. 0726'); expect(sheetInvoiceNo('SVI001')).toBe('No. 001'); expect(sheetInvoiceNo('SI - 10000')).toBe('No. 10000');
    expect(sheetInvoiceNo('OLD-1')).toBe('No. OLD-1'); expect(sheetInvoiceNo('')).toBe('');
  });
  it('sequenceOf reads only plain SI/SVI + digits numbers of the asked type', () => {
    expect(sequenceOf('SI - 09878', 'SI')).toBe(9878); expect(sequenceOf('SVI- 0726', 'SVI')).toBe(726); expect(sequenceOf('svi - 12', 'SVI')).toBe(12);
    for (const [no, p] of [['SI - 0005', 'SVI'], ['SVI - 0005', 'SI'], ['SI - 2026-001', 'SI'], ['OLD-1', 'SI'], ['VI00123', 'SI'], ['SIGMA-9', 'SI']]) expect(sequenceOf(no, p)).toBe(null);
  });
});

describe('existing invoices keep working', () => {
  const insertLegacy = async (no, amountC, name = 'Old Product') => Number((await raw().execute({ sql: `INSERT INTO invoices (date_issued,invoice_no,client_name,product_service,amount_centavos,amount_paid_centavos,payment_status,created_at,updated_at) VALUES ('2026-01-01',?,?,?,?,0,'Pending','t','t')`, args: [no, 'Old Client', name, amountC] })).lastInsertRowid);
  it('an invoice with no item rows reads as one item of quantity 1 and keeps its number and amount', async () => {
    const id = await insertLegacy('VI00123', 123456);
    const g = (await GET(`/api/invoices/${id}`)).body;
    expect(g.invoice_no).toBe('VI00123'); expect(g.amount).toBe(1234.56); expect(g.items).toEqual([{ product_service: 'Old Product', quantity: 1, unit_cost: 1234.56, amount: 1234.56 }]);
  });
  it('editing keeps an older number exactly as stored, and re-prices from the items', async () => {
    const id = await insertLegacy('SVI00456', 50000);
    const u = await PUT(`/api/invoices/${id}`, { ...base, client_name: 'Old Client', items: [{ product_service: 'Old Product', unit_cost: '500', quantity: '1' }], remarks: 'edited' });
    expect(u.status).toBe(200); expect(u.body.invoice_no).toBe('SVI00456'); expect(u.body.amount).toBe(500); expect(u.body.remarks).toBe('edited'); expect(u.body.terms).toBe('30-days');
  });
  it('an older number cannot be changed through the API', async () => {
    const id = await insertLegacy('VI00789', 10000);
    const items = [{ product_service: 'Old Product', unit_cost: '100', quantity: '1' }];
    const r = await PUT(`/api/invoices/${id}`, { ...base, invoice_no: 'SI - 00790', invoice_prefix: 'SI', client_name: 'Old Client', items });
    expect(r.status).toBe(200); expect(r.body.invoice_no).toBe('VI00789');
    expect((await GET(`/api/invoices/${id}`)).body.invoice_no).toBe('VI00789');
  });
  it('item rows saved before unit costs existed keep the stored amount (null unit cost; a single item carries the amount)', async () => {
    const db = raw();
    const one = await insertLegacy('LEG-ONE', 25000, 'Cement'), two = await insertLegacy('LEG-TWO', 40000, 'Cement, Rice');
    await db.execute({ sql: 'INSERT INTO invoice_items (invoice_id, position, product_service, quantity) VALUES (?,0,?,?)', args: [one, 'Cement', 10] });
    for (const [i, name] of ['Cement', 'Rice'].entries()) await db.execute({ sql: 'INSERT INTO invoice_items (invoice_id, position, product_service, quantity) VALUES (?,?,?,?)', args: [two, i, name, 2] });
    expect((await GET(`/api/invoices/${one}`)).body.items).toEqual([{ product_service: 'Cement', quantity: 10, unit_cost: null, amount: 250 }]);
    const t = (await GET(`/api/invoices/${two}`)).body;
    expect(t.amount).toBe(400); expect(t.items.map((i) => [i.unit_cost, i.amount])).toEqual([[null, null], [null, null]]);
  });
});

describe('schema migration', () => {
  it('adds the pricing columns to an existing 003-era database without touching its data, and is idempotent', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'idt-mig-')), 'old.db'), c = createClient({ url: 'file:' + file });
    await c.batch([...SCHEMA_STATEMENTS, ...CUSTOM_FIELD_STATEMENTS, ...ITEM_STATEMENTS], 'write');
    await c.execute({ sql: `INSERT INTO invoices (date_issued,invoice_no,client_name,product_service,amount_centavos,amount_paid_centavos,payment_status,created_at,updated_at) VALUES ('2026-01-01','OLD-1','C','Cement',12345,0,'Pending','t','t')`, args: [] });
    await c.execute({ sql: 'INSERT INTO invoice_items (invoice_id, position, product_service, quantity) VALUES (1,0,?,?)', args: ['Cement', 3] });
    const cols = async () => (await c.execute('PRAGMA table_info(invoice_items)')).rows.map((r) => r.name);
    for (const name of ITEM_PRICING_COLUMNS) expect(await cols()).not.toContain(name);
    await initSchema(c); await initSchema(c);
    for (const name of ITEM_PRICING_COLUMNS) expect(await cols()).toContain(name);
    const row = (await c.execute('SELECT invoice_no, amount_centavos FROM invoices')).rows[0];
    expect([row.invoice_no, Number(row.amount_centavos)]).toEqual(['OLD-1', 12345]);
    const item = (await c.execute('SELECT product_service, quantity, unit_cost_centavos, amount_centavos FROM invoice_items')).rows[0];
    expect([item.product_service, Number(item.quantity), item.unit_cost_centavos, item.amount_centavos]).toEqual(['Cement', 3, null, null]);
  });
  it('migrations/004 contains every pricing column', () => {
    const sql = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations/004_invoice_item_pricing.sql'), 'utf8');
    for (const name of ITEM_PRICING_COLUMNS) expect(sql).toContain(`ALTER TABLE invoice_items ADD COLUMN ${name} INTEGER;`);
  });
});

describe('preview pricing (client) matches what is saved', () => {
  it('a new invoice in the form: one row per item, subtotal = sum of line amounts', () => {
    const p = sheetPricing({ items: [{ product_service: 'Cement', unit_cost: '1,250.50', quantity: '2' }, { product_service: 'IT Services', unit_cost: '99.99', quantity: '1.5' }, { product_service: '', unit_cost: '', quantity: '1' }] });
    expect(p.rows).toEqual([{ q: '2', d: 'Cement', u: '1,250.50', a: '2,501.00' }, { q: '1.5', d: 'IT Services', u: '99.99', a: '149.99' }]);
    expect(p.total).toBe(265099); expect(p.totalOnly).toBe(false);
  });
  it('a saved invoice previews the same total the API returns, for one and several items', async () => {
    for (const items of [[{ product_service: 'A', unit_cost: '333.33', quantity: '3' }], [{ product_service: 'A', unit_cost: '10.10', quantity: '3.333' }, { product_service: 'B', unit_cost: '0.07', quantity: '12' }, { product_service: 'C', unit_cost: '5,000', quantity: '0.001' }]]) {
      const c = (await POST('/api/invoices', inv({ items }))).body;
      const p = sheetPricing({ ...(await GET(`/api/invoices/${c.id}`)).body, amount: '9,999.99' }); // a stale amount string must not matter
      expect(p.total / 100).toBe(c.amount); expect(p.rows).toHaveLength(items.length);
    }
  });
  it('older invoices show their stored amount: derived unit cost for one item, total only for several', () => {
    expect(sheetPricing({ product_service: 'Old', amount: '500.00', items: [{ product_service: 'Old', quantity: 1, unit_cost: null }] }).rows).toEqual([{ q: '1', d: 'Old', u: '500.00', a: '500.00' }]);
    const many = sheetPricing({ amount: '400.00', items: [{ product_service: 'A', quantity: 2, unit_cost: null }, { product_service: 'B', quantity: 2, unit_cost: null }] });
    expect(many.total).toBe(40000); expect(many.totalOnly).toBe(true); expect(many.rows.map((r) => r.a)).toEqual(['', '']);
  });
});

describe('form helpers', () => {
  it('sanitizeDecimal blocks minus signs, exponents, letters and extra decimals', () => {
    expect(sanitizeDecimal('-12.5', 2)).toBe('12.5'); expect(sanitizeDecimal('1e3', 2)).toBe('13'); expect(sanitizeDecimal('1.2.3', 2)).toBe('1.23'); expect(sanitizeDecimal('1,250.567', 2)).toBe('1250.56'); expect(sanitizeDecimal('2.5555', 3)).toBe('2.555'); expect(sanitizeDecimal('abc', 2)).toBe('');
  });
  it('deriveUnitCost offers a unit cost only when it reproduces the stored amount exactly', () => {
    expect(deriveUnitCost(500, 1)).toBe('500.00'); expect(deriveUnitCost(250, 10)).toBe('25.00'); expect(deriveUnitCost(500, 3)).toBe(''); expect(deriveUnitCost(100, 0)).toBe('');
  });

});
