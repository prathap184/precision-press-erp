-- Add advanced payment detail columns to receipt_entries
ALTER TABLE public.receipt_entries 
ADD COLUMN IF NOT EXISTS cash_ledger text,
ADD COLUMN IF NOT EXISTS upi_app text,
ADD COLUMN IF NOT EXISTS bank_ledger text,
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS utr text;

-- Add advanced payment detail columns to transactions (since it stores receipts too)
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS cash_ledger text,
ADD COLUMN IF NOT EXISTS upi_app text,
ADD COLUMN IF NOT EXISTS bank_ledger text,
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS utr text;
