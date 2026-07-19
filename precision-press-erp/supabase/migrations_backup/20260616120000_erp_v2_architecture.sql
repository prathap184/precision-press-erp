-- Migration for ERP V2.0 Architecture
-- Creates document_jobs for the Persistent Job Queue
-- Drops legacy dispatch_receipts and sales_receipts

-- 1. Create document_jobs table for Persistent Job Queue
create table if not exists document_jobs (
  job_id text primary key,
  job_type text not null,
  order_id text not null,
  parent_order_id text not null,
  priority integer not null default 2,
  status text not null default 'PENDING',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  worker_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- Index for worker polling
create index if not exists idx_document_jobs_status_priority on document_jobs (status, priority, created_at);

-- 2. Drop legacy tables
drop table if exists dispatch_receipts cascade;
drop table if exists sales_receipts cascade;

-- Note: The closures will now go into transactions (accounts_ledger or equivalent).
