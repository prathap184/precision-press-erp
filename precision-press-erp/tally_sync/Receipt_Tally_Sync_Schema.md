# Tally Receipt Sync Architecture & Schema

This document outlines the staging architecture for importing Receipt Vouchers (Customer Payments) from Tally into the Precision Press ERP.

## The Goal
Just like invoices, we need to bring customer payments into a staging area first. Tally sends over the customer name, bank ledger name, and potentially the invoice number they are paying. We store this in the `payment_tally` and `payment_allocation_tally` tables before mapping them to the real `payment` and `payment_allocation` tables.

---

## 1. Payment Staging Table (`payment_tally`)
This table holds the main payment details (who paid, how much, and into which bank). It mirrors the live `public.payment` table.

```sql
CREATE TABLE public.payment_tally (
  staging_id uuid not null default gen_random_uuid() primary key,
  import_status text not null default 'pending',
  error_message text null,
  
  -- Raw text from Tally (since the IDs might not exist yet)
  tally_contact_name text null,
  tally_bank_name text null,

  -- EXACT MIRROR OF LIVE TABLE (but without strict foreign keys):
  organization_id uuid not null,
  contact_id uuid null,
  payment_number text not null,
  type public.payment_type not null default 'received'::payment_type,
  date date not null,
  amount integer not null default 0,
  method public.payment_method not null default 'bank_transfer'::payment_method,
  reference text null,
  notes text null,
  bank_account_id uuid null,
  currency_code text not null default 'INR'::text,
  journal_entry_id uuid null,
  created_by uuid null,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  deleted_at timestamp without time zone null
) TABLESPACE pg_default;
```

---

## 2. Payment Allocation Staging Table (`payment_allocation_tally`)
In Tally, a receipt can be "Against Reference" (paying a specific invoice) or "On Account" (prepayment). If it's against an invoice, we stage that allocation here. It mirrors the live `public.payment_allocation` table.

```sql
CREATE TABLE public.payment_allocation_tally (
  staging_id uuid not null default gen_random_uuid() primary key,
  payment_staging_id uuid not null references public.payment_tally(staging_id) on delete cascade,

  -- Raw text from Tally
  tally_invoice_number text null,

  -- EXACT MIRROR OF LIVE TABLE:
  document_type text not null default 'invoice',
  document_id uuid null, -- Nullable because we might need to look it up using the tally_invoice_number
  amount integer not null default 0
) TABLESPACE pg_default;
```

## Next Steps in Workflow
1. Tally Connector pushes JSON Receipt data to the ERP.
2. ERP inserts data into `payment_tally` and (optionally) `payment_allocation_tally`.
3. User opens the Staging UI to review imported receipts.
4. If a `tally_contact_name` or `tally_bank_name` doesn't exist, the user maps it.
5. If `tally_invoice_number` is provided, the system automatically finds the matching `invoice.id`.
6. User clicks "Approve".
7. The system pushes the data to the live tables, which triggers the backend APIs to create the `journal_entry` and `customer_credit` exactly like the UI does.
