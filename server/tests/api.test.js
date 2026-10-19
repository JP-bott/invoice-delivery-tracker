import { describe, it, expect, beforeAll } from 'vitest';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
import { toCentavos } from '../services/money.js';
import { validateInvoice } from '../services/validate.js';
import { range } from '../../client/src/utils/dates.js';
import { formatAmount } from '../../client/src/utils/money.js';
import { computeInvoiceTotals } from '../../shared/invoiceTotals.js';

let handle;
beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = 'file:' + path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'idt-')), 'test.db');
  ({ handle } = await import('../handler.js'));
});
const call = (method, url, body) => { const u = new URL(url, 'http://x'); return handle({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body }); };
const GET = (u) => call('GET', u); const POST = (u, b) => call('POST', u, b); const PUT = (u, b) => call('PUT', u, b); const DEL = (u) => call('DELETE', u);
const base = { date_issued: '2026-10-01', invoice_no: 'INV-001', client_name: 'A', product_service: 'P', amount: 1250.75, payment_status: 'Pending', amount_paid: 0 };

describe('money', () => {
  it('converts safely', () => { expect(toCentavos(1250.75)).toBe(125075); expect(toCentavos('0.1')).toBe(10); });
  it('formats editable display values on blur', () => {
    expect(formatAmount('100')).toBe('100.00');
    expect(formatAmount('1500')).toBe('1,500.00');
    expect(formatAmount('25000.5')).toBe('25,000.50');
    expect(formatAmount('1000000')).toBe('1,000,000.00');
    expect(formatAmount('')).toBe('');
  });
  it('rejects 3 decimals and float drift', () => { expect(() => toCentavos('1.001')).toThrow(); expect(() => toCentavos(0.1 + 0.2)).toThrow(); });
});
describe('invoice totals', () => {
  it('calculates VAT-inclusive totals in centavos', () => {
    expect(computeInvoiceTotals({ amount: '1,120.00' })).toMatchObject({ netOfVat: 1000, vat: 120, totalAmountDue: 1120 });
    expect(computeInvoiceTotals({ amount: 100 })).toMatchObject({ netOfVat: 89.29, vat: 10.71 });
  });
  it('supports exempt, zero-rated, withholding, zero and invalid values', () => {
    expect(computeInvoiceTotals({ amount: 100, vatType: 'VAT-Exempt' })).toMatchObject({ vat: 0, vatExemptSales: 100, totalAmountDue: 100 });
    expect(computeInvoiceTotals({ amount: 100, vatType: 'Zero-Rated', withholdingRate: 5 })).toMatchObject({ vat: 0, zeroRatedSales: 100, withholdingTax: 5, totalAmountDue: 95 });
    expect(computeInvoiceTotals({ amount: 0 })).toMatchObject({ totalSales: 0, totalAmountDue: 0 });
    expect(computeInvoiceTotals({ amount: 'not-a-number' })).toMatchObject({ totalSales: 0, totalAmountDue: 0 });
  });
});
describe('validation', () => {
  const v = (o) => validateInvoice({ ...base, ...o }).errors;
  it('status vs paid', () => {
    expect(v({ amount_paid: 5 }).amount_paid).toBeTruthy();
    expect(v({ payment_status: 'Partially Paid', amount_paid: 0 }).amount_paid).toBeTruthy();
    expect(v({ payment_status: 'Partially Paid', amount_paid: 10 }).amount_paid).toBeUndefined();
    expect(v({ payment_status: 'Paid', amount_paid: 10 }).amount_paid).toBeTruthy();
    expect(v({ payment_status: 'Paid', amount_paid: 1250.75 }).amount_paid).toBeUndefined();
    expect(v({ payment_status: 'Cancelled', amount_paid: 10 }).amount_paid).toBeUndefined();
  });
  it('delivery before issue', () => expect(v({ delivery_date: '2026-09-01' }).delivery_date).toBeTruthy());
});
describe('invoices API', () => {
  it('CRUD + duplicates', async () => {
    const c = await POST('/api/invoices', base); expect(c.status).toBe(201);
    expect(c.body.outstanding).toBe(1250.75); expect(c.body.deliveryStatus).toBe('Pending');
    for (const n of ['inv-001', ' INV-001 ']) expect((await POST('/api/invoices', { ...base, invoice_no: n })).status).toBe(409);
    const o = await POST('/api/invoices', { ...base, invoice_no: 'INV-002' });
    expect((await PUT(`/api/invoices/${o.body.id}`, { ...base, invoice_no: 'inv-001' })).status).toBe(409);
    expect((await GET('/api/invoices/9999')).status).toBe(404);
    expect((await DEL(`/api/invoices/${o.body.id}`)).status).toBe(204);
  });
  it('validation errors are 422 with fields', async () => {
    const r = await POST('/api/invoices', { ...base, invoice_no: '' }); expect(r.status).toBe(422); expect(r.body.error.fields.invoice_no).toBeTruthy();
  });
  it('list filters, whitelist, wildcard escape', async () => {
    expect((await GET('/api/invoices?sortBy=amount;DROP')).status).toBe(400);
    expect((await GET('/api/invoices?sortBy=constructor')).status).toBe(400);
    expect((await GET('/api/invoices?q=%25')).body.total).toBe(0);
    expect((await GET('/api/invoices?q=inv-001&paymentStatus=Pending')).body.total).toBe(1);
  });
  it('dashboard summary', async () => {
    const s = (await GET('/api/dashboard/summary')).body;
    expect(s.totalInvoices).toBe(1); expect(s.pendingPayments).toBe(1250.75);
  });
  it('dashboard invoice status groups unpaid invoices by issue date', async () => {
    const overdue = await POST('/api/invoices', { ...base, invoice_no: 'INV-OVERDUE', date_issued: '2026-09-30', amount: 200, amount_paid: 50, payment_status: 'Partially Paid' });
    const incoming = await POST('/api/invoices', { ...base, invoice_no: 'INV-INCOMING', date_issued: '2026-11-01', amount: 300 });
    const status = (await GET('/api/dashboard/invoice-status?dateFrom=2026-10-01&dateTo=2026-10-31')).body;
    expect(status.buckets.overdue).toEqual({ value: 15000, count: 1 });
    expect(status.buckets.dueMonth).toEqual({ value: 125075, count: 1 });
    expect(status.buckets.incoming).toEqual({ value: 30000, count: 1 });
    await DEL(`/api/invoices/${overdue.body.id}`);
    await DEL(`/api/invoices/${incoming.body.id}`);
  });
  it('persists due dates and classifies receivables without overlap', async () => {
    const overdue = await POST('/api/invoices', { ...base, invoice_no: 'INV-DUE-OVER', date_issued: '2026-09-01', due_date: '2026-10-15', amount: 200 });
    const later = await POST('/api/invoices', { ...base, invoice_no: 'INV-DUE-LATER', date_issued: '2026-10-01', due_date: '2026-11-20', amount: 300, client_name: 'B' });
    expect(overdue.body.due_date).toBe('2026-10-15');
    const analytics = (await GET('/api/dashboard/analytics?asOf=2026-10-16&dateFrom=2026-10-01&dateTo=2026-10-31')).body;
    const records = analytics.receivables.categories.flatMap((category) => category.records);
    expect(records.map((record) => record.invoice_no)).toContain('INV-DUE-OVER');
    expect(records.map((record) => record.invoice_no)).toContain('INV-DUE-LATER');
    expect(new Set(records.map((record) => record.invoice_no)).size).toBe(records.length);
    await DEL(`/api/invoices/${overdue.body.id}`);
    await DEL(`/api/invoices/${later.body.id}`);
  });
  it('non-numeric ids and unknown endpoints are 404', async () => {
    expect((await GET('/api/invoices/abc')).status).toBe(404);
    expect((await DEL('/api/invoices/abc')).status).toBe(404);
    expect((await GET('/api/dashboard/nope')).status).toBe(404);
    expect((await GET('/api/dashboard/constructor')).status).toBe(404);
    expect((await GET('/api/nothing')).status).toBe(404);
  });
  it('dashboard excludes Cancelled except distribution and recent list', async () => {
    expect((await POST('/api/invoices', { ...base, invoice_no: 'INV-CXL', amount: 500, payment_status: 'Cancelled' })).status).toBe(201);
    expect((await GET('/api/dashboard/summary')).body.totalInvoices).toBe(1);
    expect((await GET('/api/dashboard/payment-distribution')).body.find((d) => d.status === 'Cancelled').count).toBe(1);
    expect((await GET('/api/dashboard/recent-invoices')).body.some((r) => r.invoice_no === 'INV-CXL')).toBe(true);
  });
  it('paginates, persists, and lists filter options', async () => {
    const r = (await GET('/api/invoices?pageSize=10&page=1&sortBy=amount&sortDir=asc')).body;
    expect(r.total).toBeGreaterThanOrEqual(2); expect(r.pageSize).toBe(10);
    expect((await GET('/api/filters/clients')).body).toContain('A');
    expect((await GET('/api/filters/products')).body).toContain('P');
  });
  it('accepts formatted amounts without changing numeric storage', async () => {
    const r = await POST('/api/invoices', { ...base, invoice_no: 'SVI-FMT', amount: '1,500.50', amount_paid: '0.00' });
    expect(r.status).toBe(201);
    expect(r.body.amount).toBe(1500.5);
    expect(r.body.outstanding).toBe(1500.5);
  });
  it('generates sequential numbers and stores invoice totals', async () => {
    const next = await GET('/api/invoices/next-number');
    const created = await POST('/api/invoices', { ...base, auto_number: true, invoice_no: '', amount: '1,120.00', vat_type: 'VATable', withholding_rate: 5 });
    expect(created.status).toBe(201);
    expect(created.body.invoice_no).toBe(next.body.invoice_no);
    expect(created.body).toMatchObject({ total_sales: 1120, vat: 120, net_of_vat: 1000, withholding_tax: 50, total_amount_due: 1070, vat_type: 'VATable', withholding_rate: 5 });
    expect((await GET('/api/invoices/next-number')).body.invoice_no).not.toBe(next.body.invoice_no);
  });
  it('keeps dashboard metrics synchronized through invoice lifecycle changes', async () => {
    const query = 'dateFrom=2026-10-15&dateTo=2026-10-20';
    const before = (await GET(`/api/dashboard/summary?${query}`)).body;
    const created = await POST('/api/invoices', { ...base, date_issued: '2026-10-16', invoice_no: 'SVI-SYNC-00123', product_service: 'Sync Service', amount: '1,000.00', amount_paid: 0 });
    expect(created.status).toBe(201);
    let summary = (await GET(`/api/dashboard/summary?${query}`)).body;
    expect(summary.totalInvoices).toBe(before.totalInvoices + 1);
    expect(summary.totalValue).toBeCloseTo(before.totalValue + 1000);
    const updated = await PUT(`/api/invoices/${created.body.id}`, { ...base, date_issued: '2026-10-16', invoice_no: 'VI00123', product_service: 'Updated Service', amount: '2,000.00', amount_paid: '2,000.00', payment_status: 'Paid' });
    expect(updated.status).toBe(200);
    summary = (await GET(`/api/dashboard/summary?${query}`)).body;
    expect(summary.totalValue).toBeCloseTo(before.totalValue + 2000);
    expect(summary.totalCollected).toBeCloseTo(before.totalCollected + 2000);
    expect((await GET('/api/invoices?q=VI00123&product=Updated%20Service&paymentStatus=Paid')).body.total).toBe(1);
    expect((await DEL(`/api/invoices/${created.body.id}`)).status).toBe(204);
    summary = (await GET(`/api/dashboard/summary?${query}`)).body;
    expect(summary.totalInvoices).toBe(before.totalInvoices);
    expect(summary.totalValue).toBeCloseTo(before.totalValue);
  });
});
describe('product options API', () => {
  it('lists defaults and supports CRUD with duplicate protection', async () => {
    expect((await GET('/api/products')).body.map((p) => p.name)).toContain('Rice 50kg');
    const created = await POST('/api/products', { name: '  Custom Service  ' });
    expect(created.status).toBe(201); expect(created.body.name).toBe('Custom Service');
    expect((await POST('/api/products', { name: 'custom service' })).status).toBe(409);
    const updated = await PUT(`/api/products/${created.body.id}`, { name: 'Updated Service' });
    expect(updated.status).toBe(200); expect(updated.body.name).toBe('Updated Service');
    expect((await DEL(`/api/products/${created.body.id}`)).status).toBe(204);
  });
  it('rejects empty product options', async () => {
    expect((await POST('/api/products', { name: '   ' })).status).toBe(422);
  });
});
describe('date range (Asia/Manila)', () => {
  it('uses Manila date late in UTC evening', () => {
    const now = new Date('2026-12-31T17:00:00Z');
    expect(range('month', now)).toEqual({ dateFrom: '2027-01-01', dateTo: '2027-01-31' });
    expect(range('prevMonth', now)).toEqual({ dateFrom: '2026-12-01', dateTo: '2026-12-31' });
  });
});
