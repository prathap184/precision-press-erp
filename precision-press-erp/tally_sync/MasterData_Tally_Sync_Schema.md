# Tally Master Data Sync Architecture & Schema

This document outlines the staging architecture for importing Master Data (Customers, Suppliers, and Bank Accounts) from Tally into the Precision Press ERP.

## The Goal
Before importing invoices and receipts, we need to sync Tally's Master Data into the ERP. Since Tally might have hundreds of Sundry Debtors (Customers) and Sundry Creditors (Suppliers), we bring them into a staging area first. This prevents the live ERP tables from being flooded with bad data and allows the user to review, merge, or approve the contacts before they go live.

---

## 1. Contact Staging Table (`contact_tally`)
This table holds Customers and Suppliers. It is an **EXACT 1:1 match** to your live `public.contact` table, but with foreign keys removed so raw Tally data can land here safely without crashing.

```sql
CREATE TABLE public.contact_tally (
  staging_id uuid not null default gen_random_uuid() primary key,
  import_status text not null default 'pending',
  error_message text null,
  
  -- Extra fields specifically to identify the Tally record
  tally_ledger_group text null, -- "Sundry Debtors" or "Sundry Creditors"

  -- EXACT MIRROR OF LIVE TABLE (No FK constraints):
  id uuid null, -- Will be filled if it matches an existing contact
  organization_id uuid not null,
  name text not null,
  email text null,
  phone text null,
  tax_number text null,
  type public.contact_type not null default 'customer'::contact_type,
  payment_terms_days integer null default 30,
  addresses jsonb null,
  notes text null,
  currency_code text null default 'INR'::text,
  credit_limit integer null,
  is_tax_exempt boolean not null default false,
  default_revenue_account_id uuid null,
  default_expense_account_id uuid null,
  default_tax_rate_id uuid null,
  peppol_id text null,
  peppol_scheme text null,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  deleted_at timestamp without time zone null,
  is_1099_vendor boolean not null default false,
  w9_tax_classification text null,
  tax_identifier text null,
  backup_withholding boolean not null default false,
  linked_org_id uuid null,
  uid text null,
  "displayName" text null,
  role text null,
  roles text null,
  "customerType" text null,
  "usedCredit" numeric null,
  status text null,
  "businessName" text null,
  membership text null,
  "financialStats" text null,
  "creditAuthorizedBy" numeric null,
  "assignedBy" text null,
  "assignedAt" timestamp with time zone null,
  "printerCategory" text null,
  "houseNumber" text null,
  "roadName" text null,
  city text null,
  state text null,
  country text null,
  pincode text null,
  "gstType" text null,
  "gstNumber" text null,
  "defaultAddressId" text null,
  "creditStatus" numeric null,
  "voucherType" text null,
  "gstVerified" text null,
  "gstDetails" jsonb null,
  company_name text null,
  contact_person text null,
  alternate_mobile text null,
  gst_registered text null,
  gstin text null,
  pan_number text null,
  customer_code text null,
  billing_address_line1 text null,
  billing_address_line2 text null,
  billing_area text null,
  billing_city text null,
  billing_district text null,
  billing_state text null,
  billing_state_code text null,
  billing_pincode text null,
  billing_country text null,
  shipping_same_as_billing text null,
  consignee_name text null,
  consignee_contact text null,
  consignee_mobile text null,
  consignee_gstin text null,
  shipping_address_line1 text null,
  shipping_address_line2 text null,
  shipping_area text null,
  shipping_city text null,
  shipping_district text null,
  shipping_state text null,
  shipping_state_code text null,
  shipping_pincode text null,
  shipping_country text null,
  credit_days numeric null,
  preferred_transporter text null,
  remarks text null,
  is_synced_to_erp boolean null,
  current_recharge text null,
  business_name text null,
  customer_type text null,
  used_credit numeric null,
  gst_type text null,
  gst_number text null,
  gst_verified text null,
  gst_details jsonb null,
  voucher_type text null,
  
  -- ALREADY IN YOUR LIVE TABLE!
  tally_ledger_name text null,
  tally_opening_balance numeric null default 0
) TABLESPACE pg_default;
```

---

## 2. Bank Account Staging Table (`bank_account_tally`)
This table holds Bank Ledgers from Tally. It is an **EXACT 1:1 match** to your live `public.bank_account` table.

```sql
CREATE TABLE public.bank_account_tally (
  staging_id uuid not null default gen_random_uuid() primary key,
  import_status text not null default 'pending',
  error_message text null,
  
  -- Raw text from Tally
  tally_ledger_name text not null,

  -- EXACT MIRROR OF LIVE TABLE (No FK constraints):
  id uuid null,
  organization_id uuid not null,
  account_name text not null,
  account_number text null,
  bank_name text null,
  currency_code text not null default 'INR'::text,
  country_code text null,
  account_type public.bank_account_type not null default 'checking'::bank_account_type,
  color text not null default '#0f766e'::text,
  chart_account_id uuid null,
  balance integer not null default 0,
  low_balance_threshold integer null,
  is_active boolean not null default true,
  created_at timestamp without time zone not null default now(),
  deleted_at timestamp without time zone null
) TABLESPACE pg_default;
```
