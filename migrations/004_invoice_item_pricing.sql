-- Unit cost and line amount per invoice item. Mirrors ITEM_PRICING_COLUMNS in server/database/schema.js.
-- Additive only: two nullable columns on invoice_items; invoices and existing rows are not changed or renumbered.
-- Rows saved before this keep NULL here and their invoice keeps its stored amount.
-- The app applies this automatically on the first request (it skips columns that already exist).
-- Manual, once only (SQLite has no ADD COLUMN IF NOT EXISTS): turso db shell <db-name> < migrations/004_invoice_item_pricing.sql

ALTER TABLE invoice_items ADD COLUMN unit_cost_centavos INTEGER;
ALTER TABLE invoice_items ADD COLUMN amount_centavos INTEGER;
