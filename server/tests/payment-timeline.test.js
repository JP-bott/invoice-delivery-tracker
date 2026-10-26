import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let handle;
beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = 'file:' + path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'idt-timeline-')), 'test.db');
  ({ handle } = await import('../handler.js'));
});
const call = (method, url, body) => {
  const parsed = new URL(url, 'http://localhost');
  return handle({ method, path: parsed.pathname, query: Object.fromEntries(parsed.searchParams), body });
};
const invoice = (payment_status = 'Pending', amount_paid = 0) => ({
  date_issued: '2026-10-20', invoice_prefix: 'SI', client_name: 'Timeline Customer',
  items: [{ product_service: 'Software', quantity: 1, unit_cost: '1000' }],
  payment_status, amount_paid,
});

describe('invoice payment progress timelines', () => {
  it('seeds stages and tracks an unpaid invoice without modifying its payment status', async () => {
    const created = await call('POST', '/api/invoices', invoice());
    expect(created.status).toBe(201);
    const id = created.body.id;
    let tracker = await call('GET', `/api/invoices/${id}/timeline`);
    expect(tracker.status).toBe(200);
    expect(tracker.body.events).toHaveLength(0);
    expect(tracker.body.stages.length).toBeGreaterThan(2);
    expect(tracker.body.can_edit).toBe(true);
    const stage = tracker.body.stages[0];
    const record = await call('POST', `/api/invoices/${id}/timeline`, { stage_id: stage.id, note: 'Sent to accounts payable.' });
    expect(record.status).toBe(201);
    expect(record.body.stage_label).toBe(stage.label);
    expect(record.body.note).toBe('Sent to accounts payable.');
    tracker = await call('GET', `/api/invoices/${id}/timeline`);
    expect(tracker.body.events).toHaveLength(1);
    expect((await call('GET', `/api/invoices/${id}`)).body.payment_status).toBe('Pending');
    const changed = await call('PUT', `/api/invoices/${id}/timeline/${record.body.id}`, { stage_id: stage.id, note: 'Awaiting finance approval.' });
    expect(changed.status).toBe(200);
    expect(changed.body.note).toBe('Awaiting finance approval.');
    expect((await call('DELETE', `/api/invoices/${id}/timeline/${record.body.id}`)).status).toBe(204);
    expect((await call('GET', `/api/invoices/${id}/timeline`)).body.events).toHaveLength(0);
  });

  it('validates stages and preserves history after rename or archive', async () => {
    const stages = (await call('GET', '/api/timeline-stages')).body;
    const custom = await call('POST', '/api/timeline-stages', { label: 'Awaiting check release', description: 'Check in preparation', tone: 'warning' });
    expect(custom.status).toBe(201);
    const r = await call('POST', '/api/invoices', invoice());
    const endpoint = `/api/invoices/${r.body.id}/timeline`;
    const ev = await call('POST', endpoint, { stage_id: custom.body.id, note: 'Expected next week' });
    expect(ev.status).toBe(201);
    expect((await call('POST', endpoint, { stage_id: -1 })).status).toBe(422);
    const renamed = await call('PUT', `/api/timeline-stages/${custom.body.id}`, { label: 'Check released', tone: 'success', description: '' });
    expect(renamed.status).toBe(200);
    expect((await call('GET', endpoint)).body.events[0].stage_label).toBe('Awaiting check release');
    expect((await call('DELETE', `/api/timeline-stages/${custom.body.id}`)).status).toBe(204);
    expect((await call('GET', endpoint)).body.events[0].stage_label).toBe('Awaiting check release');
    expect((await call('POST', endpoint, { stage_id: custom.body.id })).status).toBe(422);
    const result = await call('PUT', '/api/timeline-stages/order', { ids: stages.map((x) => x.id) });
    expect(result.status).toBe(200);
  });

  it('makes paid invoices read-only and removes history with deleted invoices', async () => {
    const paid = await call('POST', '/api/invoices', invoice('Paid', 1000));
    const paidTimeline = await call('GET', `/api/invoices/${paid.body.id}/timeline`);
    expect(paidTimeline.body.can_edit).toBe(false);
    const stage = (await call('GET', '/api/timeline-stages')).body[0];
    expect((await call('POST', `/api/invoices/${paid.body.id}/timeline`, { stage_id: stage.id })).status).toBe(409);
    const created = await call('POST', '/api/invoices', invoice());
    const url = `/api/invoices/${created.body.id}/timeline`;
    expect((await call('POST', url, { stage_id: stage.id })).status).toBe(201);
    expect((await call('DELETE', `/api/invoices/${created.body.id}`)).status).toBe(204);
    expect((await call('GET', url)).status).toBe(404);
  });
});
