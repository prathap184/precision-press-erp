-- Drop the old functions that used UUIDs or old signatures to fix the ambiguous function error

DROP FUNCTION IF EXISTS create_sale_entry(TEXT, UUID, TEXT[], NUMERIC, TEXT, UUID);

DROP FUNCTION IF EXISTS create_receipt_entry(TEXT, UUID, TEXT[], NUMERIC, TEXT, TEXT, TEXT, UUID);

DROP FUNCTION IF EXISTS create_receipt_entry(TEXT, UUID, JSONB, NUMERIC, TEXT, TEXT, TEXT, UUID);
