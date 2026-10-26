// An invoice's collection progress is separate from its authoritative amount/payment status.
// Timeline entries are snapshots: editing or archiving a stage never rewrites the history.
import { getDb } from '../database/db.js';
import { HttpError } from '../http.js';

export const TONES = ['neutral', 'info', 'warning', 'success', 'danger'];
export const DEFAULT_STAGES = [
  ['Invoice sent to client', 'Invoice delivered for review', 'neutral'],
  ['Acknowledged by client', 'Client confirmed receipt', 'info'],
  ['Under review', 'Documents or billing details are being checked', 'info'],
  ['For payment approval', 'Awaiting internal approval or signature', 'warning'],
  ['Scheduled for payment', 'Payment date is being arranged', 'warning'],
  ['Payment processing', 'Bank transfer or payment request is in progress', 'info'],
  ['On hold / needs follow-up', 'Record the reason for a delay in the note', 'danger'],
  ['Payment confirmation pending', 'Awaiting confirmation that funds have arrived', 'success'],
];

const now = () => new Date().toISOString();
const db = () => getDb();
const toStage = (r) => ({
  id: Number(r.id), label: r.label, description: r.description || '',
  tone: r.tone, sort_order: Number(r.sort_order),
});
const toEvent = (r) => ({
  id: Number(r.id), invoice_id: Number(r.invoice_id), stage_id: r.stage_id == null ? null : Number(r.stage_id),
  stage_label: r.stage_label, stage_tone: r.stage_tone, note: r.note || '',
  created_at: r.created_at, updated_at: r.updated_at,
});
const fail = (fields) => { throw new HttpError(422, 'Please check the timeline fields', 'VALIDATION_ERROR', fields); };
const intId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

export async function seedStages(c = db()) {
  const existing = (await c.execute({ sql: 'SELECT value FROM schema_meta WHERE key = ?', args: ['payment_timeline_seeded'] })).rows[0];
  if (existing) return;
  const stamp = now();
  await c.batch([
    ...DEFAULT_STAGES.map(([label, description, tone], order) => ({
      sql: 'INSERT OR IGNORE INTO payment_timeline_stages (label, description, tone, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [label, description, tone, order, stamp, stamp],
    })),
    { sql: "INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('payment_timeline_seeded', '1')" },
  ], 'write');
}

function validateStage(body) {
  const label = typeof body?.label === 'string' ? body.label.trim().replace(/\s+/g, ' ') : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const tone = body?.tone || 'info';
  const errors = {};
  if (label.length < 2 || label.length > 70) errors.label = 'Enter a stage name (2 to 70 characters)';
  if (description.length > 200) errors.description = 'Maximum 200 characters';
  if (!TONES.includes(tone)) errors.tone = 'Choose a valid color';
  if (Object.keys(errors).length) fail(errors);
  return { label, description, tone };
}
async function activeStage(id) {
  if (!intId(id)) return null;
  return (await db().execute({
    sql: 'SELECT * FROM payment_timeline_stages WHERE id = ? AND archived_at IS NULL',
    args: [Number(id)],
  })).rows[0] || null;
}
export async function stages() {
  return (await db().execute('SELECT * FROM payment_timeline_stages WHERE archived_at IS NULL ORDER BY sort_order, id')).rows.map(toStage);
}
export async function createStage(body) {
  const s = validateStage(body);
  const order = (await db().execute('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM payment_timeline_stages')).rows[0].n;
  const stamp = now();
  const r = await db().execute({
    sql: 'INSERT INTO payment_timeline_stages (label, description, tone, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [s.label, s.description, s.tone, Number(order), stamp, stamp],
  });
  return toStage(await activeStage(Number(r.lastInsertRowid)));
}
export async function updateStage(id, body) {
  if (!await activeStage(id)) return null;
  const s = validateStage(body);
  await db().execute({
    sql: 'UPDATE payment_timeline_stages SET label = ?, description = ?, tone = ?, updated_at = ? WHERE id = ?',
    args: [s.label, s.description, s.tone, now(), Number(id)],
  });
  return toStage(await activeStage(id));
}
export async function archiveStage(id) {
  if (!await activeStage(id)) return false;
  const r = await db().execute({
    sql: 'UPDATE payment_timeline_stages SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL',
    args: [now(), now(), Number(id)],
  });
  return r.rowsAffected > 0;
}
export async function reorderStages(ids) {
  const existing = await stages();
  if (!Array.isArray(ids) || ids.length !== existing.length ||
      new Set(ids).size !== ids.length ||
      !ids.every((id) => intId(id) && existing.some((x) => x.id === Number(id)))) {
    fail({ order: 'Provide every active stage exactly once' });
  }
  await db().batch(ids.map((id, i) => ({
    sql: 'UPDATE payment_timeline_stages SET sort_order = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL',
    args: [i, now(), Number(id)],
  })), 'write');
  return stages();
}
async function invoice(id) {
  if (!intId(id)) return null;
  return (await db().execute({ sql: 'SELECT id, payment_status, amount_centavos, amount_paid_centavos FROM invoices WHERE id = ?', args: [Number(id)] })).rows[0] || null;
}
const editable = (row) => ['Pending', 'Partially Paid'].includes(row.payment_status) &&
  Number(row.amount_centavos) > Number(row.amount_paid_centavos);
