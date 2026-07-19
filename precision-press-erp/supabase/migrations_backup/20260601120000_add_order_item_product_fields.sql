-- Add item-level product metadata for Supabase order_items rows.
-- This supports the Firestore compatibility shim mapping orders/{id}/items -> order_items.
-- Use quoted camelCase identifiers because the app expects `productName` and may preserve exact key casing.

alter table if exists order_items
  add column if not exists "productName" text not null default '',
  add column if not exists "description" text;
