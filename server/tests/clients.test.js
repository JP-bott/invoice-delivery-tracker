import { describe, it, expect, beforeAll } from 'vitest';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { SCHEMA_STATEMENTS, CUSTOM_FIELD_STATEMENTS, ITEM_STATEMENTS, CLIENT_STATEMENTS, INVOICE_CLIENT_COLUMNS } from '../database/schema.js';
import { initSchema } from '../database/db.js';
import { findClient, matchClients, clientFields } from '../../client/src/utils/clients.js';

let handle;
beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = 'file:' + path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'idt-cl-')), 'test.db');
  ({ handle } = await import('../handler.js'));
});
const call = (method, url, body) => { const u = new URL(url, 'http://x'); return handle({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body }); };
const GET = (u) => call('GET', u); const POST = (u, b) => call('POST', u, b); const PUT = (u, b) => call('PUT', u, b); const DEL = (u) => call('DELETE', u);
const base = { invoice_prefix: 'SVI', date_issued: '2026-10-01', product_service: 'P', amount: 100, payment_status: 'Pending', amount_paid: 0 };
const inv = (extra = {}) => ({ ...base, client_name: 'Walk-in', ...extra });
const mk = async (body) => { const r = await POST('/api/clients', body); expect(r.status).toBe(201); return r.body; };

describe('clients API', () => {
  it('starts empty, then creates, lists (A to Z, ignoring case) and trims', async () => {
    expect((await GET('/api/clients')).body).toEqual([]);
    const acme = await mk({ name: '  Acme   Trading ', tin: ' 123-456-789-00000 ', address: ' 8th Floor,\n Cyber One  Building ' });
    expect(acme).toMatchObject({ name: 'Acme Trading', tin: '123-456-789-00000', address: '8th Floor, Cyber One Building' });
    await mk({ name: 'bravo Foods' }); await mk({ name: 'Cebu Hardware', tin: '123456789', address: '' });
    const list = (await GET('/api/clients')).body;
    expect(list.map((c) => c.name)).toEqual(['Acme Trading', 'bravo Foods', 'Cebu Hardware']);
    expect(list[1].tin).toBe(null); expect(list[1].address).toBe(null); expect(list[2].address).toBe(null);
  });
  it('validates name, TIN and address with per-field errors', async () => {
    const bad = async (body, field, status = 422) => { const r = await POST('/api/clients', body); expect(r.status).toBe(status); expect(r.body.error.fields[field]).toBeTruthy(); };
    await bad({ name: '   ' }, 'name'); await bad({}, 'name'); await bad({ name: 'X'.repeat(201) }, 'name');
    await bad({ name: 'Bad TIN', tin: 'ABC-123' }, 'tin'); await bad({ name: 'Short TIN', tin: '12345' }, 'tin'); await bad({ name: 'Long TIN', tin: '1'.repeat(15) }, 'tin');
    await bad({ name: 'Long address', address: 'x'.repeat(301) }, 'address');
    await bad({ name: ' acme   trading' }, 'name', 409); await bad({ name: 'ACME TRADING' }, 'name', 409);
    expect((await POST('/api/clients', { name: 'Fine', tin: '123 456 789' })).status).toBe(201);
  });
  it('edits, keeps its own name, rejects another client\'s name, clears optional fields, 404s unknown ids', async () => {
    const c = await mk({ name: 'Delta Pharma', tin: '111-222-333', address: 'Old street' });
    const same = await PUT(`/api/clients/${c.id}`, { name: 'delta pharma', tin: '', address: 'New street' });
    expect(same.status).toBe(200); expect(same.body).toMatchObject({ id: c.id, name: 'delta pharma', tin: null, address: 'New street' });
    expect((await PUT(`/api/clients/${c.id}`, { name: 'Acme Trading' })).status).toBe(409);
    expect((await PUT(`/api/clients/${c.id}`, { name: '' })).status).toBe(422);
    expect((await PUT('/api/clients/99999', { name: 'Nobody' })).status).toBe(404);
    expect((await PUT('/api/clients/abc', { name: 'Nobody' })).status).toBe(404);
    expect((await DEL('/api/clients/99999')).status).toBe(404);
    expect((await DEL(`/api/clients/${c.id}`)).status).toBe(204);
    expect((await GET('/api/clients')).body.some((x) => x.id === c.id)).toBe(false);
  });
  it('unknown routes and methods are 404', async () => {
    expect((await call('PATCH', '/api/clients')).status).toBe(404);
    expect((await GET('/api/clients/1/extra')).status).toBe(404);
  });
});

