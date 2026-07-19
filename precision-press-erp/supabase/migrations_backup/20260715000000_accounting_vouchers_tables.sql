-- Suppliers table
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  gstin text,
  address text,
  state text,
  phone text,
  email text,
  tally_ledger_name text,
  created_at timestamp with time zone DEFAULT now(),
  created_by text
);

-- Payment Entries table
CREATE TABLE IF NOT EXISTS public.payment_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL UNIQUE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  payment_mode text NOT NULL,
  ref_number text,
  remarks text,
  tally_sync_status text DEFAULT 'PENDING',
  created_at timestamp with time zone DEFAULT now(),
  created_by text
);

-- Journal Entries table
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_number text NOT NULL UNIQUE,
  source_customer_id text NOT NULL, -- references firebase profiles (text id)
  target_customer_id text NOT NULL, -- references firebase profiles (text id)
  amount numeric NOT NULL,
  remarks text,
  tally_sync_status text DEFAULT 'PENDING',
  created_at timestamp with time zone DEFAULT now(),
  created_by text
);

-- Contra Entries table
CREATE TABLE IF NOT EXISTS public.contra_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contra_number text NOT NULL UNIQUE,
  source_ledger text NOT NULL,
  target_ledger text NOT NULL,
  amount numeric NOT NULL,
  remarks text,
  tally_sync_status text DEFAULT 'PENDING',
  created_at timestamp with time zone DEFAULT now(),
  created_by text
);

-- Quotations table
CREATE TABLE IF NOT EXISTS public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number text NOT NULL UNIQUE,
  customer_id text NOT NULL, -- references firebase profiles
  total_amount numeric NOT NULL,
  items jsonb,
  tax_details jsonb,
  tally_sync_status text DEFAULT 'PENDING',
  created_at timestamp with time zone DEFAULT now(),
  created_by text
);

-- RLS policies
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contra_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" ON public.suppliers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow insert access to authenticated users" ON public.suppliers FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow update access to authenticated users" ON public.suppliers FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow read access to authenticated users" ON public.payment_entries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow insert access to authenticated users" ON public.payment_entries FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow update access to authenticated users" ON public.payment_entries FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow read access to authenticated users" ON public.journal_entries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow insert access to authenticated users" ON public.journal_entries FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow update access to authenticated users" ON public.journal_entries FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow read access to authenticated users" ON public.contra_entries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow insert access to authenticated users" ON public.contra_entries FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow update access to authenticated users" ON public.contra_entries FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow read access to authenticated users" ON public.quotations FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow insert access to authenticated users" ON public.quotations FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow update access to authenticated users" ON public.quotations FOR UPDATE USING (auth.role() = 'authenticated');

-- Grant permissions to service role
GRANT ALL ON TABLE public.suppliers TO service_role;
GRANT ALL ON TABLE public.payment_entries TO service_role;
GRANT ALL ON TABLE public.journal_entries TO service_role;
GRANT ALL ON TABLE public.contra_entries TO service_role;
GRANT ALL ON TABLE public.quotations TO service_role;
