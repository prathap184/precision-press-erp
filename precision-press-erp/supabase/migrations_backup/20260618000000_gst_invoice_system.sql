-- ============================================================
-- GST Tax Invoice System Migration
-- ============================================================

-- 1. tax_templates – single source of truth for company/GST/bank settings
CREATE TABLE IF NOT EXISTS public.tax_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Company Information
  company_name  text NOT NULL DEFAULT 'Hindustan Enterprises',
  address       text NOT NULL DEFAULT '#1, New Bamboo Bazaar',
  city          text NOT NULL DEFAULT 'Mysore',
  state         text NOT NULL DEFAULT 'Karnataka',
  state_code    text NOT NULL DEFAULT '29',
  pincode       text NOT NULL DEFAULT '570001',
  phone         text NOT NULL DEFAULT '+91 90007 76007',
  email         text NOT NULL DEFAULT 'info@hindustanenterprises.com',
  website       text,
  -- GST & Tax
  gstin         text NOT NULL DEFAULT '29AFHPP0687G1Z2',
  pan           text NOT NULL DEFAULT 'AFHPP0687G',
  msme_reg      text,
  -- Bank Details
  bank_name     text NOT NULL DEFAULT 'ICICI Bank',
  branch        text NOT NULL DEFAULT 'Mysore Main',
  account_number text NOT NULL DEFAULT '6255505013373',
  ifsc          text NOT NULL DEFAULT 'ICIC0006255',
  beneficiary_name text NOT NULL DEFAULT 'Hindustan Enterprises',
  upi_id        text,
  -- Invoice Settings
  invoice_prefix text NOT NULL DEFAULT 'HE',
  default_gst   numeric(5,2) NOT NULL DEFAULT 18.00,
  round_off     boolean NOT NULL DEFAULT true,
  auto_qr       boolean NOT NULL DEFAULT false,
  amount_in_words boolean NOT NULL DEFAULT true,
  -- Assets (Cloudinary / public URLs)
  logo_url      text,
  signature_url text,
  seal_url      text,
  -- Footer & Legal
  declaration   text NOT NULL DEFAULT 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
  terms         text NOT NULL DEFAULT '1. Interest @ 24% PA + taxes applicable if payment not made within the stipulated time\n2. We are not responsible for Damages, Shortages which occur during transit',
  footer_text   text NOT NULL DEFAULT 'This is a Computer Generated Invoice',
  -- Meta
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Seed default company details
INSERT INTO public.tax_templates (
  company_name, address, city, state, state_code, pincode,
  phone, email, gstin, pan, bank_name, branch, account_number,
  ifsc, beneficiary_name, invoice_prefix, default_gst, round_off,
  declaration, terms, footer_text
) VALUES (
  'Hindustan Enterprises',
  '#1, New Bamboo Bazaar',
  'Mysore',
  'Karnataka',
  '29',
  '570001',
  '+91 90007 76007',
  'info@hindustanenterprises.com',
  '29AFHPP0687G1Z2',
  'AFHPP0687G',
  'ICICI Bank',
  'Mysore Main',
  '6255505013373',
  'ICIC0006255',
  'Hindustan Enterprises',
  'HE',
  18.00,
  true,
  'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
  E'1. Interest @ 24% PA + taxes applicable if payment not made within the stipulated time\n2. We are not responsible for Damages, Shortages which occur during transit',
  'This is a Computer Generated Invoice'
) ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE public.tax_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage tax_templates" ON public.tax_templates FOR ALL USING (true);

-- 2. dispatch_details – dedicated table for transport info, keeps orders clean
CREATE TABLE IF NOT EXISTS public.dispatch_details (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_order_id    text NOT NULL UNIQUE,
  transporter_name   text,
  dispatch_through   text,
  lr_number          text,
  lr_date            date,
  vehicle_number     text,
  destination        text,
  delivery_note      text,
  delivery_note_date date,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dispatch_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage dispatch_details" ON public.dispatch_details FOR ALL USING (true);

-- 3. invoices table with full status lifecycle + idempotency constraint
CREATE TABLE IF NOT EXISTS public.invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number   text UNIQUE,
  parent_order_id  text NOT NULL UNIQUE, -- UNIQUE: one invoice per parent order
  customer_id      text,
  -- Snapshot of invoice data at generation time
  invoice_data     jsonb NOT NULL DEFAULT '{}',
  -- Status lifecycle: Draft → Queued → Generating → Generated → Cancelled / Regenerated
  status           text NOT NULL DEFAULT 'Draft'
                     CHECK (status IN ('Draft','Queued','Generating','Generated','Cancelled','Regenerated')),
  -- PDF storage
  pdf_url          text,
  -- Tax template snapshot (which template version was used)
  tax_template_id  uuid REFERENCES public.tax_templates(id),
  -- Job queue reference
  job_id           uuid,
  -- Error tracking
  error_message    text,
  retry_count      int NOT NULL DEFAULT 0,
  -- Timestamps
  queued_at        timestamptz,
  generated_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage invoices" ON public.invoices FOR ALL USING (true);

-- 4. Expand profiles table with GST / billing / shipping / business fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_name          text,
  ADD COLUMN IF NOT EXISTS contact_person        text,
  ADD COLUMN IF NOT EXISTS alternate_mobile      text,
  ADD COLUMN IF NOT EXISTS gst_registered        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gstin                 text,
  ADD COLUMN IF NOT EXISTS pan_number            text,
  ADD COLUMN IF NOT EXISTS customer_code         text,
  -- Billing Address
  ADD COLUMN IF NOT EXISTS billing_address_line1 text,
  ADD COLUMN IF NOT EXISTS billing_address_line2 text,
  ADD COLUMN IF NOT EXISTS billing_area          text,
  ADD COLUMN IF NOT EXISTS billing_city          text,
  ADD COLUMN IF NOT EXISTS billing_district      text,
  ADD COLUMN IF NOT EXISTS billing_state         text,
  ADD COLUMN IF NOT EXISTS billing_state_code    text,
  ADD COLUMN IF NOT EXISTS billing_pincode       text,
  ADD COLUMN IF NOT EXISTS billing_country       text NOT NULL DEFAULT 'India',
  -- Shipping / Consignee Address
  ADD COLUMN IF NOT EXISTS shipping_same_as_billing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS consignee_name        text,
  ADD COLUMN IF NOT EXISTS consignee_contact     text,
  ADD COLUMN IF NOT EXISTS consignee_mobile      text,
  ADD COLUMN IF NOT EXISTS consignee_gstin       text,
  ADD COLUMN IF NOT EXISTS shipping_address_line1 text,
  ADD COLUMN IF NOT EXISTS shipping_address_line2 text,
  ADD COLUMN IF NOT EXISTS shipping_area         text,
  ADD COLUMN IF NOT EXISTS shipping_city         text,
  ADD COLUMN IF NOT EXISTS shipping_district     text,
  ADD COLUMN IF NOT EXISTS shipping_state        text,
  ADD COLUMN IF NOT EXISTS shipping_state_code   text,
  ADD COLUMN IF NOT EXISTS shipping_pincode      text,
  ADD COLUMN IF NOT EXISTS shipping_country      text NOT NULL DEFAULT 'India',
  -- Business Terms
  ADD COLUMN IF NOT EXISTS payment_terms         text,
  ADD COLUMN IF NOT EXISTS credit_days           int,
  ADD COLUMN IF NOT EXISTS preferred_transporter text,
  ADD COLUMN IF NOT EXISTS remarks               text;
