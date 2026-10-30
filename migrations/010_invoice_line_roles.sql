-- Additive invoice-line roles. Existing invoice rows remain normal priced products,
-- and existing supporting description rows remain non-billable by default.
ALTER TABLE invoice_items ADD COLUMN is_title INTEGER NOT NULL DEFAULT 0 CHECK (is_title IN (0,1));
ALTER TABLE invoice_text_rows ADD COLUMN is_priced INTEGER NOT NULL DEFAULT 0 CHECK (is_priced IN (0,1));
ALTER TABLE invoice_text_rows ADD COLUMN quantity REAL;
ALTER TABLE invoice_text_rows ADD COLUMN unit_cost_centavos INTEGER;
ALTER TABLE invoice_text_rows ADD COLUMN amount_centavos INTEGER;
