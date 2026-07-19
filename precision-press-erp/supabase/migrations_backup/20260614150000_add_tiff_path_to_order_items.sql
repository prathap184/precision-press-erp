-- Add tiff_path (production file path) and printer assignment columns to order_items.
-- These fields are set by the manager when they save the production network file path
-- before marking Work Done and assigning to a printer.

alter table if exists order_items
  add column if not exists tiff_path text,
  add column if not exists tiff_assigned_at timestamptz,
  add column if not exists tiff_assigned_by text,
  add column if not exists "assignedPrinterId" text,
  add column if not exists "assignedPrinterName" text;

create index if not exists idx_order_items_tiff_path
  on order_items(tiff_path)
  where tiff_path is not null;

create index if not exists idx_order_items_assigned_printer
  on order_items("assignedPrinterId")
  where "assignedPrinterId" is not null;
