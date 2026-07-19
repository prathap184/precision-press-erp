-- Fresh-start schema expansion for the Supabase-only ERP.
-- Keeps the existing table names but adds the columns and tables needed by the new auth and role model.

create extension if not exists pgcrypto;

alter table if exists profiles
  add column if not exists uid text,
  add column if not exists roles text[] not null default '{}'::text[],
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists customer_type text not null default 'CASH',
  add column if not exists credit_limit numeric not null default 0,
  add column if not exists used_credit numeric not null default 0,
  add column if not exists business_name text,
  add column if not exists photo_url text,
  add column if not exists display_name text,
  add column if not exists last_login timestamptz;

update profiles
set uid = coalesce(uid, id)
where uid is null;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'profiles_sync_uid_trigger'
  ) then
    create or replace function public.sync_profile_uid()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new.uid := coalesce(new.uid, new.id);
      new.updated_at := coalesce(new.updated_at, now());
      return new;
    end;
    $fn$;

    create trigger profiles_sync_uid_trigger
    before insert or update on profiles
    for each row execute function public.sync_profile_uid();
  end if;
end $$;

create table if not exists customers (
  id text primary key,
  profile_id text references profiles(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  customer_type text not null default 'CASH',
  credit_limit numeric not null default 0,
  used_credit numeric not null default 0,
  membership jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workflow (
  id text primary key,
  order_id text references orders(id) on delete cascade,
  current_stage text,
  workflow_role text,
  status text,
  payload jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists accounts_ledger (
  id text primary key,
  customer_id text references profiles(id) on delete set null,
  order_id text references orders(id) on delete set null,
  entry_type text,
  debit numeric not null default 0,
  credit numeric not null default 0,
  balance numeric not null default 0,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id text primary key,
  user_id text references profiles(id) on delete cascade,
  title text not null,
  body text,
  status text not null default 'UNREAD',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reports (
  id text primary key,
  report_type text,
  title text,
  status text,
  payload jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tally_sync_queue (
  id text primary key,
  order_id text references orders(id) on delete cascade,
  status text not null default 'PENDING',
  payload jsonb,
  idempotency_key text,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id text primary key,
  action_type text not null,
  actor_id text references profiles(id) on delete set null,
  actor_name text,
  target_id text,
  target_type text,
  payload jsonb,
  metadata jsonb not null default '{}'::jsonb,
  timestamp timestamptz not null default now()
);

create table if not exists staff_users (
  id text primary key,
  uid text,
  name text,
  email text,
  roles text[] not null default '{}'::text[],
  status text not null default 'ACTIVE',
  assigned_by text,
  assigned_at timestamptz,
  updated_at timestamptz,
  suspended_at timestamptz,
  last_login_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists role_history (
  id text primary key,
  user_id text references profiles(id) on delete cascade,
  user_name text,
  old_roles text[] not null default '{}'::text[],
  new_roles text[] not null default '{}'::text[],
  changed_by text,
  changed_by_name text,
  changed_at timestamptz not null default now(),
  reason text,
  action text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_profiles_uid on profiles(uid);
create index if not exists idx_profiles_role on profiles(role);
create index if not exists idx_profiles_roles on profiles using gin(roles);
create index if not exists idx_customers_profile_id on customers(profile_id);
create index if not exists idx_notifications_user_id on notifications(user_id);
create index if not exists idx_workflow_order_id on workflow(order_id);
create index if not exists idx_tally_sync_queue_order_id on tally_sync_queue(order_id);