import { describe, it, expect, beforeAll } from 'vitest';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';

let handle;
beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = 'file:' + path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'idt-overview-')), 'test.db');
  ({ handle } = await import('../handler.js'));
  const base = { invoice_prefix: 'SVI', product_service: 'P', amount: 100, payment_status: 'Pending', amount_paid: 0, client_name: 'Alpha' };
  const rows = [
    { date_issued: '2026-10-01', due_date: '2026-10-10', payment_status: 'Paid', amount_paid: 100 }, // paid
    { date_issued: '2026-10-02', due_date: '2026-11-01' }, // waiting
    { date_issued: '2026-10-03' }, // no due date
    { date_issued: '2026-10-04', due_date: '2026-10-11', payment_status: 'Partially Paid', amount_paid: 50, client_name: 'Gamma' }, // late 10 days
    { date_issued: '2026-08-01', due_date: '2026-09-10' }, // late 41 days
    { date_issued: '2026-06-01', due_date: '2026-07-01' }, // late 112 days
    { date_issued: '2026-10-05', due_date: '2026-10-21' }, // due today is not late yet
    { date_issued: '2026-10-06', due_date: '2026-10-07', payment_status: 'Cancelled' }, // excluded
  ];
  for (const r of rows) {
    const res = await handle({ method: 'POST', path: '/api/invoices', query: {}, body: { ...base, ...r } });
    if (res.status !== 201) throw new Error(`seed failed for ${r.date_issued}: ${JSON.stringify(res.body)}`);
  }
});
const overview = async (query = {}) => (await handle({ method: 'GET', path: '/api/dashboard/invoice-overview', query: { asOf: '2026-10-21', ...query } })).body;

describe('dashboard invoice overview', () => {
  it('sorts every non-cancelled invoice into one of six states', async () => {
    const r = await overview();
    expect(r.counts).toEqual({ late3: 1, late2: 1, late1: 1, noDue: 1, waiting: 2, paid: 1 });
    expect(r.total).toBe(7);
    expect(r.truncated).toBe(false);
    // the 8th invoice saved (the cancelled one) is numbered SVI - 0008
    expect(r.invoices.some((i) => i.invoice_no === 'SVI - 0008')).toBe(false);
  });
  it('lists the most urgent invoices first and reports days late', async () => {
    const r = await overview();
    expect(r.invoices.map((i) => i.state)).toEqual(['late3', 'late2', 'late1', 'noDue', 'waiting', 'waiting', 'paid']);
    expect(r.invoices.filter((i) => i.state.startsWith('late')).map((i) => i.days_late)).toEqual([112, 41, 10]);
    expect(r.invoices.find((i) => i.state === 'paid').days_late).toBe(0);
  });
  it('limits the squares to the selected issue-date range', async () => {
    const r = await overview({ dateFrom: '2026-10-01', dateTo: '2026-10-31' });
    expect(r.counts).toEqual({ late3: 0, late2: 0, late1: 1, noDue: 1, waiting: 2, paid: 1 });
    expect(r.total).toBe(5);
  });
  it('applies the client filter', async () => {
    const r = await overview({ client: 'Gamma' });
    expect(r.total).toBe(1);
    expect(r.invoices[0]).toMatchObject({ state: 'late1', client_name: 'Gamma', outstanding: 50 });
  });
  it('returns six issue months ending at the period end, independent of the start date', async () => {
    const r = await overview({ dateFrom: '2026-10-01', dateTo: '2026-10-31' });
    expect(r.months.map((m) => m.key)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    const by = Object.fromEntries(r.months.map((m) => [m.key, m]));
    expect(by['2026-06']).toMatchObject({ late3: 1, total: 1, dateFrom: '2026-06-01', dateTo: '2026-06-30' });
    expect(by['2026-08']).toMatchObject({ late2: 1, total: 1 });
    expect(by['2026-10']).toMatchObject({ paid: 1, waiting: 2, noDue: 1, late1: 1, total: 5 });
    expect(by['2026-07'].total).toBe(0);
  });
});
