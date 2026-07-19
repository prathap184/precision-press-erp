-- Add reference and parent order tracking to support complex quoting and multi-item grouping

-- Add to orders table
ALTER TABLE IF EXISTS public.orders
ADD COLUMN IF NOT EXISTS ref_order_id text,
ADD COLUMN IF NOT EXISTS parent_order_id text;

-- Add to order_items table
ALTER TABLE IF EXISTS public.order_items
ADD COLUMN IF NOT EXISTS ref_order_id text,
ADD COLUMN IF NOT EXISTS parent_order_id text;

-- Add to quotations table
ALTER TABLE IF EXISTS public.quotations
ADD COLUMN IF NOT EXISTS ref_order_id text,
ADD COLUMN IF NOT EXISTS parent_order_id text;
