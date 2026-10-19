-- Invoice & Delivery Tracker schema (idempotent). Mirrors server/database/schema.js.
-- Apply manually with: turso db shell <db-name> < migrations/001_init.sql

CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_issued TEXT NOT NULL,
    invoice_no TEXT NOT NULL COLLATE NOCASE UNIQUE,
    cr_no TEXT, client_name TEXT NOT NULL, product_service TEXT NOT NULL, due_date TEXT,
    amount_centavos INTEGER NOT NULL DEFAULT 0 CHECK (amount_centavos >= 0),
    total_sales_centavos INTEGER NOT NULL DEFAULT 0 CHECK (total_sales_centavos >= 0),
    vat_centavos INTEGER NOT NULL DEFAULT 0 CHECK (vat_centavos >= 0),
    net_of_vat_centavos INTEGER NOT NULL DEFAULT 0 CHECK (net_of_vat_centavos >= 0),
    withholding_centavos INTEGER NOT NULL DEFAULT 0 CHECK (withholding_centavos >= 0),
    total_amount_due_centavos INTEGER NOT NULL DEFAULT 0 CHECK (total_amount_due_centavos >= 0),
    vat_type TEXT NOT NULL DEFAULT 'VATable' CHECK (vat_type IN ('VATable','VAT-Exempt','Zero-Rated')),
    withholding_rate_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (withholding_rate_basis_points >= 0),
    amount_paid_centavos INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_centavos >= 0 AND amount_paid_centavos <= amount_centavos),
    payment_status TEXT NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending','Partially Paid','Paid','Cancelled')),
    delivery_date TEXT, remarks TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS idx_invoices_date_issued ON invoices(date_issued);

CREATE INDEX IF NOT EXISTS idx_invoices_client_name ON invoices(client_name);

CREATE INDEX IF NOT EXISTS idx_invoices_product_service ON invoices(product_service);

CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);

CREATE INDEX IF NOT EXISTS idx_invoices_delivery_date ON invoices(delivery_date);

CREATE TABLE IF NOT EXISTS product_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL);
