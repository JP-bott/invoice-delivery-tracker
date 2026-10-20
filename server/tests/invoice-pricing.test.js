import { describe, it, expect, beforeAll } from 'vitest';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { SCHEMA_STATEMENTS, CUSTOM_FIELD_STATEMENTS, ITEM_STATEMENTS, ITEM_PRICING_COLUMNS } from '../database/schema.js';
import { initSchema } from '../database/db.js';
import { validateInvoice } from '../services/validate.js';
import { parseUnitCost, parseQtyMilli, lineAmountCentavos, priceItems, computeTotals } from '../../shared/pricing.js';
import { normalizeInvoiceNo, splitInvoiceNo } from '../../shared/invoiceNumber.js';
import { sheetPricing } from '../../client/src/utils/sheetPricing.js';
import { sanitizeDecimal, deriveUnitCost } from '../../client/src/utils/items.js';
import { invoiceNoFor } from '../../client/src/utils/invoiceNo.js';

let handle, dbFile;
beforeAll(async () => {
  dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'idt-pricing-')), 'test.db');
  process.env.TURSO_DATABASE_URL = 'file:' + dbFile;
  ({ handle } = await import('../handler.js'));
});
const call = (method, url, body) => { const u = new URL(url, 'http://x'); return handle({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body }); };
const GET = (u) => call('GET', u); const POST = (u, b) => call('POST', u, b); const PUT = (u, b) => call('PUT', u, b);
const base = { date_issued: '2026-10-01', invoice_prefix: 'SVI', client_name: 'Acme', payment_status: 'Pending', amount_paid: 0 };
let n = 0; const inv = (extra = {}) => ({ ...base, invoice_no: `P-${++n}`, ...extra });
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

describe('SVI / SI number format', () => {
  const ok = (typed, prefix, want) => expect(normalizeInvoiceNo(typed, prefix)).toEqual({ value: want });
  it('applies the prefix to a bare number', () => { ok('001', 'SVI', 'SVI - 001'); ok('2026-001', 'SVI', 'SVI - 2026-001'); ok('001', 'SI', 'SI - 001'); ok('2026-001', 'SI', 'SI - 2026-001'); });
  it('keeps a complete number without duplicating the prefix', () => { ok('SVI - 001', 'SVI', 'SVI - 001'); ok('SI - 2026-001', 'SI', 'SI - 2026-001'); ok('SVI - 001', '', 'SVI - 001'); ok('SI - 001', undefined, 'SI - 001'); });
  it('prevents duplicate prefixes', () => { ok('SI - SI - 001', 'SI', 'SI - 001'); ok('SVI - SVI - 001', 'SVI', 'SVI - 001'); ok('SVI SVI 001', '', 'SVI - 001'); });
  it('trims, collapses whitespace, and normalizes separators and case of the prefix', () => {
    ok('  001  ', 'SVI', 'SVI - 001'); ok('svi-001', '', 'SVI - 001'); ok('si001', '', 'SI - 001'); ok('SI   -   2026 - 001', 'SI', 'SI - 2026-001'); ok('SVI–001', '', 'SVI - 001');
  });
  it('treats a word that merely starts with SI as the number, not a prefix', () => { ok('SIGMA-1', 'SI', 'SI - SIGMA-1'); });
  it('rejects a missing, mismatched, mixed or malformed number', () => {
    for (const [t, p] of [['', 'SVI'], ['   ', 'SI'], ['SVI', 'SVI'], ['SVI - ', ''], ['001', ''], ['SI - 1', 'SVI'], ['SVI - SI - 1', ''], ['0 1', 'SI'], ['SI - #1', 'SI'], ['001', 'VI'], [null, 'SVI']]) expect(normalizeInvoiceNo(t, p).error).toBeTruthy();
  });
  it('never saves the literal [No.] placeholder', () => { expect(normalizeInvoiceNo('[No.]', 'SVI').error).toBeTruthy(); });
  it('splits stored numbers for editing, including older formats', () => {
    expect(splitInvoiceNo('SVI - 001')).toEqual({ prefix: 'SVI', number: '001' }); expect(splitInvoiceNo('SI - 2026-001')).toEqual({ prefix: 'SI', number: '2026-001' });
    expect(splitInvoiceNo('SVI001')).toEqual({ prefix: 'SVI', number: '001' }); expect(splitInvoiceNo('VI00123')).toEqual({ prefix: 'VI', number: '00123' }); expect(splitInvoiceNo('INV-9')).toEqual({ prefix: '', number: 'INV-9' });
  });
});

