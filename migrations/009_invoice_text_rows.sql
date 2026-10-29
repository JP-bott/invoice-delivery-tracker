-- Independent, non-billable invoice text rows for the nature-of-service column.
-- after_item is the number of product lines before the text (0 means above all).
-- Additive; safe for existing invoices. initSchema creates this table on deployment.
CREATE TABLE IF NOT EXISTS invoice_text_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  after_item INTEGER NOT NULL CHECK (after_item >= 0),
  sort_order INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoice_text_rows_invoice ON invoice_text_rows(invoice_id, sort_order);
