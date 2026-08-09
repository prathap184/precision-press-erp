BEGIN;

-- Purge dummy transactional data but keep master configuration
TRUNCATE TABLE 
  "public"."orders",
  "public"."order_items",
  "public"."invoices",
  "public"."transactions",
  "public"."journal_entries",
  "public"."accounts_ledger",
  "public"."company_bank_ledger",
  "public"."company_cash_ledger",
  "public"."bank_amount_ledger",
  "public"."hand_cash_ledger",
  "public"."receipt_entries",
  "public"."payment_entries",
  "public"."payments",
  "public"."quotations",
  "public"."workflow",
  "public"."workflow_stage_history",
  "public"."dispatch_details",
  "public"."dispatches",
  "public"."design_proofs",
  "public"."design_revisions",
  "public"."design_comments",
  "public"."designs",
  "public"."activity_logs",
  "public"."audit_logs",
  "public"."product_audit_logs",
  "public"."invoice_events",
  "public"."notifications",
  "public"."notifications_log",
  "public"."idempotency_keys",
  "public"."invoice_generation_attempts",
  "public"."invoice_integrity_checks",
  "public"."tally_sync_queue",
  "public"."cart",
  "public"."document_jobs",
  "public"."product_track",
  "public"."credit_notes",
  "public"."credit_note_items",
  "public"."debit_notes",
  "public"."debit_note_items",
  "public"."worker_health"
CASCADE;

-- Reset inventory stock quantity to 0
UPDATE "public"."inventory_item" SET stock_quantity = 0;

-- Reset invoice sequences to 0 or 1? Wait, invoice_sequences holds current numbers.
-- We can truncate it to let it restart or reset counters.
TRUNCATE TABLE "public"."invoice_sequences" CASCADE;

COMMIT;
