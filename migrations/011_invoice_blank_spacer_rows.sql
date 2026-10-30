-- Additive marker for intentional empty preview/print rows. Existing rows remain descriptions.
ALTER TABLE invoice_text_rows ADD COLUMN kind TEXT NOT NULL DEFAULT 'description' CHECK (kind IN ('description','space'));