describe('client details saved with an invoice', () => {
  it('new invoices carry no details until given, and legacy requests keep working', async () => {
    const r = await POST('/api/invoices', inv());
    expect(r.status).toBe(201); expect(r.body.client_tin).toBe(null); expect(r.body.client_address).toBe(null); expect(r.body.client_name).toBe('Walk-in');
  });
  it('saves the TIN and address, returns them from get and list, and trims them', async () => {
    const c = await mk({ name: 'Echo Supplies', tin: '999-888-777-00000', address: 'Mactan, Cebu' });
    const r = await POST('/api/invoices', inv({ client_name: c.name, client_tin: ` ${c.tin} `, client_address: c.address }));
    expect(r.status).toBe(201); expect(r.body).toMatchObject({ client_name: 'Echo Supplies', client_tin: '999-888-777-00000', client_address: 'Mactan, Cebu' });
    expect((await GET(`/api/invoices/${r.body.id}`)).body).toMatchObject({ client_tin: '999-888-777-00000', client_address: 'Mactan, Cebu' });
    const row = (await GET('/api/invoices?q=Echo')).body.data[0];
    expect(row).toMatchObject({ client_name: 'Echo Supplies', client_tin: '999-888-777-00000', client_address: 'Mactan, Cebu' });
  });
  it('is a snapshot: editing or deleting the client never changes a saved invoice', async () => {
    const c = await mk({ name: 'Foxtrot Mills', tin: '555-444-333', address: 'Davao' });
    const r = await POST('/api/invoices', inv({ client_name: c.name, client_tin: c.tin, client_address: c.address }));
    await PUT(`/api/clients/${c.id}`, { name: 'Foxtrot Mills Inc.', tin: '555-444-333-00001', address: 'Davao City' });
    expect((await GET(`/api/invoices/${r.body.id}`)).body).toMatchObject({ client_name: 'Foxtrot Mills', client_tin: '555-444-333', client_address: 'Davao' });
    await DEL(`/api/clients/${c.id}`);
    expect((await GET(`/api/invoices/${r.body.id}`)).body).toMatchObject({ client_name: 'Foxtrot Mills', client_tin: '555-444-333', client_address: 'Davao' });
  });
  it('an update that leaves the details out keeps them; an empty string clears them; a new value replaces them', async () => {
    const r = await POST('/api/invoices', inv({ client_name: 'Golf', client_tin: '123-456-789', client_address: 'Pasig' }));
    const url = `/api/invoices/${r.body.id}`, keep = { ...inv({ client_name: 'Golf' }), invoice_prefix: '' };
    expect((await PUT(url, keep)).body).toMatchObject({ client_tin: '123-456-789', client_address: 'Pasig' });
    expect((await PUT(url, { ...keep, client_tin: '987-654-321', client_address: 'Makati' })).body).toMatchObject({ client_tin: '987-654-321', client_address: 'Makati' });
    const cleared = (await PUT(url, { ...keep, client_tin: '', client_address: '   ' })).body;
    expect(cleared.client_tin).toBe(null); expect(cleared.client_address).toBe(null);
  });
  it('rejects over-long details with field errors', async () => {
    const r = await POST('/api/invoices', inv({ client_tin: '1'.repeat(31), client_address: 'x'.repeat(301) }));
    expect(r.status).toBe(422); expect(r.body.error.fields.client_tin).toBeTruthy(); expect(r.body.error.fields.client_address).toBeTruthy();
  });
  it('the client-name filter, dashboard and clients filter list still work on the client name', async () => {
    expect((await GET('/api/invoices?client=Echo')).body.total).toBe(1);
    expect((await GET('/api/filters/clients')).body).toContain('Echo Supplies');
    expect((await GET('/api/dashboard/summary')).status).toBe(200);
  });
});

