import { describe, it, expect, beforeAll } from 'vitest';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';

let handle;
beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = 'file:' + path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'idt-dash-')), 'test.db');
  ({ handle } = await import('../handler.js'));
});
const call = (method, url, body) => { const u = new URL(url, 'http://x'); return handle({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body }); };
const GET = (u) => call('GET', u); const POST = (u, b) => call('POST', u, b); const PUT = (u, b) => call('PUT', u, b); const DEL = (u) => call('DELETE', u);
const base = { invoice_prefix: 'SVI', date_issued: '2026-10-05', client_name: 'Beta', product_service: 'P', amount: 100, payment_status: 'Pending', amount_paid: 0 };
const inv = (x = {}) => ({ ...base, ...x });
const filters = async () => (await GET('/api/dashboard-filters')).body.filters;
const save = (list) => PUT('/api/dashboard-filters', { filters: list.map(({ key, enabled }) => ({ key, enabled })) });
let region, rush;

describe('dashboard filter settings', () => {
  it('defaults to Client and Product/Service, as before', async () => {
    const r = await GET('/api/dashboard-filters');
    expect(r.body.filters.map((f) => [f.key, f.enabled])).toEqual([['dateRange', true], ['client', true], ['product', true], ['paymentStatus', false], ['deliveryStatus', false]]);
    expect(r.body.max_enabled).toBe(8);
  });
  it('keeps date range mandatory even when settings try to hide it',async()=>{const list=await filters();const after=(await save(list.map(f=>({...f,enabled:false})))).body.filters;expect(after.find(f=>f.key==='dateRange')).toMatchObject({enabled:true,required:true,control:'select'});expect(after.find(f=>f.key==='dateRange').options.map(x=>x.value)).toEqual(['month','quarter','year']);});
  it('lists custom invoice fields as filters, off by default, with the right control', async () => {
    region = (await POST('/api/invoice-fields', { label: 'Region', input_type: 'dropdown', options: ['North', 'South', 'East'] })).body;
    rush = (await POST('/api/invoice-fields', { label: 'Rush', input_type: 'checkbox' })).body;
    const list = await filters();
    const reg = list.find((f) => f.key === `cf_${region.id}`);
    expect(reg).toMatchObject({ enabled: false, control: 'select', custom: true });
    expect(reg.options.map((o) => o.value)).toEqual(['North', 'South', 'East']);
    expect(list.find((f) => f.key === `cf_${rush.id}`).options.map((o) => o.value)).toEqual(['true', 'false']);
  });
  it('saves which filters are on and their order', async () => {
    const list = await filters();
    const want = [`cf_${region.id}`, 'client'];
    const next = [...want.map((key) => list.find((f) => f.key === key)), ...list.filter((f) => !want.includes(f.key))].map((f) => ({ ...f, enabled: want.includes(f.key) }));
    expect((await save(next)).status).toBe(200);
    const after = await filters();
    expect(after.slice(0, 2).map((f) => f.key)).toEqual(want);
    expect(after.filter((f) => f.enabled).map((f) => f.key)).toEqual(want);
  });
  it('validates the request and ignores unknown keys', async () => {
    expect((await PUT('/api/dashboard-filters', {})).status).toBe(422);
    expect((await PUT('/api/dashboard-filters', { filters: [{ key: 'client' }] })).status).toBe(422);
    const r = await PUT('/api/dashboard-filters', { filters: [{ key: 'nope', enabled: true }, { key: 'client', enabled: true }] });
    expect(r.status).toBe(200);
    expect(r.body.filters.some((f) => f.key === 'nope')).toBe(false);
  });
  it('limits the number of filters shown', async () => {
    for (let i = 0; i < 6; i++) await POST('/api/invoice-fields', { label: `Extra ${i}`, input_type: 'text' });
    const list = await filters();
    expect(list.length).toBeGreaterThan(8);
    expect((await save(list.map((f) => ({ ...f, enabled: true })))).status).toBe(422);
    expect((await save(list.map((f, i) => ({ ...f, enabled: i < 8 })))).status).toBe(200);
  });
  it('an archived field leaves the list and returns with its setting when restored', async () => {
    await save((await filters()).map((f) => ({ ...f, enabled: f.key === `cf_${region.id}` })));
    await DEL(`/api/invoice-fields/${region.id}`);
    expect((await filters()).some((f) => f.key === `cf_${region.id}`)).toBe(false);
    await POST(`/api/invoice-fields/${region.id}/restore`);
    expect((await filters()).find((f) => f.key === `cf_${region.id}`).enabled).toBe(true);
  });
});

describe('dashboard applies the chosen filters', () => {
  const count = async (q) => (await GET(`/api/dashboard/summary?${q}`)).body.totalInvoices;
  it('filters by custom fields, payment status and delivery status', async () => {
    expect((await POST('/api/invoices', inv({ custom_fields: { [region.id]: 'North' } }))).status).toBe(201);
    expect((await POST('/api/invoices', inv({ amount: 200, payment_status: 'Paid', amount_paid: 200, delivery_date: '2026-10-06', custom_fields: { [region.id]: 'South', [rush.id]: 'true' } }))).status).toBe(201);
    expect(await count(`cf_${region.id}=North`)).toBe(1);
    expect(await count(`cf_${region.id}=East`)).toBe(0);
    expect(await count(`cf_${rush.id}=true`)).toBe(1);
    expect(await count('paymentStatus=Paid')).toBe(1);
    expect(await count('paymentStatus=unpaid')).toBe(1);
    expect(await count('deliveryStatus=Delivered')).toBe(1);
    expect(await count('cf_999=nothing')).toBe(await count(''));
  });
  it('every dashboard endpoint accepts custom-field filters', async () => {
    for (const ep of ['invoice-trends', 'payment-distribution', 'analytics', 'top-clients', 'top-products', 'delivery-summary', 'recent-invoices', 'invoice-status']) {
      expect((await GET(`/api/dashboard/${ep}?cf_${region.id}=North&dateFrom=2026-10-01&dateTo=2026-10-31`)).status).toBe(200);
    }
  });
  it('the product filter matches invoices with several products on any of them', async () => {
    await POST('/api/invoices', inv({ product_service: undefined, items: [{ product_service: 'Cement', unit_cost: 10, quantity: 5 }, { product_service: 'IT Services', unit_cost: 50, quantity: 1 }] }));
    expect(await count('product=Cement')).toBe(1);
    expect(await count('product=IT%20Services')).toBe(1);
    expect(await count('product=Nothing')).toBe(0);
  });
});
