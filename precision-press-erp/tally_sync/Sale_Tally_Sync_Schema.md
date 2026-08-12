# Tally Sales Sync Architecture & Schema

This document outlines the staging architecture for importing Sales Invoices from Tally into the Precision Press ERP (Supabase PostgreSQL).

## The Goal
To prevent data collisions and ensure data integrity, Tally sales data is first imported into intermediate "Staging Tables". These tables exactly mirror the live ERP tables but remove strict foreign key constraints. This allows users to review, map missing customers, and approve the data before it enters the live ledger.

---

## 1. Invoice Staging Table (`invoice_tally`)
This table holds the header information for the invoice (Customer, Date, Totals). It mirrors the live `public.invoice` table.

```sql
CREATE TABLE public.invoice_tally (
  staging_id uuid not null default gen_random_uuid() primary key,
  import_status text not null default 'pending',
  error_message text null,
  tally_contact_name text null, -- Stores the raw Tally customer name

  -- EXACT MIRROR OF LIVE TABLE:
  organization_id uuid not null,
  contact_id uuid null, -- Nullable in staging in case it doesn't match yet
  invoice_number text not null,
  issue_date date not null,
  due_date date not null,
  status public.invoice_status not null default 'draft'::invoice_status,
  reference text null,
  notes text null,
  subtotal integer not null default 0,
  tax_total integer not null default 0,
  total integer not null default 0,
  amount_paid integer not null default 0,
  amount_due integer not null default 0,
  currency_code text not null default 'INR'::text,
  sender_snapshot jsonb null,
  recipient_snapshot jsonb null,
  payment_link_token text null,
  journal_entry_id uuid null,
  sent_at timestamp without time zone null,
  paid_at timestamp without time zone null,
  voided_at timestamp without time zone null,
  created_by uuid null,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  deleted_at timestamp without time zone null,
  written_off_at timestamp without time zone null,
  invoice_type public.invoice_type not null default 'standard'::invoice_type,
  deposit_percent integer null,
  dunning_level integer not null default 0,
  cgst_total integer not null default 0,
  sgst_total integer not null default 0,
  igst_total integer not null default 0
) TABLESPACE pg_default;
```

---

## 2. Invoice Line Staging Table (`invoice_line_tally`)
This table holds the individual line items for each invoice. It mirrors the live `public.invoice_line` table and links back to the staging header via `invoice_staging_id`.

```sql
CREATE TABLE public.invoice_line_tally (
  staging_id uuid not null default gen_random_uuid() primary key,
  invoice_staging_id uuid not null references public.invoice_tally(staging_id) on delete cascade,

  -- EXACT MIRROR OF LIVE TABLE:
  description text not null,
  quantity integer not null default 100,
  unit_price integer not null default 0,
  account_id uuid null,
  tax_rate_id uuid null,
  discount_percent integer not null default 0,
  tax_amount integer not null default 0,
  amount integer not null default 0,
  cost_center_id uuid null,
  sort_order integer not null default 0,
  project_id uuid null,
  inventory_item_id uuid null,
  warehouse_id uuid null,
  cgst_amount integer not null default 0,
  sgst_amount integer not null default 0,
  igst_amount integer not null default 0,
  width integer null,
  length integer null,
  sq_ft integer null,
  finish_amount integer not null default 0,
  delivery_mode text null,
  delivery_amount integer not null default 0
) TABLESPACE pg_default;
```

## Next Steps in Workflow
1. Tally Connector pushes JSON invoice data to the ERP.
2. ERP inserts data into `invoice_tally` and `invoice_line_tally` with `import_status = 'pending'`.
3. User opens the Staging UI to review imported invoices.
4. If a `tally_contact_name` does not match an existing ERP `contact`, the user is prompted to map it.
5. User clicks "Approve".
6. The system executes an INSERT INTO `public.invoice` and `public.invoice_line`, pulling from the staging tables.
7. The `import_status` is updated to `'approved'`.
