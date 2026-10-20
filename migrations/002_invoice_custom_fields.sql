-- Custom invoice fields (idempotent). Mirrors CUSTOM_FIELD_STATEMENTS in server/database/schema.js.
-- Additive only: creates new tables and indexes, never alters or drops invoices or existing data.
-- The app also applies this automatically on the first request. Manual: turso db shell <db-name> < migrations/002_invoice_custom_fields.sql

CREATE TABLE IF NOT EXISTS invoice_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    input_type TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0,1)),
    show_in_table INTEGER NOT NULL DEFAULT 1 CHECK (show_in_table IN (0,1)),
    options TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_fields_active_label ON invoice_fields(label COLLATE NOCASE) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS invoice_custom_values (
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    field_id INTEGER NOT NULL REFERENCES invoice_fields(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    PRIMARY KEY (invoice_id, field_id));

CREATE INDEX IF NOT EXISTS idx_custom_values_field_value ON invoice_custom_values(field_id, value);
