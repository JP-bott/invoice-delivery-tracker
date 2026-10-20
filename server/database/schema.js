// Single source of truth for the schema. migrations/001_init.sql mirrors this (checked by a test).
export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_issued TEXT NOT NULL,
    invoice_no TEXT NOT NULL COLLATE NOCASE UNIQUE,
    cr_no TEXT, client_name TEXT NOT NULL, product_service TEXT NOT NULL, due_date TEXT,
    amount_centavos INTEGER NOT NULL DEFAULT 0 CHECK (amount_centavos >= 0),
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

// Custom invoice fields (migrations/002_invoice_custom_fields.sql mirrors this; a test keeps them in sync).
// Values live in their own table (one row per invoice + field, empty values are not stored), so the
// invoices table is never altered and archiving or deleting a field cannot touch invoice columns.
export const CUSTOM_FIELD_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS invoice_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    input_type TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0,1)),
    show_in_table INTEGER NOT NULL DEFAULT 1 CHECK (show_in_table IN (0,1)),
    options TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_fields_active_label ON invoice_fields(label COLLATE NOCASE) WHERE archived_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS invoice_custom_values (
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    field_id INTEGER NOT NULL REFERENCES invoice_fields(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    PRIMARY KEY (invoice_id, field_id))`,
  `CREATE INDEX IF NOT EXISTS idx_custom_values_field_value ON invoice_custom_values(field_id, value)`,
];

// Line items (several products/services, each with a quantity, per invoice). Additive: invoices.product_service
// stays as a readable summary of the item names so search, filters, sorting and the dashboard keep working.
// Invoices without rows here (created before this table existed) are read as one item with quantity 1.
// migrations/003_invoice_items.sql mirrors this; a test keeps them in sync.
export const ITEM_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    product_service TEXT NOT NULL,
    quantity REAL NOT NULL CHECK (quantity > 0))`,
  `CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id, position)`,
];

export const INVOICE_COLUMNS = [
  'id', 'date_issued', 'invoice_no', 'cr_no', 'client_name', 'product_service', 'due_date',
  'amount_centavos', 'amount_paid_centavos', 'payment_status', 'delivery_date', 'remarks', 'created_at', 'updated_at',
];
