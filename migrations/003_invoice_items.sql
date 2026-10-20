-- Invoice line items (idempotent). Mirrors ITEM_STATEMENTS in server/database/schema.js.
-- Additive only: creates a new table and index, never alters or drops invoices or existing data.
-- Invoices saved before this existed have no rows here and are read as one item with quantity 1.
-- The app also applies this automatically on the first request. Manual: turso db shell <db-name> < migrations/003_invoice_items.sql

CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    product_service TEXT NOT NULL,
    quantity REAL NOT NULL CHECK (quantity > 0));

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id, position);
