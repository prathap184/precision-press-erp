-- Create Invoices Table
CREATE TABLE IF NOT EXISTS public.invoices (
    id TEXT PRIMARY KEY,
    "invoiceNumber" TEXT,
    "parentOrderId" TEXT,
    "childOrderIds" JSONB,
    "customerId" TEXT,
    "customerSnapshot" JSONB,
    items JSONB,
    amounts JSONB,
    status TEXT,
    "generatedBy" TEXT,
    "orderType" TEXT,
    "paymentStatus" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE,
    "updatedAt" TIMESTAMP WITH TIME ZONE
);

-- Create Dispatch Receipts Table
CREATE TABLE IF NOT EXISTS public.dispatch_receipts (
    id TEXT PRIMARY KEY,
    "receiptNumber" TEXT,
    "parentOrderId" TEXT,
    "childOrderId" TEXT,
    "invoiceId" TEXT,
    "customerId" TEXT,
    "customerSnapshot" JSONB,
    "productName" TEXT,
    quantity NUMERIC,
    "dispatchDate" TIMESTAMP WITH TIME ZONE,
    "dispatchedBy" TEXT,
    "dispatchedByName" TEXT,
    "deliveryMode" TEXT,
    "courierDetails" JSONB,
    "transportDetails" JSONB,
    "proofImageUrl" TEXT,
    notes TEXT,
    status TEXT,
    "deliveredAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE
);

-- Create Sales Receipts Table
CREATE TABLE IF NOT EXISTS public.sales_receipts (
    id TEXT PRIMARY KEY,
    "receiptNumber" TEXT,
    "parentOrderId" TEXT,
    "invoiceId" TEXT,
    "customerId" TEXT,
    "customerSnapshot" JSONB,
    "amountReceived" NUMERIC,
    "paymentMethod" TEXT,
    "paymentDate" TIMESTAMP WITH TIME ZONE,
    "createdBy" TEXT,
    "createdByName" TEXT,
    notes TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE
);

-- Give anon and authenticated roles access to these tables (if RLS is enabled)
-- For now we just enable RLS and create generic policies or disable RLS as per other tables
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to invoices" ON public.invoices FOR ALL USING (true);
CREATE POLICY "Allow full access to dispatch_receipts" ON public.dispatch_receipts FOR ALL USING (true);
CREATE POLICY "Allow full access to sales_receipts" ON public.sales_receipts FOR ALL USING (true);
