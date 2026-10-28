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

// Line-item pricing (migrations/004_invoice_item_pricing.sql mirrors this). Added to invoice_items with ALTER TABLE ADD COLUMN
// (initSchema skips any that exist), so the 003 table and its rows are untouched. NULL means the item was saved before unit
// costs existed: those invoices keep their stored amount and are read as before.
export const ITEM_PRICING_COLUMNS = ['unit_cost_centavos', 'amount_centavos'];

// An optional description is stored with each invoice line item. Existing rows retain their data.
// Also documented in migrations/008_invoice_item_description.sql.
export const ITEM_DESCRIPTION_COLUMN = "description TEXT NOT NULL DEFAULT ''";

// Registered clients (Settings > Clients) that the Add Invoice form can suggest. migrations/005_clients.sql mirrors this and
// INVOICE_CLIENT_COLUMNS; a test keeps them in sync. An invoice never points at a client row: it keeps its own copy of the
// name, TIN and address (the snapshot taken when it was saved), so renaming or deleting a client never rewrites issued invoices.
export const CLIENT_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    tin TEXT,
    address TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL)`,
];

// Client details saved with each invoice. Added to invoices with ALTER TABLE ADD COLUMN (initSchema skips any that exist), so the
// 001 table and its rows are untouched. NULL means the invoice was saved before clients existed or without a registered client.
export const INVOICE_CLIENT_COLUMNS = ['client_tin', 'client_address'];

// Invoice numbering and fixed payment terms (migrations/006_invoice_sequences_terms.sql mirrors this; a test keeps them in sync).
// invoice_sequences holds the last number ever assigned per type (SI, SVI). It only moves forward, so a number is never handed out
// twice, even after its invoice is deleted or cancelled. initSchema seeds each row from the highest existing number of that type.
export const SEQUENCE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS invoice_sequences (
    prefix TEXT PRIMARY KEY CHECK (prefix IN ('SI','SVI')),
    last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0))`,
];
export const SEQUENCE_PREFIXES = ['SI', 'SVI'];

// Payment terms are always 30-days. Added to invoices with ALTER TABLE ADD COLUMN (initSchema skips it if present); the DEFAULT gives
// every existing invoice the same value without rewriting rows.
export const FIXED_TERMS = '30-days';
export const INVOICE_TERMS_COLUMN = `terms TEXT NOT NULL DEFAULT '30-days' CHECK (terms = '30-days')`;

export const INVOICE_COLUMNS = [
  'id', 'date_issued', 'invoice_no', 'cr_no', 'client_name', 'product_service', 'due_date',
  'amount_centavos', 'amount_paid_centavos', 'payment_status', 'delivery_date', 'remarks', 'created_at', 'updated_at',
];

 
// Collection-stage updates: invoice amounts and payment_status remain authoritative and unchanged.
export const PAYMENT_TIMELINE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS payment_timeline_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    tone TEXT NOT NULL DEFAULT 'info' CHECK (tone IN ('neutral','info','warning','success','danger')),
    sort_order INTEGER NOT NULL DEFAULT 0, archived_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_timeline_stages_label
    ON payment_timeline_stages(label COLLATE NOCASE) WHERE archived_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS payment_timeline_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    stage_id INTEGER REFERENCES payment_timeline_stages(id) ON DELETE SET NULL,
    stage_label TEXT NOT NULL, stage_tone TEXT NOT NULL DEFAULT 'info',
    note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_timeline_events_invoice
    ON payment_timeline_events(invoice_id, created_at, id)`,
];
