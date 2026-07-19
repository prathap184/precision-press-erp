-- Create products table in Supabase (Migrating from Firebase)
CREATE TABLE IF NOT EXISTS public.products (
  id                  TEXT PRIMARY KEY,  -- Using TEXT since Firebase IDs are strings like "6000"
  name                TEXT NOT NULL,
  name_lowercase      TEXT,
  category            TEXT NOT NULL,
  printer_category    TEXT,
  status              TEXT DEFAULT 'ACTIVE',
  base_rate           NUMERIC(10,2) NOT NULL,
  eyelet_metal        NUMERIC(10,2) DEFAULT 0,
  eyelet_plastic      NUMERIC(10,2) DEFAULT 0,
  delivery_door       NUMERIC(10,2) DEFAULT 0,
  delivery_courier    NUMERIC(10,2) DEFAULT 0,
  delivery_transport  NUMERIC(10,2) DEFAULT 0,
  media_images        JSONB DEFAULT '[]',
  media_video_url     TEXT,
  specs_max_width     TEXT,
  specs_gsm           TEXT,
  specs_description   TEXT,
  workflow_steps      JSONB DEFAULT '[]',

  -- New HSN Fields
  hsn_master_id       UUID REFERENCES public.hsn_master(id),
  hsn_code            VARCHAR(8),
  hsn_description     TEXT,
  gst_rate            NUMERIC(5,2),
  gst_effective_from  DATE,
  product_snapshot_version INTEGER DEFAULT 1,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- 2. Create product audit logs
CREATE TABLE IF NOT EXISTS public.product_audit_logs (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      TEXT         NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  old_hsn_code    VARCHAR(8),
  new_hsn_code    VARCHAR(8),
  old_gst_rate    NUMERIC(5,2),
  new_gst_rate    NUMERIC(5,2),
  updated_by      TEXT,
  reason          TEXT,
  created_at      TIMESTAMPTZ  DEFAULT now()
);

-- Index for querying audits by product
CREATE INDEX idx_product_audit_logs_product_id ON public.product_audit_logs(product_id);
