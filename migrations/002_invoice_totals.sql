-- Backwards-compatible upgrade for databases created before invoice totals were stored.
ALTER TABLE invoices ADD COLUMN total_sales_centavos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN vat_centavos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN net_of_vat_centavos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN withholding_centavos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN total_amount_due_centavos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN vat_type TEXT NOT NULL DEFAULT 'VATable';
ALTER TABLE invoices ADD COLUMN withholding_rate_basis_points INTEGER NOT NULL DEFAULT 0;
UPDATE invoices SET total_sales_centavos = amount_centavos, net_of_vat_centavos = amount_centavos, total_amount_due_centavos = amount_centavos WHERE total_sales_centavos = 0 AND amount_centavos > 0;