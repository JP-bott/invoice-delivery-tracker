// Framework-free API: handle({ method, path, query, body }) -> { status, body }.
import { ensureSchema } from './database/db.js';
import { validateInvoice } from './services/validate.js';
import * as inv from './services/invoiceService.js';
import * as products from './services/productService.js';
import * as cf from './services/customFieldService.js';
import { handlers } from './services/dashboardService.js';
import { errorResponse, invalid, notFound } from './http.js';

const ok = (body, status = 200) => ({ status, body });
const idOf = (s) => (/^\d+$/.test(s) ? Number(s) : null);

// Built-in field validation plus the active custom fields (existing values let an unchanged legacy value stay valid).
async function checked(body, id) {
  const { errors, value } = validateInvoice(body);
  const [fields, existing] = await Promise.all([cf.activeFields(), id == null ? {} : cf.valuesFor(id)]);
  const custom = cf.validateValues(body?.custom_fields, fields, existing);
  return { errors: { ...errors, ...custom.errors }, value, writes: custom.writes };
}

async function route(method, seg, query, body) {
  const [, area, a, extra] = seg; // seg[0] === 'api'
  if (seg[0] !== 'api') return null;

  if (area === 'products') {
    if (a === undefined && extra === undefined) {
      if (method === 'GET') return () => products.list().then(ok);
      if (method === 'POST') return () => products.create(body).then((r) => ok(r, 201));
    }
    if (extra === undefined && a !== undefined) {
      const id = idOf(a);
      if (method === 'PUT') return () => products.update(id, body).then((r) => (r ? ok(r) : notFound('Product/service option not found')));
      if (method === 'DELETE') return () => products.remove(id).then((r) => (r ? { status: 204 } : notFound('Product/service option not found')));
    }
    return null;
  }
  if (area === 'invoice-fields') {
    const missing = () => notFound('Invoice field not found');
    if (a === undefined) {
      if (method === 'GET') return () => cf.list({ includeArchived: ['1', 'true'].includes(query.includeArchived) }).then(ok);
      if (method === 'POST') return () => cf.create(body).then((r) => ok(r, 201));
      return null;
    }
    if (a === 'order') return method === 'PUT' && extra === undefined ? () => cf.reorder(body?.ids).then(ok) : null;
    const id = idOf(a);
    if (extra === 'restore' && method === 'POST') return () => cf.restore(id).then((r) => (r ? ok(r) : missing()));
    if (extra !== undefined) return null;
    if (method === 'PUT') return () => cf.update(id, body).then((r) => (r ? ok(r) : missing()));
    if (method === 'DELETE') {
      if (['1', 'true'].includes(query.permanent)) return () => cf.purge(id).then((r) => (r ? { status: 204 } : missing()));
      return () => cf.archive(id).then((r) => (r ? ok(r) : missing()));
    }
    return null;
  }
  if (extra !== undefined) return null;

  if (area === 'invoices') {
    if (a === undefined) {
      if (method === 'GET') return () => inv.list(query).then(ok);
      if (method === 'POST') return async () => {
        const { errors, value, writes } = await checked(body, null);
        return Object.keys(errors).length ? invalid(errors) : ok(await inv.create(value, writes), 201);
      };
      return null;
    }
    const id = idOf(a);
    if (method === 'GET') return async () => { const r = id == null ? null : await inv.get(id); return r ? ok(r) : notFound(); };
    if (method === 'PUT') return async () => {
      const { errors, value, writes } = await checked(body, id);
      if (Object.keys(errors).length) return invalid(errors);
      const r = id == null ? null : await inv.update(id, value, writes);
      return r ? ok(r) : notFound();
    };
    if (method === 'DELETE') return async () => (id != null && await inv.remove(id) ? { status: 204 } : notFound());
    return null;
  }
  if (area === 'dashboard' && method === 'GET' && a && Object.hasOwn(handlers, a)) return () => handlers[a](query).then(ok);
  if (area === 'filters' && method === 'GET' && a === 'clients') return () => inv.distinct('client_name').then(ok);
  if (area === 'filters' && method === 'GET' && a === 'products') return () => Promise.all([products.list(), inv.distinctProducts()]).then(([configured, used]) => ok([...new Set([...configured.map((p) => p.name), ...used])]));
  return null;
}

export async function handle({ method = 'GET', path = '/', query = {}, body } = {}) {
  const seg = path.split('/').filter(Boolean);
  try {
    const run = await route(method.toUpperCase(), seg, query, body);
    if (!run) return notFound('Unknown endpoint');
    await ensureSchema();
    return await run();
  } catch (e) { return errorResponse(e); }
}
