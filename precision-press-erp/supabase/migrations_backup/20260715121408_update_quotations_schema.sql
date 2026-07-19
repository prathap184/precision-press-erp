-- Add missing columns to quotations table to match orders data requirements
ALTER TABLE public.quotations
ADD COLUMN IF NOT EXISTS customer_snapshot jsonb,
ADD COLUMN IF NOT EXISTS shipping_address text,
ADD COLUMN IF NOT EXISTS logistics_details jsonb,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'PENDING';
