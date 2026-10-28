// Which fields appear as filters on the Dashboard, and in what order (Settings > Dashboard filters).
// Stored as one JSON value in schema_meta (no new table). Date range is mandatory but participates in the saved display order.
// Available filters = four built-ins + every active custom invoice field. A field that is archived drops out of the
// list and returns, with its saved on/off state, when restored. Nothing here changes any invoice data.
import { getDb } from '../database/db.js';
import { HttpError } from '../http.js';
import { activeFields } from './customFieldService.js';

const KEY = 'dashboard_filters';
export const MAX_ENABLED = 8;
const DEFAULT_ENABLED = ['dateRange', 'client', 'product'];
const MANDATORY = 'dateRange'; // what the dashboard has always offered
const bad = (message) => new HttpError(422, message, 'VALIDATION_ERROR');

// Cancelled is left out of the payment options: the dashboard excludes cancelled invoices by design.
const BUILTIN = [
  { key: 'dateRange', label: 'Date range', aria_label: 'Date range', control: 'select', required: true, options: [{ value:'month',label:'This Month' },{ value:'quarter',label:'This Quarter' },{ value:'year',label:'This Year' }] },
  { key: 'client', label: 'Client', aria_label: 'Client', control: 'select', source: 'clients', all_label: 'All clients' },
  { key: 'product', label: 'Product/Service', aria_label: 'Product or service', control: 'select', source: 'products', all_label: 'All products' },
  { key: 'paymentStatus', label: 'Payment status', aria_label: 'Payment status', control: 'select', all_label: 'All payments',
    options: [['unpaid', 'Unpaid'], ['Pending', 'Pending'], ['Partially Paid', 'Partially Paid'], ['Paid', 'Paid']].map(([value, label]) => ({ value, label })) },
  { key: 'deliveryStatus', label: 'Delivery status', aria_label: 'Delivery status', control: 'select', all_label: 'All deliveries',
    options: [{ value: 'Pending', label: 'Pending delivery' }, { value: 'Delivered', label: 'Delivered' }] },
].map((d) => ({ ...d, custom: false, input_type: 'select' }));

const customDef = (f) => {
  const base = { key: `cf_${f.id}`, label: f.label, aria_label: f.label, custom: true, input_type: f.input_type, all_label: `Any ${f.label}` };
  if (f.input_type === 'dropdown') return { ...base, control: 'select', options: f.options.map((o) => ({ value: o, label: o })) };
  if (f.input_type === 'checkbox') return { ...base, control: 'select', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] };
  return { ...base, control: ['number', 'date'].includes(f.input_type) ? f.input_type : 'text' };
};

async function stored() {
  const row = (await getDb().execute({ sql: 'SELECT value FROM schema_meta WHERE key = ?', args: [KEY] })).rows[0];
  if (!row) return null;
  try {
    const v = JSON.parse(row.value);
    const strings = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []);
    return { order: strings(v.order), enabled: strings(v.enabled) };
  } catch { return null; }
}

// Every available filter, in saved order, each with its enabled flag.
export async function get() {
  const [fields, cfg] = await Promise.all([activeFields(), stored()]);
  const defs = [...BUILTIN, ...fields.map(customDef)];
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const saved = [...new Set(cfg?.order ?? [])].filter((k) => byKey.has(k));
  const order = [...saved, ...defs.map((d) => d.key).filter((k) => !saved.includes(k))];
  const enabled = new Set(cfg ? cfg.enabled : DEFAULT_ENABLED);
  enabled.add(MANDATORY);
  return { max_enabled: MAX_ENABLED, filters: order.map((k) => ({ ...byKey.get(k), enabled: enabled.has(k) })) };
}

// body: { filters: [{ key, enabled }] } in the desired order. Unknown/archived keys are ignored; available filters
// missing from the request (e.g. a field added in another tab) keep their current state and go to the end.
export async function save(body) {
  const list = body?.filters;
  if (!Array.isArray(list)) throw bad('Send the list of dashboard filters');
  const current = (await get()).filters;
  const known = new Map(current.map((f) => [f.key, f]));
  const seen = new Set(), order = [], enabled = [];
  for (const item of list) {
    if (typeof item?.key !== 'string' || typeof item.enabled !== 'boolean') throw bad('Each filter needs a key and an enabled flag');
    if (!known.has(item.key) || seen.has(item.key)) continue;
    seen.add(item.key); order.push(item.key); if (item.enabled || item.key === MANDATORY) enabled.push(item.key);
  }
  for (const f of current) if (!seen.has(f.key)) { order.push(f.key); if (f.enabled || f.key === MANDATORY) enabled.push(f.key); }
  if (enabled.length > MAX_ENABLED) throw bad(`Choose at most ${MAX_ENABLED} dashboard filters`);
  await getDb().execute({ sql: 'INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', args: [KEY, JSON.stringify({ order, enabled })] });
  return get();
}