describe('schema upgrade', () => {
  it('adds the client table and invoice columns to an older database without touching its data, and is idempotent', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'idt-cl-mig-')), 'old.db'), c = createClient({ url: 'file:' + file });
    await c.batch([...SCHEMA_STATEMENTS, ...CUSTOM_FIELD_STATEMENTS, ...ITEM_STATEMENTS], 'write');
    await c.execute({ sql: `INSERT INTO invoices (date_issued,invoice_no,client_name,product_service,amount_centavos,amount_paid_centavos,payment_status,created_at,updated_at) VALUES ('2026-01-01','OLD-1','Old Client','Cement',12345,0,'Pending','t','t')`, args: [] });
    const cols = async () => (await c.execute('PRAGMA table_info(invoices)')).rows.map((r) => r.name);
    for (const name of INVOICE_CLIENT_COLUMNS) expect(await cols()).not.toContain(name);
    await initSchema(c); await initSchema(c);
    for (const name of INVOICE_CLIENT_COLUMNS) expect(await cols()).toContain(name);
    const row = (await c.execute('SELECT invoice_no, client_name, client_tin, client_address, amount_centavos FROM invoices')).rows[0];
    expect([row.invoice_no, row.client_name, row.client_tin, row.client_address, Number(row.amount_centavos)]).toEqual(['OLD-1', 'Old Client', null, null, 12345]);
    expect((await c.execute('SELECT COUNT(*) c FROM clients')).rows[0].c).toBe(0);
  });
  it('migrations/005 contains every client statement and column', () => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const sql = norm(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations/005_clients.sql'), 'utf8'));
    for (const s of CLIENT_STATEMENTS) expect(sql).toContain(norm(s) + ';');
    for (const name of INVOICE_CLIENT_COLUMNS) expect(sql).toContain(`ALTER TABLE invoices ADD COLUMN ${name} TEXT;`);
    expect(SCHEMA_STATEMENTS.join('')).not.toContain('client_tin'); // additive: the 001 table is untouched
  });
});

describe('client autocomplete helpers', () => {
  const list = [
    { id: 1, name: 'Acme Trading', tin: '123-456-789-00000', address: 'Pasig' },
    { id: 2, name: 'Island Pharma', tin: null, address: null },
    { id: 3, name: 'Mactan Acme Supplies', tin: '999-888-777', address: 'Cebu' },
    { id: 4, name: 'Zeta Corp', tin: '555-123-456', address: '' },
  ];
  it('finds a client by its exact name, ignoring case and extra spaces', () => {
    expect(findClient(list, '  acme   TRADING ').id).toBe(1);
    expect(findClient(list, 'Acme')).toBeUndefined(); expect(findClient(list, '')).toBeUndefined();
  });
  it('matches as you type and ranks name-starts, then word-starts, then contains, then TIN', () => {
    expect(matchClients(list, 'ac').map((c) => c.id)).toEqual([1, 3]);
    expect(matchClients(list, 'sup').map((c) => c.id)).toEqual([3]);
    expect(matchClients(list, 'ISLAND').map((c) => c.id)).toEqual([2]);
    expect(matchClients(list, 'zzz')).toEqual([]);
    expect(matchClients(list, '  ')).toBe(list);
  });
  it('finds a client by TIN digits, with or without hyphens, but only for numeric queries of 3+ digits', () => {
    expect(matchClients(list, '123456789').map((c) => c.id)).toEqual([1]);
    expect(matchClients(list, '123-456').map((c) => c.id)).toEqual([1, 4]);
    expect(matchClients(list, '12')).toEqual([]);
  });
  it('turns a client into the three invoice fields, blank when missing', () => {
    expect(clientFields(list[0])).toEqual({ client_name: 'Acme Trading', client_tin: '123-456-789-00000', client_address: 'Pasig' });
    expect(clientFields(list[1])).toEqual({ client_name: 'Island Pharma', client_tin: '', client_address: '' });
  });
});
