// Single source of truth for the schema. migrations/001_init.sql mirrors this (checked by a test).
export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS invoices (
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
    delivery_date TEXT, remarks TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  ...['date_issued', 'client_name', 'product_service', 'payment_status', 'delivery_date'].map(
    (col) => `CREATE INDEX IF NOT EXISTS idx_invoices_${col} ON invoices(${col})`,
  ),
  `CREATE TABLE IF NOT EXISTS product_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL)`,
];

export const INVOICE_COLUMNS = [
  'id', 'date_issued', 'invoice_no', 'cr_no', 'client_name', 'product_service', 'due_date',
  'amount_centavos', 'total_sales_centavos', 'vat_centavos', 'net_of_vat_centavos', 'withholding_centavos', 'total_amount_due_centavos', 'vat_type', 'withholding_rate_basis_points',
  'amount_paid_centavos', 'payment_status', 'delivery_date', 'remarks', 'created_at', 'updated_at',
];
