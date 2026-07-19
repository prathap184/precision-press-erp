-- Alter products table to add HSN fields
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS hsn_master_id UUID REFERENCES public.hsn_master(id),
  ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8),
  ADD COLUMN IF NOT EXISTS hsn_description TEXT,
  ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS gst_effective_from DATE,
  ADD COLUMN IF NOT EXISTS product_snapshot_version INTEGER DEFAULT 1;
