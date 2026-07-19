
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sale_created BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_created BOOLEAN DEFAULT false;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sale_entry_number TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_entry_number TEXT;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_entry_number TEXT;
