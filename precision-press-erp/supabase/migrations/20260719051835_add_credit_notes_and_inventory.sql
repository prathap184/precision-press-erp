-- Add current_stock to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS current_stock numeric(12,2) DEFAULT 0;

-- Create product_track table
CREATE TABLE public.product_track (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id text REFERENCES public.products(id) ON DELETE CASCADE,
    movement_type text NOT NULL CHECK (movement_type IN ('INWARD', 'OUTWARD')),
    quantity numeric(12,2) NOT NULL,
    reference_id text,
    remarks text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid
);

-- Create credit_notes table
CREATE TABLE public.credit_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    note_number text UNIQUE NOT NULL,
    invoice_id text REFERENCES public.invoices(id) ON DELETE SET NULL,
    user_id text NOT NULL,
    total_amount numeric(12,2) NOT NULL DEFAULT 0,
    gst_amount numeric(12,2) NOT NULL DEFAULT 0,
    reason text,
    status text DEFAULT 'ISSUED',
    settlement_type text CHECK (settlement_type IN ('CUSTOMER_CREDIT', 'REFUND_NOW')),
    payment_mode text,
    created_at timestamp with time zone DEFAULT now()
);

-- Create credit_note_items table
CREATE TABLE public.credit_note_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    note_id uuid REFERENCES public.credit_notes(id) ON DELETE CASCADE,
    product_id text REFERENCES public.products(id),
    quantity_returned numeric(12,2) NOT NULL,
    rate numeric(12,2) NOT NULL,
    total numeric(12,2) NOT NULL
);

-- Create debit_notes table
CREATE TABLE public.debit_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    note_number text UNIQUE NOT NULL,
    invoice_id text,
    supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
    total_amount numeric(12,2) NOT NULL DEFAULT 0,
    gst_amount numeric(12,2) NOT NULL DEFAULT 0,
    reason text,
    status text DEFAULT 'ISSUED',
    settlement_type text CHECK (settlement_type IN ('SUPPLIER_CREDIT', 'RECEIVE_REFUND_NOW')),
    payment_mode text,
    created_at timestamp with time zone DEFAULT now()
);

-- Create debit_note_items table
CREATE TABLE public.debit_note_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    note_id uuid REFERENCES public.debit_notes(id) ON DELETE CASCADE,
    product_id text REFERENCES public.products(id),
    quantity_returned numeric(12,2) NOT NULL,
    rate numeric(12,2) NOT NULL,
    total numeric(12,2) NOT NULL
);