const canEdit = (row) => {
  if (!editable(row)) throw new HttpError(409, 'Only unpaid invoices can receive timeline updates', 'NOT_UNPAID');
};
async function getEvent(invoiceId, eventId) {
  if (!intId(eventId)) return null;
  return (await db().execute({
    sql: 'SELECT * FROM payment_timeline_events WHERE invoice_id = ? AND id = ?',
    args: [Number(invoiceId), Number(eventId)],
  })).rows[0] || null;
}
function validateEntry(body) {
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (note.length > 1000) fail({ note: 'Maximum 1000 characters' });
  if (!intId(body?.stage_id)) fail({ stage_id: 'Select a timeline stage' });
  return { note, stage_id: Number(body.stage_id) };
}
export async function timeline(invoiceId) {
  const row = await invoice(invoiceId);
  if (!row) throw new HttpError(404, 'Invoice not found', 'NOT_FOUND');
  const events = (await db().execute({
    sql: 'SELECT * FROM payment_timeline_events WHERE invoice_id = ? ORDER BY created_at, id',
    args: [Number(invoiceId)],
  })).rows.map(toEvent);
  return { stages: await stages(), events, can_edit: editable(row) };
}
export async function addEvent(invoiceId, body) {
  const row = await invoice(invoiceId);
  if (!row) throw new HttpError(404, 'Invoice not found', 'NOT_FOUND');
  canEdit(row);
  const entry = validateEntry(body), stage = await activeStage(entry.stage_id);
  if (!stage) fail({ stage_id: 'Select an available stage' });
  const stamp = now();
  const r = await db().execute({
    sql: 'INSERT INTO payment_timeline_events (invoice_id, stage_id, stage_label, stage_tone, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [Number(invoiceId), stage.id, stage.label, stage.tone, entry.note, stamp, stamp],
  });
  return toEvent(await getEvent(invoiceId, Number(r.lastInsertRowid)));
}
export async function updateEvent(invoiceId, eventId, body) {
  const row = await invoice(invoiceId);
  if (!row) throw new HttpError(404, 'Invoice not found', 'NOT_FOUND');
  const old = await getEvent(invoiceId, eventId);
  if (!old) throw new HttpError(404, 'Timeline update not found', 'NOT_FOUND');
  canEdit(row);
  const entry = validateEntry(body);
  const stage = await activeStage(entry.stage_id);
  // Archived stages remain editable for their notes; their historical label/tone stay unchanged.
  if (!stage && Number(old.stage_id) !== entry.stage_id) fail({ stage_id: 'Select an available stage' });
  await db().execute({
    sql: 'UPDATE payment_timeline_events SET stage_id = ?, stage_label = ?, stage_tone = ?, note = ?, updated_at = ? WHERE id = ? AND invoice_id = ?',
    args: [stage?.id ?? old.stage_id, stage?.label ?? old.stage_label, stage?.tone ?? old.stage_tone, entry.note, now(), Number(eventId), Number(invoiceId)],
  });
  return toEvent(await getEvent(invoiceId, eventId));
}
export async function removeEvent(invoiceId, eventId) {
  const row = await invoice(invoiceId);
  if (!row) throw new HttpError(404, 'Invoice not found', 'NOT_FOUND');
  canEdit(row);
  if (!intId(eventId)) return false;
  const r = await db().execute({
    sql: 'DELETE FROM payment_timeline_events WHERE invoice_id = ? AND id = ?',
    args: [Number(invoiceId), Number(eventId)],
  });
  return r.rowsAffected > 0;
}
