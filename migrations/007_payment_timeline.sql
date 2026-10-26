-- Additive payment tracking schema. Existing invoice payment status/amounts remain unchanged.
-- Mirrors PAYMENT_TIMELINE_STATEMENTS in server/database/schema.js.
CREATE TABLE IF NOT EXISTS payment_timeline_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT 'info' CHECK (tone IN ('neutral','info','warning','success','danger')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_timeline_stages_label
  ON payment_timeline_stages(label COLLATE NOCASE) WHERE archived_at IS NULL;
CREATE TABLE IF NOT EXISTS payment_timeline_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  stage_id INTEGER REFERENCES payment_timeline_stages(id) ON DELETE SET NULL,
  stage_label TEXT NOT NULL,
  stage_tone TEXT NOT NULL DEFAULT 'info',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_timeline_events_invoice
  ON payment_timeline_events(invoice_id, created_at, id);