describe('validation', () => {
  const v = (o) => validateInvoice({ ...base, invoice_no: '1', ...o });
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
    expect(v({ items: [item], invoice_no: '', invoice_prefix: 'SVI' }).errors.invoice_no).toBeTruthy();
    expect(v({ items: [item], invoice_no: '5', invoice_prefix: undefined }).errors.invoice_no).toBeTruthy();
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
    const u = await PUT(`/api/invoices/${c.body.id}`, inv({ invoice_no: c.body.invoice_no, items: [{ ...items[0], quantity: '3' }, items[1], { product_service: 'Rice 50kg', unit_cost: '10', quantity: '4' }] }));
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

describe('invoice API: SVI/SI numbers', () => {
  const one = [{ product_service: 'A', unit_cost: '10', quantity: '1' }];
  const post = (no, prefix) => POST('/api/invoices', { ...base, invoice_no: no, invoice_prefix: prefix, items: one });
  it('stores the standardized format', async () => {
    for (const [no, prefix, want] of [['0001', 'SVI', 'SVI - 0001'], ['2026-0002', 'SVI', 'SVI - 2026-0002'], ['0003', 'SI', 'SI - 0003'], ['2026-0004', 'SI', 'SI - 2026-0004'], [' SI - SI - 0005 ', 'SI', 'SI - 0005'], ['svi-0006', '', 'SVI - 0006'], ['SVI - SVI - 0007', 'SVI', 'SVI - 0007']]) {
      const r = await post(no, prefix);
      expect(r.status).toBe(201); expect(r.body.invoice_no).toBe(want);
      expect((await GET(`/api/invoices/${r.body.id}`)).body.invoice_no).toBe(want);
    }
  });
  it('rejects an unusable number and a prefix mismatch', async () => {
    for (const [no, prefix] of [['', 'SVI'], ['SVI', 'SVI'], ['0100', ''], ['SI - 0100', 'SVI'], ['0100', 'VI'], ['[No.]', 'SVI']]) {
      const r = await post(no, prefix); expect(r.status).toBe(422); expect(r.body.error.fields.invoice_no).toBeTruthy();
    }
  });
  it('treats differently typed versions of the same number as duplicates', async () => {
    expect((await post('0200', 'SVI')).status).toBe(201);
    for (const [no, prefix] of [['SVI - 0200', ''], ['svi-0200', ''], ['0200', 'SVI'], [' 0200 ', 'SVI']]) expect((await post(no, prefix)).status).toBe(409);
    expect((await post('0200', 'SI')).status).toBe(201); // a different prefix is a different number
  });
});

describe('existing invoices keep working', () => {
  const insertLegacy = async (no, amountC, name = 'Old Product') => Number((await raw().execute({ sql: `INSERT INTO invoices (date_issued,invoice_no,client_name,product_service,amount_centavos,amount_paid_centavos,payment_status,created_at,updated_at) VALUES ('2026-01-01',?,?,?,?,0,'Pending','t','t')`, args: [no, 'Old Client', name, amountC] })).lastInsertRowid);
  it('an invoice with no item rows reads as one item of quantity 1 and keeps its number and amount', async () => {
    const id = await insertLegacy('VI00123', 123456);
    const g = (await GET(`/api/invoices/${id}`)).body;
    expect(g.invoice_no).toBe('VI00123'); expect(g.amount).toBe(1234.56); expect(g.items).toEqual([{ product_service: 'Old Product', quantity: 1, unit_cost: 1234.56, amount: 1234.56 }]);
  });
  it('editing keeps an unchanged older number exactly as stored, and re-prices from the items', async () => {
    const id = await insertLegacy('SVI00456', 50000);
    const u = await PUT(`/api/invoices/${id}`, { ...base, invoice_no: 'SVI00456', invoice_prefix: '', client_name: 'Old Client', items: [{ product_service: 'Old Product', unit_cost: '500', quantity: '1' }], remarks: 'edited' });
    expect(u.status).toBe(200); expect(u.body.invoice_no).toBe('SVI00456'); expect(u.body.amount).toBe(500); expect(u.body.remarks).toBe('edited');
  });
  it('changing an older number applies the standard format; an invalid change is rejected', async () => {
    const id = await insertLegacy('VI00789', 10000);
    const items = [{ product_service: 'Old Product', unit_cost: '100', quantity: '1' }];
    const bad = await PUT(`/api/invoices/${id}`, { ...base, invoice_no: 'VI00790', invoice_prefix: 'VI', client_name: 'Old Client', items });
    expect(bad.status).toBe(422); expect(bad.body.error.fields.invoice_no).toBeTruthy();
    expect((await GET(`/api/invoices/${id}`)).body.invoice_no).toBe('VI00789');
    const good = await PUT(`/api/invoices/${id}`, { ...base, invoice_no: '00790', invoice_prefix: 'SI', client_name: 'Old Client', items });
    expect(good.status).toBe(200); expect(good.body.invoice_no).toBe('SI - 00790');
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
  it('invoiceNoFor keeps an unchanged existing number, otherwise standardizes', () => {
    const form = { id: 1, original_invoice_no: 'SVI00123', invoice_prefix: 'SVI', invoice_number: '00123' };
    expect(invoiceNoFor(form)).toEqual({ value: 'SVI00123', unchanged: true });
    expect(invoiceNoFor({ ...form, invoice_number: '00124' })).toEqual({ value: 'SVI - 00124' });
    expect(invoiceNoFor({ ...form, invoice_prefix: 'SI' })).toEqual({ value: 'SI - 00123' });
    expect(invoiceNoFor({ invoice_prefix: 'SI', invoice_number: 'SI - SI - 9' })).toEqual({ value: 'SI - 9' });
    expect(invoiceNoFor({ invoice_prefix: 'SVI', invoice_number: '' }).error).toBeTruthy();
  });
});
