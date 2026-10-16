// Single source of truth for the schema. migrations/001_init.sql mirrors this (checked by a test).
export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_issued TEXT NOT NULL,
    invoice_no TEXT NOT NULL COLLATE NOCASE UNIQUE,
    cr_no TEXT, client_name TEXT NOT NULL, product_service TEXT NOT NULL,
    amount_centavos INTEGER NOT NULL DEFAULT 0 CHECK (amount_centavos >= 0),
    amount_paid_centavos INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_centavos >= 0 AND amount_paid_centavos <= amount_centavos),
    payment_status TEXT NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending','Partially Paid','Paid','Cancelled')),
    delivery_date TEXT, remarks TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  ...['date_issued', 'client_name', 'product_service', 'payment_status', 'delivery_date'].map(
    (col) => `CREATE INDEX IF NOT EXISTS idx_invoices_${col} ON invoices(${col})`,
  ),
];

export const INVOICE_COLUMNS = [
  'id', 'date_issued', 'invoice_no', 'cr_no', 'client_name', 'product_service',
  'amount_centavos', 'amount_paid_centavos', 'payment_status', 'delivery_date', 'remarks', 'created_at', 'updated_at',
];
