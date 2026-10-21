-- Registered clients and the client details saved with each invoice (idempotent except the two ALTERs). Mirrors CLIENT_STATEMENTS and
-- INVOICE_CLIENT_COLUMNS in server/database/schema.js.
-- Additive only: creates a new table and adds two nullable columns to invoices; existing invoices are not changed or renumbered.
-- Invoices saved before this keep NULL in client_tin / client_address.
-- The app applies this automatically on the first request (it skips columns that already exist).
-- Manual, once only (SQLite has no ADD COLUMN IF NOT EXISTS): turso db shell <db-name> < migrations/005_clients.sql

CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    tin TEXT,
    address TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL);

ALTER TABLE invoices ADD COLUMN client_tin TEXT;
ALTER TABLE invoices ADD COLUMN client_address TEXT;
