-- ============================================================
-- Phase 1: Core Setup & HSN Master
-- ============================================================

-- 1. company_profile (Replaces tax_templates)
CREATE TABLE IF NOT EXISTS public.company_profile (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name      TEXT         NOT NULL,
  address_line1     TEXT,
  address_line2     TEXT,
  city              TEXT,
  state             TEXT,
  state_code        VARCHAR(2),
  pincode           VARCHAR(10),
  gstin             VARCHAR(15),
  pan               VARCHAR(10),
  msme_reg          TEXT,
  phone             TEXT,
  email             TEXT,
  website           TEXT,
  bank_name         TEXT,
  account_number    TEXT,
  ifsc              TEXT,
  branch            TEXT,
  beneficiary_name  TEXT,
  upi_id            TEXT,
  invoice_prefix    VARCHAR(10)  NOT NULL DEFAULT 'HE/',
  declaration       TEXT,
  terms             TEXT,
  footer_text       TEXT,
  logo_url          TEXT,
  signature_url     TEXT,
  seal_url          TEXT,
  is_active         BOOLEAN      DEFAULT true,
  created_at        TIMESTAMPTZ  DEFAULT now(),
  updated_at        TIMESTAMPTZ  DEFAULT now()
);

-- Migrate active data from tax_templates
INSERT INTO public.company_profile (
  company_name, address_line1, city, state, state_code, pincode, 
  phone, email, website, gstin, pan, msme_reg, 
  bank_name, branch, account_number, ifsc, beneficiary_name, upi_id, 
  invoice_prefix, declaration, terms, footer_text, logo_url, signature_url, seal_url,
  is_active, created_at, updated_at
)
SELECT 
  company_name, address, city, state, state_code, pincode, 
  phone, email, website, gstin, pan, msme_reg, 
  bank_name, branch, account_number, ifsc, beneficiary_name, upi_id, 
  invoice_prefix, declaration, terms, footer_text, logo_url, signature_url, seal_url,
  is_active, created_at, updated_at
FROM public.tax_templates
WHERE is_active = true
LIMIT 1
ON CONFLICT DO NOTHING;

-- 2. hsn_master
CREATE TABLE IF NOT EXISTS public.hsn_master (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  hsn_code          VARCHAR(8)   UNIQUE NOT NULL,
  description       TEXT         NOT NULL,
  is_active         BOOLEAN      DEFAULT true,
  created_at        TIMESTAMPTZ  DEFAULT now(),
  updated_at        TIMESTAMPTZ  DEFAULT now(),
  created_by        TEXT,
  updated_by        TEXT,
  reason_for_change TEXT
);

-- Trigger to prevent updating hsn_code
CREATE OR REPLACE FUNCTION prevent_hsn_code_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.hsn_code <> OLD.hsn_code THEN
    RAISE EXCEPTION 'HSN Code is immutable. Create a new HSN code instead.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_hsn_code_update
BEFORE UPDATE ON public.hsn_master
FOR EACH ROW EXECUTE FUNCTION prevent_hsn_code_update();

-- 3. hsn_gst_rates
CREATE TABLE IF NOT EXISTS public.hsn_gst_rates (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  hsn_id            UUID         NOT NULL REFERENCES public.hsn_master(id) ON DELETE CASCADE,
  gst_rate          NUMERIC(5,2) NOT NULL,
  effective_from    DATE         NOT NULL,
  effective_to      DATE,        -- NULL means currently active
  created_at        TIMESTAMPTZ  DEFAULT now(),
  updated_at        TIMESTAMPTZ  DEFAULT now(),
  created_by        TEXT,
  updated_by        TEXT,
  reason_for_change TEXT,

  CONSTRAINT hsn_gst_rate_no_overlap UNIQUE (hsn_id, effective_from),
  CONSTRAINT check_effective_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX idx_hsn_gst_current ON public.hsn_gst_rates (hsn_id) WHERE effective_to IS NULL;

-- Seed default printing HSN codes
WITH inserted_hsns AS (
  INSERT INTO public.hsn_master (hsn_code, description)
  VALUES 
    ('4901', 'Printed books, brochures, leaflets and similar printed matter'),
    ('4911', 'Other printed matter, including printed pictures and photographs'),
    ('4819', 'Cartons, boxes, cases, bags and other packing containers'),
    ('4820', 'Registers, account books, note books, order books, receipt books')
  ON CONFLICT (hsn_code) DO NOTHING
  RETURNING id, hsn_code
)
INSERT INTO public.hsn_gst_rates (hsn_id, gst_rate, effective_from)
SELECT 
  ih.id, 
  CASE 
    WHEN ih.hsn_code = '4901' THEN 12.00
    ELSE 18.00 
  END, 
  '2017-07-01'
FROM inserted_hsns ih;

-- 3. invoice_sequences
CREATE TABLE IF NOT EXISTS public.invoice_sequences (
  financial_year  VARCHAR(10)  PRIMARY KEY,    -- e.g., '2026-27'
  prefix          VARCHAR(10)  NOT NULL,       -- e.g., 'HE/'
  last_number     INTEGER      NOT NULL DEFAULT 0,
  is_locked       BOOLEAN      DEFAULT false,  -- If TRUE, NO generation or modifications allowed for this FY
  created_at      TIMESTAMPTZ  DEFAULT now(),
  updated_at      TIMESTAMPTZ  DEFAULT now()
);

-- Seed current financial year
INSERT INTO public.invoice_sequences (financial_year, prefix, last_number)
VALUES ('2026-27', 'HE/', 0)
ON CONFLICT DO NOTHING;

-- Add RLS Policies
ALTER TABLE public.company_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hsn_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_sequences ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view
CREATE POLICY "Allow authenticated read company_profile" ON public.company_profile FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read hsn_master" ON public.hsn_master FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read invoice_sequences" ON public.invoice_sequences FOR SELECT USING (auth.role() = 'authenticated');

-- Allow admins to mutate
CREATE POLICY "Allow admin all company_profile" ON public.company_profile FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow admin all hsn_master" ON public.hsn_master FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow admin all invoice_sequences" ON public.invoice_sequences FOR ALL USING (auth.role() = 'authenticated');
