
-- =============================================================================
-- ALL MISSING ENUMS & COLUMNS & TABLES FOR ERP SCHEMA
-- =============================================================================

-- 1. ENUMS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
    CREATE TYPE account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entry_status') THEN
    CREATE TYPE entry_status AS ENUM ('draft', 'pending_approval', 'approved', 'posted', 'rejected', 'cancelled', 'void');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'voucher_type') THEN
    CREATE TYPE voucher_type AS ENUM ('JOURNAL', 'CONTRA', 'SALES', 'PURCHASE', 'RECEIPT', 'PAYMENT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_module') THEN
    CREATE TYPE source_module AS ENUM ('MANUAL', 'SALES', 'PURCHASE', 'PAYMENT', 'RECEIPT', 'CONTRA', 'STOCK', 'PAYROLL', 'ASSET');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'adjustment_type') THEN
    CREATE TYPE adjustment_type AS ENUM ('NEW_REF', 'AGAINST_REF', 'ON_ACCOUNT', 'ADVANCE', 'OPENING_BALANCE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reference_type') THEN
    CREATE TYPE reference_type AS ENUM ('SALES_INVOICE', 'PURCHASE_BILL', 'SALES_ORDER', 'PURCHASE_ORDER', 'PROJECT', 'JOB_CARD');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tax_type') THEN
    CREATE TYPE tax_type AS ENUM ('sales', 'purchase', 'both');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tax_rate_kind') THEN
    CREATE TYPE tax_rate_kind AS ENUM ('standard', 'blocked', 'partial_block', 'exempt', 'reverse_charge', 'no_vat', 'sales_tax_us');
  END IF;
END $$;

-- 2. MISSING TABLES
CREATE TABLE IF NOT EXISTS public.voucher_setting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  voucher_type voucher_type NOT NULL,
  prefix text NOT NULL,
  padding_length integer NOT NULL DEFAULT 6,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT voucher_setting_org_type_idx UNIQUE (organization_id, voucher_type)
);

CREATE TABLE IF NOT EXISTS public.voucher_sequence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  fiscal_year_id uuid NOT NULL,
  voucher_type voucher_type NOT NULL,
  next_number integer NOT NULL DEFAULT 1,
  CONSTRAINT voucher_sequence_org_year_type_idx UNIQUE (organization_id, fiscal_year_id, voucher_type)
);

CREATE TABLE IF NOT EXISTS public.cost_center (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  parent_id uuid,
  created_at timestamp DEFAULT now() NOT NULL,
  deleted_at timestamp
);

-- 3. MISSING COLUMNS ON journal_entry
ALTER TABLE public.journal_entry ADD COLUMN IF NOT EXISTS voucher_type voucher_type;
ALTER TABLE public.journal_entry ADD COLUMN IF NOT EXISTS sub_type text;
ALTER TABLE public.journal_entry ADD COLUMN IF NOT EXISTS voucher_prefix text;
ALTER TABLE public.journal_entry ADD COLUMN IF NOT EXISTS voucher_sequence integer;
ALTER TABLE public.journal_entry ADD COLUMN IF NOT EXISTS voucher_number text;
ALTER TABLE public.journal_entry ADD COLUMN IF NOT EXISTS posting_date date;
ALTER TABLE public.journal_entry ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE public.journal_entry ADD COLUMN IF NOT EXISTS source_module source_module;
ALTER TABLE public.journal_entry ADD COLUMN IF NOT EXISTS source_id uuid;

-- 4. MISSING COLUMNS ON journal_line
ALTER TABLE public.journal_line ADD COLUMN IF NOT EXISTS cost_center_id uuid;
ALTER TABLE public.journal_line ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.journal_line ADD COLUMN IF NOT EXISTS instrument_type text;
ALTER TABLE public.journal_line ADD COLUMN IF NOT EXISTS instrument_no text;
ALTER TABLE public.journal_line ADD COLUMN IF NOT EXISTS instrument_date date;
ALTER TABLE public.journal_line ADD COLUMN IF NOT EXISTS project_id uuid;
ALTER TABLE public.journal_line ADD COLUMN IF NOT EXISTS adjustment_type adjustment_type;
ALTER TABLE public.journal_line ADD COLUMN IF NOT EXISTS reference_name text;
ALTER TABLE public.journal_line ADD COLUMN IF NOT EXISTS reference_type reference_type;
ALTER TABLE public.journal_line ADD COLUMN IF NOT EXISTS reference_id uuid;

-- 5. MISSING COLUMNS ON chart_account
ALTER TABLE public.chart_account ADD COLUMN IF NOT EXISTS default_tax_rate_id uuid;
ALTER TABLE public.chart_account ADD COLUMN IF NOT EXISTS tax_disallowed_percent integer DEFAULT 0;
ALTER TABLE public.chart_account ADD COLUMN IF NOT EXISTS reporting_code text;
ALTER TABLE public.chart_account ADD COLUMN IF NOT EXISTS is_system boolean DEFAULT false;
