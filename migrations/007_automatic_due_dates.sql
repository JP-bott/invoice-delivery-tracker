-- One-time migration: due dates are 30 calendar days after delivery.
-- Existing manual due dates are overwritten; undelivered invoices have no due date.
-- The server applies the same statements automatically. Safe to rerun.
UPDATE invoices
SET due_date = CASE WHEN delivery_date IS NOT NULL AND delivery_date <> ''
  THEN date(delivery_date, '+30 days') ELSE NULL END
WHERE NOT EXISTS (SELECT 1 FROM schema_meta WHERE key = 'due_date_from_delivery_v1');

INSERT OR IGNORE INTO schema_meta (key, value)
VALUES ('due_date_from_delivery_v1', '1');
