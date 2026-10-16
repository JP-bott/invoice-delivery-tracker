-- Invoice & Delivery Tracker schema (idempotent). Mirrors server/database/schema.js.
-- Apply manually with: turso db shell <db-name> < migrations/001_init.sql

CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_issued TEXT NOT NULL,
    invoice_no TEXT NOT NULL COLLATE NOCASE UNIQUE,
    cr_no TEXT, client_name TEXT NOT NULL, product_service TEXT NOT NULL,
    amount_centavos INTEGER NOT NULL DEFAULT 0 CHECK (amount_centavos >= 0),
    amount_paid_centavos INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_centavos >= 0 AND amount_paid_centavos <= amount_centavos),
    payment_status TEXT NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending','Partially Paid','Paid','Cancelled')),
    delivery_date TEXT, remarks TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS idx_invoices_date_issued ON invoices(date_issued);

CREATE INDEX IF NOT EXISTS idx_invoices_client_name ON invoices(client_name);

CREATE INDEX IF NOT EXISTS idx_invoices_product_service ON invoices(product_service);

CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);

CREATE INDEX IF NOT EXISTS idx_invoices_delivery_date ON invoices(delivery_date);
