-- Invoice running numbers (SI / SVI) and fixed payment terms. Mirrors SEQUENCE_STATEMENTS and INVOICE_TERMS_COLUMN in
-- server/database/schema.js.
-- Additive only: creates one table and adds one column to invoices. No invoice is renumbered, edited or deleted.
-- invoice_sequences holds the last number ever assigned per type and only moves forward, so a number is never reused after its
-- invoice is deleted or cancelled. The app creates the two rows (SI, SVI) on its first request after this migration, starting each
-- at the highest plain "SI - nnnn" / "SVI - nnnn" number already saved (0 when there is none), so run the app once after applying it
-- manually. invoices.invoice_no is already UNIQUE (case-insensitive) in 001_init.sql.
-- Every existing invoice reads terms = '30-days' through the column DEFAULT.
-- The app applies this automatically (it skips the column if it exists). Manual, once only (SQLite has no ADD COLUMN IF NOT EXISTS):
--   turso db shell <db-name> < migrations/006_invoice_sequences_terms.sql

CREATE TABLE IF NOT EXISTS invoice_sequences (
    prefix TEXT PRIMARY KEY CHECK (prefix IN ('SI','SVI')),
    last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0));

ALTER TABLE invoices ADD COLUMN terms TEXT NOT NULL DEFAULT '30-days' CHECK (terms = '30-days');
