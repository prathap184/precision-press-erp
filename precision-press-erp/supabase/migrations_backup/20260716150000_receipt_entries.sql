CREATE TABLE IF NOT EXISTS public.receipt_entries (
    id text PRIMARY KEY,
    userId text,
    refId text,
    credit numeric,
    createdBy text,
    timestamp timestamptz DEFAULT now(),
    isVerified boolean DEFAULT false,
    verifiedAt jsonb,
    paymentMode text,
    is_synced_to_erp boolean DEFAULT false,
    sale_entry_number text,
    receipt_entry_number text,
    link text
);

ALTER TABLE public.receipt_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for receipt_entries" ON public.receipt_entries
    FOR ALL USING (true);
