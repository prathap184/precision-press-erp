-- Design Workspace Architecture: isolated per-item design tracking
-- Creates separate tables for revision history, proofs, and comments
-- so they never bloat the order_items JSONB column.

create extension if not exists pgcrypto;

-- ─── design_revisions ────────────────────────────────────────────────────────
create table if not exists design_revisions (
  id text primary key default gen_random_uuid()::text,
  order_id text not null,
  item_id text not null,
  version integer not null default 1,
  url text not null,
  cloudinary_public_id text,
  cloudinary_folder text,
  uploaded_by text not null,
  uploaded_by_name text,
  uploaded_at timestamptz not null default now(),
  notes text,
  revision_type text not null default 'INITIAL',  -- INITIAL | CORRECTION | FINAL
  upload_stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_design_revisions_order_item
  on design_revisions(order_id, item_id);
create index if not exists idx_design_revisions_version
  on design_revisions(order_id, item_id, version);

-- ─── design_proofs ────────────────────────────────────────────────────────────
create table if not exists design_proofs (
  id text primary key default gen_random_uuid()::text,
  order_id text not null,
  item_id text not null,
  version integer not null default 1,
  revision_version integer not null default 1,
  url text not null,
  cloudinary_public_id text,
  sent_at timestamptz not null default now(),
  sent_by text not null,
  sent_by_name text,
  customer_response text default 'PENDING',   -- PENDING | APPROVED | REJECTED
  response_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_design_proofs_order_item
  on design_proofs(order_id, item_id);
create index if not exists idx_design_proofs_version
  on design_proofs(order_id, item_id, version);

-- ─── design_comments ──────────────────────────────────────────────────────────
create table if not exists design_comments (
  id text primary key default gen_random_uuid()::text,
  order_id text not null,
  item_id text not null,
  message text not null,
  author_id text not null,
  author_name text,
  author_role text,
  attachment_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_design_comments_order_item
  on design_comments(order_id, item_id);

-- ─── order_items: add itemWorkspace metadata column ──────────────────────────
alter table if exists order_items
  add column if not exists "designType" text,
  add column if not exists "itemWorkspace" jsonb not null default '{}'::jsonb;

create index if not exists idx_order_items_design_type
  on order_items("designType");
