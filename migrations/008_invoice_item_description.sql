-- Optional description stored per product/service line in an invoice.
-- This additive migration leaves all existing invoice and item data intact.
-- The app automatically applies this on startup for deployments using initSchema.
-- For manual migration, run only once on a database without this column.

ALTER TABLE invoice_items ADD COLUMN description TEXT NOT NULL DEFAULT '';
