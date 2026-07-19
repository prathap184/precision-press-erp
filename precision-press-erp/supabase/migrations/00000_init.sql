


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."invoice_event_type" AS ENUM (
    'PENDING_CREATED',
    'GENERATION_STARTED',
    'GENERATION_COMPLETED',
    'GENERATION_FAILED',
    'GENERATION_RETRIED',
    'PDF_GENERATED',
    'PDF_DOWNLOADED',
    'EMAIL_SENT',
    'WHATSAPP_SENT',
    'DISPATCH_UPDATED',
    'DISPATCH_ROLLED_BACK',
    'CANCELLED',
    'CREDIT_NOTE_CREATED',
    'SYSTEM_RESTART',
    'WORKER_TIMEOUT',
    'MANUAL_RETRY'
);


ALTER TYPE "public"."invoice_event_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atomic_dispatch_order"("p_order_id" "text", "p_actor_id" "text", "p_actor_name" "text", "p_invoice_date" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("success" boolean, "invoice_id" "text", "invoice_number" "text", "message" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  -- 1. Lock and validate the order
  SELECT status
  INTO v_current_status
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT, 'Order not found'::TEXT;
    RETURN;
  END IF;

  -- 2. Idempotency: already dispatched is fine
  IF v_current_status = 'DISPATCHED' THEN
    RETURN QUERY SELECT true, NULL::TEXT, NULL::TEXT, 'Order already dispatched'::TEXT;
    RETURN;
  END IF;

  -- 3. Mark as dispatched
  UPDATE public.orders
  SET status = 'DISPATCHED'
  WHERE id = p_order_id;

  RETURN QUERY SELECT true, NULL::TEXT, NULL::TEXT, 'Successfully dispatched'::TEXT;
END;
$$;


ALTER FUNCTION "public"."atomic_dispatch_order"("p_order_id" "text", "p_actor_id" "text", "p_actor_name" "text", "p_invoice_date" "date") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."document_jobs" (
    "id" "text" NOT NULL,
    "jobType" "text" NOT NULL,
    "orderId" "text" NOT NULL,
    "parentOrderId" "text" NOT NULL,
    "priority" integer DEFAULT 2 NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "maxAttempts" integer DEFAULT 4 NOT NULL,
    "errorMessage" "text",
    "worker_id" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "startedAt" timestamp with time zone,
    "completedAt" timestamp with time zone,
    "failedAt" timestamp with time zone,
    "heartbeatAt" timestamp with time zone,
    "stackTrace" "text",
    "sqlError" "text",
    "workerVersion" "text"
);


ALTER TABLE "public"."document_jobs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_pending_job"("p_worker_id" "text", "p_now" timestamp with time zone) RETURNS SETOF "public"."document_jobs"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_job_id text;
BEGIN
  -- 1. Self-healing: Reset timed-out running jobs (no heartbeat/startedAt for > 5 minutes)
  -- Timed-out jobs are rescheduled for retry by incrementing attempts
  UPDATE document_jobs
  SET status = CASE WHEN attempts + 1 >= "maxAttempts" THEN 'FAILED' ELSE 'RETRYING' END,
      attempts = attempts + 1,
      "failedAt" = CASE WHEN attempts + 1 >= "maxAttempts" THEN p_now ELSE NULL END,
      "errorMessage" = 'Worker timeout (No heartbeat/startedAt updated for 5 minutes)'
  WHERE status = 'RUNNING'
    AND COALESCE("heartbeatAt", "startedAt") <= p_now - INTERVAL '5 minutes';

  -- 2. Select one pending or retrying job atomically
  SELECT id INTO v_job_id
  FROM document_jobs
  WHERE status IN ('PENDING', 'RETRYING')
    AND (
      "payload"->>'runAfter' IS NULL
      OR ("payload"->>'runAfter')::timestamptz <= p_now
    )
  ORDER BY priority ASC, "createdAt" ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  -- 3. If a job is found, update it to RUNNING status
  IF v_job_id IS NOT NULL THEN
    RETURN QUERY
    UPDATE document_jobs
    SET status = 'RUNNING',
        "startedAt" = p_now,
        "heartbeatAt" = p_now,
        worker_id = p_worker_id
    WHERE id = v_job_id
    RETURNING *;
  END IF;

  RETURN;
END;
$$;


ALTER FUNCTION "public"."claim_pending_job"("p_worker_id" "text", "p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_receipt_entry"("p_receipt_entry_number" "text", "p_customer_id" "text", "p_allocations" "jsonb", "p_amount" numeric, "p_payment_mode" "text", "p_ref_number" "text", "p_remarks" "text", "p_created_by" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_transaction_id TEXT;
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_customer_record RECORD;
  v_allocation JSONB;
  v_order_id TEXT;
  v_alloc_amount NUMERIC;
  v_grand_total NUMERIC;
  v_new_amount_paid NUMERIC;
BEGIN
  SELECT * INTO v_customer_record FROM profiles WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Customer not found');
  END IF;

  v_transaction_id := 'TX-' || p_receipt_entry_number;

  INSERT INTO transactions (
    id, "userId", type, "ledgerType", "refId", debit, credit,
    "balanceBefore", "balanceAfter", "availableCredit", remarks,
    "createdBy", timestamp, "isVerified", "verifiedAt", "verifiedBy",
    "paymentMode", "paymentId", receipt_entry_number
  ) VALUES (
    v_transaction_id,
    p_customer_id,
    'RECEIPT',
    'CASH',
    p_receipt_entry_number,
    0,
    p_amount,
    COALESCE(v_customer_record."usedCredit", 0),
    COALESCE(v_customer_record."usedCredit", 0) - p_amount,
    0,
    p_remarks,
    p_created_by,
    to_jsonb(v_now::text),
    true,
    to_jsonb(v_now::text),
    p_created_by,
    p_payment_mode,
    p_ref_number,
    p_receipt_entry_number
  );

  -- Insert into payments table with correct JSONB timestamp casts
  INSERT INTO payments (
    id, "userId", amount, "paymentMode", status, "approvedBy", "approvedAt", metadata, "createdAt", receipt_entry_number
  ) VALUES (
    'PAY-' || p_receipt_entry_number,
    p_customer_id,
    p_amount,
    p_payment_mode,
    'APPROVED',
    p_created_by::text,
    to_jsonb(v_now::text),
    jsonb_build_object('refNumber', p_ref_number, 'remarks', p_remarks),
    to_jsonb(v_now::text),
    p_receipt_entry_number
  );

  UPDATE profiles
  SET 
    "usedCredit" = COALESCE("usedCredit", 0) - p_amount,
    current_recharge = COALESCE(current_recharge, 0) + p_amount
  WHERE id = p_customer_id;

  -- Process Allocations (Against Reference)
  IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
    FOR v_allocation IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      v_order_id := v_allocation->>'orderId';
      v_alloc_amount := (v_allocation->>'amount')::NUMERIC;
      
      IF v_order_id IS NOT NULL AND v_alloc_amount > 0 THEN
        -- Update the order's amount_paid
        UPDATE orders
        SET amount_paid = COALESCE(amount_paid, 0) + v_alloc_amount,
            receipt_entry_number = CASE WHEN receipt_entry_number IS NULL THEN p_receipt_entry_number ELSE receipt_entry_number || ',' || p_receipt_entry_number END
        WHERE id = v_order_id
        RETURNING grand_total_snapshot, amount_paid INTO v_grand_total, v_new_amount_paid;
        
        -- If fully paid, set receipt_created = true
        IF v_new_amount_paid >= v_grand_total THEN
          UPDATE orders SET receipt_created = true WHERE id = v_order_id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'receiptEntryNumber', p_receipt_entry_number);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."create_receipt_entry"("p_receipt_entry_number" "text", "p_customer_id" "text", "p_allocations" "jsonb", "p_amount" numeric, "p_payment_mode" "text", "p_ref_number" "text", "p_remarks" "text", "p_created_by" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_receipt_entry"("p_receipt_entry_number" "text", "p_customer_id" "text", "p_allocations" "jsonb", "p_amount" numeric, "p_payment_mode" "text", "p_ref_number" "text", "p_remarks" "text", "p_created_by" "text", "p_link" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_transaction_id TEXT;
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_customer_record RECORD;
  v_allocation JSONB;
  v_order_id TEXT;
  v_alloc_amount NUMERIC;
  v_grand_total NUMERIC;
  v_new_amount_paid NUMERIC;
BEGIN
  SELECT * INTO v_customer_record FROM profiles WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Customer not found');
  END IF;

  v_transaction_id := 'TX-' || p_receipt_entry_number;

  INSERT INTO transactions (
    id, "userId", type, "ledgerType", "refId", debit, credit,
    "balanceBefore", "balanceAfter", "availableCredit", remarks,
    "createdBy", timestamp, "isVerified", "verifiedAt", "verifiedBy",
    "paymentMode", "paymentId", receipt_entry_number, link
  ) VALUES (
    v_transaction_id,
    p_customer_id,
    'RECEIPT',
    'CASH',
    p_receipt_entry_number,
    0,
    p_amount,
    COALESCE(v_customer_record."usedCredit", 0),
    COALESCE(v_customer_record."usedCredit", 0) - p_amount,
    0,
    p_remarks,
    p_created_by,
    to_jsonb(v_now::text),
    true,
    to_jsonb(v_now::text),
    p_created_by,
    p_payment_mode,
    p_ref_number,
    p_receipt_entry_number,
    p_link
  );

  -- Insert into payments table
  INSERT INTO payments (
    id, user_id, amount, method, status, verified_by, verified_at, metadata, created_at, receipt_entry_number
  ) VALUES (
    'PAY-' || p_receipt_entry_number,
    p_customer_id,
    p_amount,
    p_payment_mode,
    'verified',
    p_created_by::text,
    v_now,
    jsonb_build_object('refNumber', p_ref_number, 'remarks', p_remarks),
    v_now,
    p_receipt_entry_number
  );

  UPDATE profiles
  SET 
    "usedCredit" = COALESCE("usedCredit", 0) - p_amount,
    current_recharge = COALESCE(current_recharge, 0) + p_amount
  WHERE id = p_customer_id;

  -- Process Allocations (Against Reference)
  IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
    FOR v_allocation IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      v_order_id := v_allocation->>'orderId';
      v_alloc_amount := (v_allocation->>'amount')::NUMERIC;
      
      IF v_order_id IS NOT NULL AND v_alloc_amount > 0 THEN
        -- Update the order's amount_paid
        UPDATE orders
        SET amount_paid = COALESCE(amount_paid, 0) + v_alloc_amount,
            receipt_entry_number = CASE WHEN receipt_entry_number IS NULL THEN p_receipt_entry_number ELSE receipt_entry_number || ',' || p_receipt_entry_number END
        WHERE id = v_order_id
        RETURNING grand_total_snapshot, amount_paid INTO v_grand_total, v_new_amount_paid;
        
        -- If fully paid, set receipt_created = true
        IF v_new_amount_paid >= v_grand_total THEN
          UPDATE orders SET receipt_created = true WHERE id = v_order_id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'receiptEntryNumber', p_receipt_entry_number);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."create_receipt_entry"("p_receipt_entry_number" "text", "p_customer_id" "text", "p_allocations" "jsonb", "p_amount" numeric, "p_payment_mode" "text", "p_ref_number" "text", "p_remarks" "text", "p_created_by" "text", "p_link" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_sale_entry"("p_sale_entry_number" "text", "p_customer_id" "text", "p_order_ids" "text"[], "p_total_amount" numeric, "p_remarks" "text", "p_created_by" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_transaction_id TEXT;
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_customer_record RECORD;
BEGIN
  SELECT * INTO v_customer_record FROM profiles WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Customer not found');
  END IF;

  v_transaction_id := 'TX-' || p_sale_entry_number;

  INSERT INTO transactions (
    id, "userId", type, "ledgerType", "refId", debit, credit,
    "balanceBefore", "balanceAfter", "availableCredit", remarks,
    "createdBy", timestamp, "isVerified", "verifiedAt", "verifiedBy",
    sale_entry_number
  ) VALUES (
    v_transaction_id,
    p_customer_id,
    'SALE',
    'CASH',
    p_sale_entry_number,
    p_total_amount,
    0,
    COALESCE(v_customer_record."usedCredit", 0),
    COALESCE(v_customer_record."usedCredit", 0) + p_total_amount,
    0,
    p_remarks,
    p_created_by,
    to_jsonb(v_now::text),
    true,
    to_jsonb(v_now::text),
    p_created_by,
    p_sale_entry_number
  );

  UPDATE profiles
  SET "usedCredit" = COALESCE("usedCredit", 0) + p_total_amount
  WHERE id = p_customer_id;

  UPDATE orders
  SET sale_entry_number = p_sale_entry_number,
      sale_created = true
  WHERE id = ANY(p_order_ids);

  RETURN jsonb_build_object('success', true, 'saleEntryNumber', p_sale_entry_number);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."create_sale_entry"("p_sale_entry_number" "text", "p_customer_id" "text", "p_order_ids" "text"[], "p_total_amount" numeric, "p_remarks" "text", "p_created_by" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_sale_entry"("p_sale_entry_number" "text", "p_customer_id" "text", "p_order_ids" "text"[], "p_total_amount" numeric, "p_remarks" "text", "p_created_by" "text", "p_link" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_transaction_id TEXT;
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_customer_record RECORD;
BEGIN
  SELECT * INTO v_customer_record FROM profiles WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Customer not found');
  END IF;

  v_transaction_id := 'TX-' || p_sale_entry_number;

  INSERT INTO transactions (
    id, "userId", type, "ledgerType", "refId", debit, credit,
    "balanceBefore", "balanceAfter", "availableCredit", remarks,
    "createdBy", timestamp, "isVerified", "verifiedAt", "verifiedBy",
    sale_entry_number, link
  ) VALUES (
    v_transaction_id,
    p_customer_id,
    'SALE',
    'CASH',
    p_sale_entry_number,
    p_total_amount,
    0,
    COALESCE(v_customer_record."usedCredit", 0),
    COALESCE(v_customer_record."usedCredit", 0) + p_total_amount,
    0,
    p_remarks,
    p_created_by,
    to_jsonb(v_now::text),
    true,
    to_jsonb(v_now::text),
    p_created_by,
    p_sale_entry_number,
    p_link
  );

  UPDATE profiles
  SET "usedCredit" = COALESCE("usedCredit", 0) + p_total_amount
  WHERE id = p_customer_id;

  UPDATE orders
  SET sale_entry_number = p_sale_entry_number,
      sale_created = true
  WHERE id = ANY(p_order_ids);

  RETURN jsonb_build_object('success', true, 'saleEntryNumber', p_sale_entry_number);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."create_sale_entry"("p_sale_entry_number" "text", "p_customer_id" "text", "p_order_ids" "text"[], "p_total_amount" numeric, "p_remarks" "text", "p_created_by" "text", "p_link" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_invoice_immutability"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- We only enforce this if the old row has financial_lock_at set
  IF OLD.financial_lock_at IS NOT NULL THEN
    -- Check if any protected column is being modified
    IF OLD.customer_snapshot IS DISTINCT FROM NEW.customer_snapshot OR
       OLD.company_snapshot IS DISTINCT FROM NEW.company_snapshot OR
       OLD.items IS DISTINCT FROM NEW.items OR
       OLD.taxable_value IS DISTINCT FROM NEW.taxable_value OR
       OLD.cgst_amount IS DISTINCT FROM NEW.cgst_amount OR
       OLD.sgst_amount IS DISTINCT FROM NEW.sgst_amount OR
       OLD.igst_amount IS DISTINCT FROM NEW.igst_amount OR
       OLD.grand_total IS DISTINCT FROM NEW.grand_total OR
       OLD.invoice_number IS DISTINCT FROM NEW.invoice_number OR
       OLD.invoice_date IS DISTINCT FROM NEW.invoice_date OR
       OLD.financial_year IS DISTINCT FROM NEW.financial_year OR
       OLD.snapshot_hash IS DISTINCT FROM NEW.snapshot_hash OR
       OLD.pdf_sha256 IS DISTINCT FROM NEW.pdf_sha256 OR
       OLD.pdf_url IS DISTINCT FROM NEW.pdf_url OR
       OLD.pdf_generated_at IS DISTINCT FROM NEW.pdf_generated_at
    THEN
      RAISE EXCEPTION 'Invoice is financially locked. Modification of immutable financial or snapshot fields is strictly prohibited.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_invoice_immutability"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_invoice_for_child_orders"("p_child_order_ids" "text"[], "p_parent_order_id" "text", "p_customer_id" "text", "p_actor_id" "text", "p_actor_name" "text", "p_invoice_date" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("success" boolean, "invoice_id" "text", "invoice_number" "text", "message" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_fy             TEXT;
  v_prefix         TEXT;
  v_seq            INTEGER;
  v_is_locked      BOOLEAN;
  v_new_inv_num    TEXT;
  v_new_inv_id     TEXT;
  v_already_invoiced INTEGER;
  v_order_id       TEXT;
BEGIN
  -- 1. Validate that none of the selected child orders are already invoiced
  SELECT COUNT(*)
  INTO v_already_invoiced
  FROM public.orders
  WHERE id = ANY(p_child_order_ids)
    AND invoice_generated = TRUE;

  IF v_already_invoiced > 0 THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT,
      format('%s selected item(s) are already invoiced. Deselect them and try again.', v_already_invoiced)::TEXT;
    RETURN;
  END IF;

  -- 2. Lock all selected child orders for update (prevents concurrent generation)
  PERFORM id FROM public.orders
  WHERE id = ANY(p_child_order_ids)
  FOR UPDATE;

  -- 3. Reserve the next sequential invoice number
  v_fy := public.get_financial_year(p_invoice_date);

  SELECT prefix, last_number, is_locked
  INTO v_prefix, v_seq, v_is_locked
  FROM public.invoice_sequences
  WHERE financial_year = v_fy
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.invoice_sequences (financial_year, prefix, separator, padding_length, last_number)
    VALUES (v_fy, 'HE/', '/', 6, 0)
    RETURNING prefix, last_number, is_locked
    INTO v_prefix, v_seq, v_is_locked;
  END IF;

  IF v_is_locked THEN
    RAISE EXCEPTION 'Financial year % is locked. Cannot generate invoices.', v_fy;
  END IF;

  v_seq := v_seq + 1;

  UPDATE public.invoice_sequences
  SET last_number = v_seq, updated_at = now()
  WHERE financial_year = v_fy;

  v_new_inv_num := v_prefix || v_fy || '/' || lpad(v_seq::TEXT, 6, '0');
  v_new_inv_id  := 'INV-' || gen_random_uuid()::TEXT;

  -- 4. Create the invoice row
  INSERT INTO public.invoices (
    id, invoice_number, invoice_sequence, financial_year,
    invoice_number_reserved_at, parent_order_id, status,
    customer_id, invoice_date, reservation_user_id, reservation_user_name,
    generated_at
  ) VALUES (
    v_new_inv_id, v_new_inv_num, v_seq, v_fy,
    now(), p_parent_order_id, 'GENERATED',
    p_customer_id, p_invoice_date, p_actor_id, p_actor_name,
    now()
  );

  -- 5. Log the generation event
  INSERT INTO public.invoice_events (invoice_id, event_type, actor_id, actor_name, event_metadata)
  VALUES (v_new_inv_id, 'GENERATION_COMPLETED', p_actor_id, p_actor_name,
          jsonb_build_object('child_order_ids', to_jsonb(p_child_order_ids)));

  -- 6. Stamp each selected child order with the invoice reference
  UPDATE public.orders
  SET
    invoice_id           = v_new_inv_id,
    invoice_number       = v_new_inv_num,
    invoice_generated    = TRUE,
    invoice_generated_at = now(),
    invoice_status       = 'GENERATED'
  WHERE id = ANY(p_child_order_ids);

  RETURN QUERY SELECT true, v_new_inv_id, v_new_inv_num, 'Invoice generated successfully'::TEXT;
END;
$$;


ALTER FUNCTION "public"."generate_invoice_for_child_orders"("p_child_order_ids" "text"[], "p_parent_order_id" "text", "p_customer_id" "text", "p_actor_id" "text", "p_actor_name" "text", "p_invoice_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_invoice_tx"("p_parent_order_id" "text", "p_invoice_id" "text", "p_invoice_number" "text", "p_child_ids" "text"[], "p_customer_id" "text", "p_customer_snapshot" "jsonb", "p_items" "jsonb", "p_amounts" "jsonb", "p_order_type" "text", "p_payment_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_exists boolean;
  v_result jsonb;
BEGIN
  -- 1. Lock the parent order row
  PERFORM 1 FROM orders WHERE id = p_parent_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent order % not found', p_parent_order_id;
  END IF;

  -- 2. Check again if invoice already exists
  SELECT EXISTS(SELECT 1 FROM invoices WHERE "parentOrderId" = p_parent_order_id) INTO v_exists;
  IF v_exists THEN
    RETURN jsonb_build_object('success', false, 'reason', 'ALREADY_EXISTS');
  END IF;

  -- 3. Generate the invoice record
  INSERT INTO invoices (
    id, "invoiceNumber", "parentOrderId", "childOrderIds", "customerId",
    "customerSnapshot", items, amounts, status, "generatedBy",
    "orderType", "paymentStatus", "createdAt", "updatedAt"
  ) VALUES (
    p_invoice_id,
    p_invoice_number,
    p_parent_order_id,
    p_child_ids,
    p_customer_id,
    p_customer_snapshot,
    p_items,
    p_amounts,
    'ACTIVE',
    'SYSTEM',
    p_order_type,
    p_payment_status,
    NOW(),
    NOW()
  );

  -- 4. Set invoiceNumber on Parent Order
  UPDATE orders
  SET "invoiceNumber" = p_invoice_number, "updatedAt" = to_jsonb(NOW()::text)
  WHERE id = p_parent_order_id;

  v_result := jsonb_build_object('success', true);
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."generate_invoice_tx"("p_parent_order_id" "text", "p_invoice_id" "text", "p_invoice_number" "text", "p_child_ids" "text"[], "p_customer_id" "text", "p_customer_snapshot" "jsonb", "p_items" "jsonb", "p_amounts" "jsonb", "p_order_type" "text", "p_payment_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_order_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- If the order ID is not provided, or if we want to force the ORD- format
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := 'ORD-' || nextval('order_id_seq');
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_order_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_financial_year"("p_date" "date") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  v_year INTEGER := extract(year from p_date);
  v_month INTEGER := extract(month from p_date);
  v_next_year INTEGER;
BEGIN
  IF v_month < 4 THEN
    v_next_year := v_year;
    v_year := v_year - 1;
  ELSE
    v_next_year := v_year + 1;
  END IF;
  RETURN v_year::TEXT || '-' || right(v_next_year::TEXT, 2);
END;
$$;


ALTER FUNCTION "public"."get_financial_year"("p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_order_id"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  next_id text;
BEGIN
  -- Grab the next number and attach 'ORD-' to it
  next_id := 'ORD-' || nextval('order_id_seq');
  RETURN next_id;
END;
$$;


ALTER FUNCTION "public"."get_next_order_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_rate_limit"("p_key" "text", "p_limit" integer, "p_window_interval" interval) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_hits INTEGER;
    v_reset_at TIMESTAMP WITH TIME ZONE;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    SELECT hits, reset_at INTO v_hits, v_reset_at FROM public.rate_limits WHERE key = p_key;
    IF NOT FOUND OR v_now > v_reset_at THEN
        v_reset_at := v_now + p_window_interval;
        INSERT INTO public.rate_limits (key, hits, reset_at)
        VALUES (p_key, 1, v_reset_at)
        ON CONFLICT (key) DO UPDATE
        SET hits = 1, reset_at = v_reset_at;
        RETURN jsonb_build_object('allowed', TRUE, 'remaining', p_limit - 1, 'reset_at', v_reset_at);
    END IF;

    IF v_hits >= p_limit THEN
        RETURN jsonb_build_object('allowed', FALSE, 'remaining', 0, 'reset_at', v_reset_at);
    END IF;

    UPDATE public.rate_limits SET hits = hits + 1 WHERE key = p_key RETURNING hits INTO v_hits;
    RETURN jsonb_build_object('allowed', TRUE, 'remaining', p_limit - v_hits, 'reset_at', v_reset_at);
END;
$$;


ALTER FUNCTION "public"."increment_rate_limit"("p_key" "text", "p_limit" integer, "p_window_interval" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."place_order_tx"("p_customer_id" "text", "p_order_type" "text", "p_grand_total" numeric, "p_parent_order" "jsonb", "p_child_orders" "jsonb"[], "p_order_items" "jsonb"[], "p_ledger_entries" "jsonb"[], "p_jobs" "jsonb"[], "p_idempotency_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_used_credit numeric;
  v_credit_limit numeric;
  v_new_used_credit numeric;
  v_result jsonb;
  v_exists boolean;
  v_now timestamp with time zone := NOW();
  v_now_json jsonb := to_jsonb(v_now::text);
BEGIN
  -- 1. Idempotency Check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM idempotency_keys WHERE idempotency_key = p_idempotency_key) INTO v_exists;
    IF v_exists THEN
      -- Retrieve the existing order ID corresponding to this idempotency key
      SELECT order_id INTO v_result FROM idempotency_keys WHERE idempotency_key = p_idempotency_key;
      RETURN jsonb_build_object(
        'success', true,
        'orderId', v_result,
        'duplicate', true
      );
    END IF;
  END IF;

  -- 2. Read and Lock Customer Profile Row
  SELECT COALESCE("usedCredit", 0), COALESCE("creditLimit", 0)
  INTO v_used_credit, v_credit_limit
  FROM profiles
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer profile not found for ID %', p_customer_id;
  END IF;

  -- 3. Validate Credit Limit (if CREDIT customer)
  IF p_order_type = 'CREDIT' THEN
    IF (v_used_credit + p_grand_total) > v_credit_limit THEN
      RAISE EXCEPTION 'Credit limit exceeded. Current used: %, Limit: %, Requested: %', v_used_credit, v_credit_limit, p_grand_total;
    END IF;
  END IF;

  -- 4. Update Locked Customer Used Credit Balance
  v_new_used_credit := v_used_credit + p_grand_total;
  UPDATE profiles
  SET "usedCredit" = v_new_used_credit, "updatedAt" = v_now_json
  WHERE id = p_customer_id;

  -- 5. Insert Parent Order (if provided)
  IF p_parent_order IS NOT NULL THEN
    INSERT INTO orders (
      id, "customerId", "customerName", "customerSnapshot", "orderType", "orderSource",
      "createdBy", "createdByRole", "proxyExecutor", "printerCategory", amounts, delivery,
      workflow, "workflowSnapshot", "currentWorkflowRole", "currentWorkflowLabel",
      "productionNotes", "thumbnailUrl", "productName", "description", items, status, "paymentStatus",
      "createdAt", "updatedAt", "shippingAddress", "deliveryChoice",
      "ref_order_id", "parent_order_id",
      cgst_percentage, cgst_amount, sgst_percentage, sgst_amount, igst_percentage, igst_amount,
      gst_type, allocated_logistics_percentage, allocated_logistics_amount, item_amount,
      taxable_value_snapshot, grand_total_snapshot
    ) VALUES (
      p_parent_order->>'id',
      p_parent_order->>'customerId',
      p_parent_order->>'customerName',
      COALESCE(p_parent_order->'customerSnapshot', '{}'::jsonb),
      p_parent_order->>'orderType',
      p_parent_order->>'orderSource',
      p_parent_order->>'createdBy',
      p_parent_order->>'createdByRole',
      p_parent_order->'proxyExecutor',
      p_parent_order->>'printerCategory',
      p_parent_order->'amounts',
      p_parent_order->'delivery',
      p_parent_order->'workflow',
      p_parent_order->'workflowSnapshot',
      p_parent_order->>'currentWorkflowRole',
      p_parent_order->>'currentWorkflowLabel',
      p_parent_order->>'productionNotes',
      p_parent_order->>'thumbnailUrl',
      p_parent_order->>'productName',
      p_parent_order->>'description',
      COALESCE(p_parent_order->'items', '[]'::jsonb),
      p_parent_order->>'status',
      p_parent_order->>'paymentStatus',
      COALESCE(p_parent_order->'createdAt', v_now_json),
      COALESCE(p_parent_order->'updatedAt', v_now_json),
      p_parent_order->>'shippingAddress',
      p_parent_order->>'deliveryChoice',
      p_parent_order->>'ref_order_id',
      p_parent_order->>'parent_order_id',
      (p_parent_order->>'cgst_percentage')::numeric,
      (p_parent_order->>'cgst_amount')::numeric,
      (p_parent_order->>'sgst_percentage')::numeric,
      (p_parent_order->>'sgst_amount')::numeric,
      (p_parent_order->>'igst_percentage')::numeric,
      (p_parent_order->>'igst_amount')::numeric,
      p_parent_order->>'gst_type',
      (p_parent_order->>'allocated_logistics_percentage')::numeric,
      (p_parent_order->>'allocated_logistics_amount')::numeric,
      (p_parent_order->>'item_amount')::numeric,
      (p_parent_order->>'taxable_value_snapshot')::numeric,
      (p_parent_order->>'grand_total_snapshot')::numeric
    );
  END IF;

  -- 6. Insert Child Orders (Batch)
  IF p_child_orders IS NOT NULL THEN
    INSERT INTO orders (
      id, "customerId", "customerName", "customerSnapshot", "orderType", "orderSource",
      "createdBy", "createdByRole", "proxyExecutor", "printerCategory", amounts, delivery,
      workflow, "workflowSnapshot", "currentWorkflowRole", "currentWorkflowLabel",
      "productionNotes", "thumbnailUrl", "productName", "description", items, status, "paymentStatus",
      "createdAt", "updatedAt", "shippingAddress", "deliveryChoice",
      "ref_order_id", "parent_order_id",
      cgst_percentage, cgst_amount, sgst_percentage, sgst_amount, igst_percentage, igst_amount,
      gst_type, allocated_logistics_percentage, allocated_logistics_amount, item_amount,
      taxable_value_snapshot, grand_total_snapshot
    )
    SELECT
      child_val->>'id',
      child_val->>'customerId',
      child_val->>'customerName',
      COALESCE(child_val->'customerSnapshot', '{}'::jsonb),
      child_val->>'orderType',
      child_val->>'orderSource',
      child_val->>'createdBy',
      child_val->>'createdByRole',
      child_val->'proxyExecutor',
      child_val->>'printerCategory',
      child_val->'amounts',
      child_val->'delivery',
      child_val->'workflow',
      child_val->'workflowSnapshot',
      child_val->>'currentWorkflowRole',
      child_val->>'currentWorkflowLabel',
      child_val->>'productionNotes',
      child_val->>'thumbnailUrl',
      child_val->>'productName',
      child_val->>'description',
      COALESCE(child_val->'items', '[]'::jsonb),
      child_val->>'status',
      child_val->>'paymentStatus',
      COALESCE(child_val->'createdAt', v_now_json),
      COALESCE(child_val->'updatedAt', v_now_json),
      child_val->>'shippingAddress',
      child_val->>'deliveryChoice',
      child_val->>'ref_order_id',
      child_val->>'parent_order_id',
      (child_val->>'cgst_percentage')::numeric,
      (child_val->>'cgst_amount')::numeric,
      (child_val->>'sgst_percentage')::numeric,
      (child_val->>'sgst_amount')::numeric,
      (child_val->>'igst_percentage')::numeric,
      (child_val->>'igst_amount')::numeric,
      child_val->>'gst_type',
      (child_val->>'allocated_logistics_percentage')::numeric,
      (child_val->>'allocated_logistics_amount')::numeric,
      (child_val->>'item_amount')::numeric,
      (child_val->>'taxable_value_snapshot')::numeric,
      (child_val->>'grand_total_snapshot')::numeric
    FROM unnest(p_child_orders) AS child_val;
  END IF;

  -- 7. Insert Order Items into order_items table (Batch)
  IF p_order_items IS NOT NULL THEN
    INSERT INTO order_items (
      id, order_id, product_name, product_id, category, project_name, specs, material_metadata,
      pricing_snapshot, file_url, design_url, design_status, design_upload_stats,
      "assignedPrinterId", "assignedPrinterName", "fileUrl", "productId", "productName",
      "projectName", "materialMetadata", "pricingSnapshot", "designUrl", "designStatus",
      "designUploadStats", description, "designType", "itemWorkspace", created_at, updated_at
    )
    SELECT
      item_val->>'id',
      item_val->>'orderId',
      item_val->>'productName',
      item_val->>'productId',
      item_val->>'category',
      item_val->>'projectName',
      COALESCE(item_val->'specs', '{}'::jsonb),
      COALESCE(item_val->'materialMetadata', '{}'::jsonb),
      COALESCE(item_val->'pricingSnapshot', '{}'::jsonb),
      item_val->>'fileUrl',
      item_val->>'designUrl',
      item_val->>'designStatus',
      COALESCE(item_val->'designUploadStats', '{}'::jsonb),
      item_val->>'assignedPrinterId',
      item_val->>'assignedPrinterName',
      item_val->>'fileUrl',
      item_val->>'productId',
      item_val->>'productName',
      item_val->>'projectName',
      COALESCE(item_val->'materialMetadata', '{}'::jsonb),
      COALESCE(item_val->'pricingSnapshot', '{}'::jsonb),
      item_val->>'designUrl',
      item_val->>'designStatus',
      COALESCE(item_val->'designUploadStats', '{}'::jsonb),
      item_val->>'description',
      item_val->>'designType',
      COALESCE(item_val->'itemWorkspace', '{}'::jsonb),
      v_now,
      v_now
    FROM unnest(p_order_items) AS item_val;
  END IF;

  -- 8. Insert Ledger Entries into transactions table (Batch)
  IF p_ledger_entries IS NOT NULL THEN
    INSERT INTO transactions (
      id, "userId", type, "ledgerType", "refId", debit, credit, "balanceBefore", "balanceAfter",
      "availableCredit", remarks, "createdBy", timestamp, "isVerified", "verifiedAt", "verifiedBy",
      "paymentId"
    )
    SELECT
      ledger_val->>'id',
      ledger_val->>'userId',
      ledger_val->>'type',
      ledger_val->>'ledgerType',
      ledger_val->>'refId',
      COALESCE((ledger_val->>'debit')::numeric, 0),
      COALESCE((ledger_val->>'credit')::numeric, 0),
      COALESCE((ledger_val->>'balanceBefore')::numeric, 0),
      COALESCE((ledger_val->>'balanceAfter')::numeric, 0),
      COALESCE((ledger_val->>'availableCredit')::numeric, 0),
      ledger_val->>'remarks',
      ledger_val->>'createdBy',
      to_jsonb(COALESCE(ledger_val->>'timestamp', v_now::text)),
      COALESCE((ledger_val->>'isVerified')::boolean, false),
      CASE WHEN ledger_val->>'verifiedAt' IS NOT NULL THEN to_jsonb(ledger_val->>'verifiedAt') ELSE NULL END,
      ledger_val->>'verifiedBy',
      ledger_val->>'paymentId'
    FROM unnest(p_ledger_entries) AS ledger_val;
  END IF;

    -- 9. Insert Jobs into document_jobs table (Batch)
    IF p_jobs IS NOT NULL THEN
      INSERT INTO document_jobs (
        id, "jobType", "orderId", "parentOrderId", priority, status, "createdAt", "payload"
      )
      SELECT
        job_val->>'jobId',
        job_val->>'jobType',
        job_val->>'orderId',
        p_parent_order->>'id',
        COALESCE((job_val->>'priority')::integer, 2),
        'PENDING',
        v_now,
        COALESCE(job_val->'payload', '{}'::jsonb)
      FROM unnest(p_jobs) AS job_val;
    END IF;

  -- 10. Record Idempotency Key (if provided)
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO idempotency_keys (idempotency_key, order_id, created_at)
    VALUES (p_idempotency_key, COALESCE(p_parent_order->>'id', (p_child_orders[1])->>'id'), v_now);
  END IF;

  -- 11. Return Success
  RETURN jsonb_build_object(
    'success', true,
    'orderId', COALESCE(p_parent_order->>'id', (p_child_orders[1])->>'id'),
    'duplicate', false
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;


ALTER FUNCTION "public"."place_order_tx"("p_customer_id" "text", "p_order_type" "text", "p_grand_total" numeric, "p_parent_order" "jsonb", "p_child_orders" "jsonb"[], "p_order_items" "jsonb"[], "p_ledger_entries" "jsonb"[], "p_jobs" "jsonb"[], "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_hsn_code_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.hsn_code <> OLD.hsn_code THEN
    RAISE EXCEPTION 'HSN Code is immutable. Create a new HSN code instead.';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_hsn_code_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_audit_logs"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable. No updates or deletes allowed.';
END;
$$;


ALTER FUNCTION "public"."protect_audit_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_invoice_number"("p_invoice_date" "date") RETURNS TABLE("invoice_number" "text", "invoice_sequence" integer, "financial_year" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_fy TEXT;
  v_prefix TEXT;
  v_separator TEXT;
  v_padding INTEGER;
  v_seq INTEGER;
  v_is_locked BOOLEAN;
  v_inv_num TEXT;
BEGIN
  v_fy := public.get_financial_year(p_invoice_date);

  -- Lock the row for update
  SELECT prefix, last_number, is_locked 
  INTO v_prefix, v_seq, v_is_locked
  FROM public.invoice_sequences
  WHERE public.invoice_sequences.financial_year = v_fy
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Auto-create sequence for new FY if it doesn't exist
    INSERT INTO public.invoice_sequences (financial_year, prefix, separator, padding_length, last_number)
    VALUES (v_fy, 'HE/', 0)
    RETURNING prefix, last_number, is_locked
    INTO v_prefix, v_seq, v_is_locked;
  END IF;

  IF v_is_locked THEN
    RAISE EXCEPTION 'Financial year % is locked. Cannot generate invoices.', v_fy;
  END IF;

  v_seq := v_seq + 1;

  UPDATE public.invoice_sequences
  SET last_number = v_seq, updated_at = now()
  WHERE public.invoice_sequences.financial_year = v_fy;

  v_inv_num := v_prefix || v_fy || '/' || lpad(v_seq::TEXT, 6, '0');

  RETURN QUERY SELECT v_inv_num, v_seq, v_fy;
END;
$$;


ALTER FUNCTION "public"."reserve_invoice_number"("p_invoice_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_profile_uid"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
    begin
      new.uid := coalesce(new.uid, new.id);
      new.updated_at := coalesce(new.updated_at, now());
      return new;
    end;
    $$;


ALTER FUNCTION "public"."sync_profile_uid"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounts_ledger" (
    "id" "text" NOT NULL,
    "customer_id" "text",
    "order_id" "text",
    "entry_type" "text",
    "debit" numeric DEFAULT 0 NOT NULL,
    "credit" numeric DEFAULT 0 NOT NULL,
    "balance" numeric DEFAULT 0 NOT NULL,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."accounts_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "text" NOT NULL,
    "action" "text",
    "actor_id" "text",
    "actor_name" "text",
    "details" "jsonb",
    "timestamp" timestamp with time zone,
    "meta" "jsonb",
    "systemVersion" "text",
    "userId" "text",
    "userRole" "text"
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."anomalies" (
    "id" "text" NOT NULL,
    "order_id" "text",
    "status" "text",
    "title" "text",
    "details" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "metadata" "jsonb"
);


ALTER TABLE "public"."anomalies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "text" NOT NULL,
    "action_type" "text",
    "actor_id" "text",
    "actor_name" "text",
    "target_id" "text",
    "target_type" "text",
    "payload" "jsonb",
    "timestamp" timestamp with time zone,
    "metadata" "jsonb",
    "actedAs" "text",
    "actedAsType" "text",
    "actionType" "text",
    "adminId" "text",
    "adminRole" "text",
    "afterState" "jsonb",
    "beforeState" "jsonb",
    "entityId" "text",
    "entityType" "text",
    "meta" "jsonb",
    "systemVersion" "text",
    "actor_role" "text",
    "ip_address" "text",
    "user_agent" "text",
    "session_id" "text",
    "request_id" "text",
    "previous_value" "jsonb",
    "new_value" "jsonb"
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_stats" (
    "id" "text" NOT NULL,
    "total" bigint,
    "actions" "jsonb",
    "updated_at" timestamp with time zone,
    "admins" "jsonb"
);


ALTER TABLE "public"."audit_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_designs" (
    "id" "text" NOT NULL,
    "data" "jsonb",
    "metadata" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "compressedSize" bigint,
    "contentType" "text",
    "dataBase64" "text",
    "filename" "text",
    "isFallback" boolean,
    "orderId" "text",
    "originalSize" bigint,
    "uploadedAt" timestamp with time zone
);


ALTER TABLE "public"."backup_designs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bankAccounts" (
    "id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "accountNumber" "text",
    "description" "text",
    "ifsc" "text",
    "label" "text",
    "payeeName" "text",
    "paymentType" "text",
    "qrUrl" "text",
    "upiId" "text",
    "opening_balance" numeric(15,2) DEFAULT 0.00
);


ALTER TABLE "public"."bankAccounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_accounts" (
    "id" "text" NOT NULL,
    "label" "text",
    "account_number" "text",
    "ifsc" "text",
    "description" "text",
    "qr_url" "text",
    "payee_name" "text",
    "upi_id" "text",
    "payment_type" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."bank_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_amount_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "transaction_type" "text" NOT NULL,
    "reference_id" "text",
    "debit" numeric(15,2) DEFAULT 0.00,
    "credit" numeric(15,2) DEFAULT 0.00,
    "balance_before" numeric(15,2) DEFAULT 0.00,
    "balance_after" numeric(15,2) DEFAULT 0.00,
    "transaction_date" "date" DEFAULT CURRENT_DATE,
    "remarks" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bank_amount_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bankaccounts" (
    "id" "text" NOT NULL,
    "label" "text",
    "account_number" "text",
    "ifsc" "text",
    "description" "text",
    "qr_url" "text",
    "payee_name" "text",
    "upi_id" "text",
    "payment_type" "text"
);


ALTER TABLE "public"."bankaccounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cart" (
    "id" "text" NOT NULL,
    "user_id" "text",
    "product_id" "text",
    "quantity" integer,
    "metadata" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "basePrice" numeric,
    "category" "text",
    "createdAt" timestamp with time zone,
    "imageUrl" "text",
    "productId" "text",
    "productName" "text",
    "userId" "text"
);


ALTER TABLE "public"."cart" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "image" "text"
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_bank_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entry_date" "date" DEFAULT CURRENT_DATE,
    "bank_ledger_name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric(15,2) NOT NULL,
    "balance_before" numeric(15,2) DEFAULT 0,
    "balance_after" numeric(15,2) DEFAULT 0,
    "transaction_type" "text",
    "ref_id" "text",
    "narration" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "company_bank_ledger_type_check" CHECK (("type" = ANY (ARRAY['IN'::"text", 'OUT'::"text"])))
);


ALTER TABLE "public"."company_bank_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_cash_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entry_date" "date" DEFAULT CURRENT_DATE,
    "cash_ledger_name" "text" DEFAULT 'Cash'::"text" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric(15,2) NOT NULL,
    "balance_before" numeric(15,2) DEFAULT 0,
    "balance_after" numeric(15,2) DEFAULT 0,
    "transaction_type" "text",
    "ref_id" "text",
    "narration" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "company_cash_ledger_type_check" CHECK (("type" = ANY (ARRAY['IN'::"text", 'OUT'::"text"])))
);


ALTER TABLE "public"."company_cash_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_full_details" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_name" "text" NOT NULL,
    "cash_amount" numeric(15,2) DEFAULT 0.00,
    "bank_amount" numeric(15,2) DEFAULT 0.00,
    "status" "text" NOT NULL,
    "transaction_type" "text",
    "transaction_type_ref" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "company_full_details_status_check" CHECK (("status" = ANY (ARRAY['NEW'::"text", 'OLD'::"text"])))
);


ALTER TABLE "public"."company_full_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_profile" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_name" "text" NOT NULL,
    "address_line1" "text",
    "address_line2" "text",
    "city" "text",
    "state" "text",
    "state_code" character varying(2),
    "pincode" character varying(10),
    "gstin" character varying(15),
    "pan" character varying(10),
    "msme_reg" "text",
    "phone" "text",
    "email" "text",
    "website" "text",
    "bank_name" "text",
    "account_number" "text",
    "ifsc" "text",
    "branch" "text",
    "beneficiary_name" "text",
    "upi_id" "text",
    "invoice_prefix" character varying(10) DEFAULT 'HE/'::character varying NOT NULL,
    "declaration" "text",
    "terms" "text",
    "footer_text" "text",
    "logo_url" "text",
    "signature_url" "text",
    "seal_url" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."company_profile" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contra_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contra_number" "text" NOT NULL,
    "source_ledger" "text" NOT NULL,
    "target_ledger" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "remarks" "text",
    "tally_sync_status" "text" DEFAULT 'PENDING'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text",
    "contra_date" "date" DEFAULT CURRENT_DATE,
    "status" "text" DEFAULT 'VERIFIED'::"text",
    "verified_by" "text",
    "verified_at" timestamp with time zone,
    "attachment_url" "text"
);


ALTER TABLE "public"."contra_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "text" NOT NULL,
    "profile_id" "text",
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "address" "text",
    "customer_type" "text" DEFAULT 'CASH'::"text" NOT NULL,
    "credit_limit" numeric DEFAULT 0 NOT NULL,
    "used_credit" numeric DEFAULT 0 NOT NULL,
    "membership" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."design_comments" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "order_id" "text" NOT NULL,
    "item_id" "text" NOT NULL,
    "message" "text" NOT NULL,
    "author_id" "text" NOT NULL,
    "author_name" "text",
    "author_role" "text",
    "attachment_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."design_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."design_proofs" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "order_id" "text" NOT NULL,
    "item_id" "text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "revision_version" integer DEFAULT 1 NOT NULL,
    "url" "text" NOT NULL,
    "cloudinary_public_id" "text",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_by" "text" NOT NULL,
    "sent_by_name" "text",
    "customer_response" "text" DEFAULT 'PENDING'::"text",
    "response_at" timestamp with time zone,
    "rejection_reason" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."design_proofs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."design_revisions" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "order_id" "text" NOT NULL,
    "item_id" "text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "url" "text" NOT NULL,
    "cloudinary_public_id" "text",
    "cloudinary_folder" "text",
    "uploaded_by" "text" NOT NULL,
    "uploaded_by_name" "text",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "revision_type" "text" DEFAULT 'INITIAL'::"text" NOT NULL,
    "upload_stats" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."design_revisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."designs" (
    "id" "text" NOT NULL,
    "data" "jsonb",
    "metadata" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."designs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dispatch_details" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_order_id" "text" NOT NULL,
    "transporter_name" "text",
    "dispatch_through" "text",
    "lr_number" "text",
    "lr_date" "date",
    "vehicle_number" "text",
    "destination" "text",
    "delivery_note" "text",
    "delivery_note_date" "date",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dispatch_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dispatches" (
    "id" "text" NOT NULL,
    "order_id" "text",
    "status" "text",
    "dispatched_by" "text",
    "dispatched_at" timestamp with time zone,
    "metadata" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "dispatchedBy" "text",
    "dispatchedByName" "text",
    "lrNumber" "text",
    "method" "text",
    "notes" "text",
    "orderId" "text",
    "timestamp" timestamp with time zone,
    "transportName" "text"
);


ALTER TABLE "public"."dispatches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."firebase_auth_users" (
    "uid" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "displayName" "text",
    "emailVerified" boolean DEFAULT false,
    "disabled" boolean DEFAULT false,
    "metadata" "jsonb",
    "customClaims" "jsonb"
);


ALTER TABLE "public"."firebase_auth_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hand_cash_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "transaction_type" "text" NOT NULL,
    "reference_id" "text",
    "debit" numeric(15,2) DEFAULT 0.00,
    "credit" numeric(15,2) DEFAULT 0.00,
    "balance_before" numeric(15,2) DEFAULT 0.00,
    "balance_after" numeric(15,2) DEFAULT 0.00,
    "transaction_date" "date" DEFAULT CURRENT_DATE,
    "remarks" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hand_cash_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hsn_gst_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hsn_id" "uuid" NOT NULL,
    "gst_rate" numeric(5,2) NOT NULL,
    "effective_from" "date" NOT NULL,
    "effective_to" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text",
    "updated_by" "text",
    "reason_for_change" "text",
    CONSTRAINT "check_effective_dates" CHECK ((("effective_to" IS NULL) OR ("effective_to" >= "effective_from")))
);


ALTER TABLE "public"."hsn_gst_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hsn_master" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hsn_code" character varying(8) NOT NULL,
    "description" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text",
    "updated_by" "text",
    "reason_for_change" "text",
    "code_type" "text" DEFAULT 'GOODS'::"text" NOT NULL,
    CONSTRAINT "hsn_master_code_type_check" CHECK (("code_type" = ANY (ARRAY['GOODS'::"text", 'SERVICE'::"text"])))
);


ALTER TABLE "public"."hsn_master" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."idempotency_keys" (
    "idempotency_key" "text" NOT NULL,
    "order_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."idempotency_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "text" NOT NULL,
    "event_type" "public"."invoice_event_type" NOT NULL,
    "field_name" "text",
    "old_value" "text",
    "new_value" "text",
    "event_metadata" "jsonb",
    "actor_id" "text",
    "actor_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."invoice_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_generation_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "text" NOT NULL,
    "attempt_number" integer NOT NULL,
    "queue_name" "text",
    "worker_id" "text",
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "result_status" "text",
    "error_message" "text",
    "error_trace" "text"
);


ALTER TABLE "public"."invoice_generation_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_integrity_checks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" character varying NOT NULL,
    "verified_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "verified_by" character varying DEFAULT 'SYSTEM'::character varying NOT NULL,
    "expected_snapshot_hash" character varying,
    "calculated_snapshot_hash" character varying,
    "snapshot_result" character varying NOT NULL,
    "expected_pdf_hash" character varying,
    "calculated_pdf_hash" character varying,
    "pdf_result" character varying NOT NULL,
    "final_result" character varying NOT NULL,
    "verification_duration_ms" integer,
    "algorithm" character varying DEFAULT 'SHA-256'::character varying NOT NULL
);


ALTER TABLE "public"."invoice_integrity_checks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_sequences" (
    "financial_year" character varying(10) NOT NULL,
    "prefix" character varying(10) NOT NULL,
    "last_number" integer DEFAULT 0 NOT NULL,
    "is_locked" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."invoice_sequences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "text" NOT NULL,
    "invoice_number" "text" NOT NULL,
    "invoice_sequence" integer NOT NULL,
    "financial_year" "text" NOT NULL,
    "invoice_number_reserved_at" timestamp with time zone NOT NULL,
    "reservation_reason" "text",
    "reservation_user_id" "text",
    "reservation_user_name" "text",
    "invoice_schema_version" integer DEFAULT 1 NOT NULL,
    "parent_order_id" "text" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "generation_requested_at" timestamp with time zone,
    "queued_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "processing_time_ms" integer,
    "queue_name" "text",
    "worker_id" "text",
    "generation_lock_until" timestamp with time zone,
    "attempt_count" integer DEFAULT 0,
    "max_attempts" integer DEFAULT 6,
    "last_error" "text",
    "last_attempted_at" timestamp with time zone,
    "current_attempt_id" "text",
    "generating_heartbeat_at" timestamp with time zone,
    "financial_lock_at" timestamp with time zone,
    "snapshot_hash" "text",
    "snapshot_hash_algorithm" "text" DEFAULT 'SHA-256'::"text",
    "customer_id" "text" NOT NULL,
    "customer_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "company_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_inter_state" boolean,
    "taxable_value" numeric(12,2),
    "cgst_rate" numeric(5,2),
    "cgst_amount" numeric(12,2),
    "sgst_rate" numeric(5,2),
    "sgst_amount" numeric(12,2),
    "igst_rate" numeric(5,2),
    "igst_amount" numeric(12,2),
    "round_off" numeric(10,2),
    "grand_total" numeric(12,2),
    "amount_in_words" "text",
    "pdf_url" "text",
    "pdf_generated_at" timestamp with time zone,
    "pdf_version" integer DEFAULT 0,
    "pdf_template_version" "text",
    "pdf_sha256" "text",
    "pdf_size_bytes" integer,
    "pdf_content_type" "text",
    "pdf_generated_by" "text",
    "generated_by_system_version" "text",
    "generation_version" integer DEFAULT 1,
    "irn" "text",
    "ack_number" "text",
    "ack_date" timestamp with time zone,
    "qr_code" "text",
    "signed_invoice" "text",
    "invoice_type" "text" DEFAULT 'ORIGINAL'::"text",
    "amendment_of" "text",
    "invoice_date" "date" NOT NULL,
    "order_type" "text",
    "payment_status" "text",
    "lr_number" "text",
    "transporter" "text",
    "vehicle_number" "text",
    "eway_bill" "text",
    "dispatch_date" "date",
    "delivery_date" "date",
    "remarks" "text",
    "row_version" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "generated_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "invoice_integrity_status" character varying DEFAULT 'NOT_VERIFIED'::character varying NOT NULL,
    "last_verified_at" timestamp with time zone,
    "last_verified_by" character varying,
    "last_verification_hash" character varying,
    "transport_amount" numeric(12,2) DEFAULT 0,
    "child_order_ids" "text"[] DEFAULT '{}'::"text"[],
    "item_count" integer DEFAULT 0,
    "is_synced_to_erp" boolean DEFAULT false,
    CONSTRAINT "valid_invoice_status" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'GENERATING'::"text", 'GENERATED'::"text", 'FAILED'::"text", 'PERMANENTLY_FAILED'::"text", 'DLQ'::"text", 'DISPATCH_ROLLED_BACK'::"text", 'CANCELLED'::"text"]))),
    CONSTRAINT "valid_invoice_type" CHECK (("invoice_type" = ANY (ARRAY['ORIGINAL'::"text", 'CREDIT_NOTE'::"text", 'DEBIT_NOTE'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "text" NOT NULL,
    "order_id" "text",
    "product_name" "text",
    "category" "text",
    "sqft" numeric,
    "status" "text",
    "priority" "text",
    "printer_id" "text",
    "notes" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "metadata" "jsonb"
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journal_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "journal_number" "text" NOT NULL,
    "source_customer_id" "text" NOT NULL,
    "target_customer_id" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "remarks" "text",
    "tally_sync_status" "text" DEFAULT 'PENDING'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text",
    "journal_date" "date" DEFAULT CURRENT_DATE,
    "status" "text" DEFAULT 'VERIFIED'::"text",
    "verified_by" "text",
    "verified_at" timestamp with time zone,
    "parent_order_id" "text",
    "ref_order_id" "text",
    "attachment_url" "text"
);


ALTER TABLE "public"."journal_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "text" NOT NULL,
    "user_id" "text",
    "type" "text",
    "title" "text",
    "body" "text",
    "read" boolean,
    "payload" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "event" "text",
    "message" "text",
    "meta" "jsonb",
    "role" "text",
    "status" "text",
    "timestamp" timestamp with time zone,
    "userId" "text"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications_log" (
    "id" "text" NOT NULL,
    "user_id" "text",
    "channel" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "status" "text" NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "delivery_time" timestamp with time zone,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."order_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."order_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "text" NOT NULL,
    "order_id" "text" NOT NULL,
    "product_name" "text",
    "product_id" "text",
    "category" "text",
    "project_name" "text",
    "specs" "jsonb",
    "material_metadata" "jsonb",
    "pricing_snapshot" "jsonb",
    "file_url" "text",
    "design_url" "text",
    "design_status" "text",
    "design_upload_stats" "jsonb",
    "tiff_path" "text",
    "assigned_printer_id" "text",
    "assigned_printer_name" "text",
    "tiff_assigned_at" timestamp with time zone,
    "tiff_assigned_by" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "assignedPrinterId" "text",
    "assignedPrinterName" "text",
    "fileUrl" "text",
    "tiffPath" "text",
    "status" "text",
    "productId" "text",
    "productName" "text",
    "projectName" "text",
    "materialMetadata" "jsonb",
    "pricingSnapshot" "jsonb",
    "tiffAssignedAt" timestamp with time zone,
    "tiffAssignedBy" "text",
    "designUrl" "text",
    "designStatus" "text",
    "designUploadStats" "jsonb",
    "description" "text",
    "designType" "text",
    "itemWorkspace" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ref_order_id" "text",
    "parent_order_id" "text"
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "text" NOT NULL,
    "customerId" "text",
    "customerName" "text",
    "customerSnapshot" "jsonb",
    "orderType" "text",
    "orderSource" "text",
    "createdBy" "text",
    "createdByRole" "text",
    "proxyExecutor" "text",
    "invoiceNumber" "text",
    "amounts" "jsonb",
    "delivery" "jsonb",
    "productionNotes" "text",
    "thumbnailUrl" "text",
    "paymentStatus" "text",
    "wastageNotes" "text",
    "inkUsed" "text",
    "paperUsed" "text",
    "status" "text",
    "workflow" "jsonb",
    "workflowSnapshot" "jsonb",
    "currentWorkflowLabel" "text",
    "currentWorkflowRole" "text",
    "createdAt" "jsonb",
    "updatedAt" "jsonb",
    "dispatchDetails" "jsonb",
    "dispatchInfo" "jsonb",
    "notes" "text",
    "paymentMethod" "text",
    "deliveryproof" "jsonb",
    "printerCategory" "text",
    "productName" "text",
    "description" "text",
    "shippingAddress" "text",
    "proxyName" "text",
    "items" "jsonb",
    "deliveryChoice" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "cgst_percentage" numeric(5,2),
    "cgst_amount" numeric(12,2),
    "sgst_percentage" numeric(5,2),
    "sgst_amount" numeric(12,2),
    "igst_percentage" numeric(5,2),
    "igst_amount" numeric(12,2),
    "gst_type" "text",
    "allocated_logistics_percentage" numeric(8,4),
    "allocated_logistics_amount" numeric(12,2),
    "item_amount" numeric(12,2),
    "taxable_value_snapshot" numeric(12,2),
    "grand_total_snapshot" numeric(12,2),
    "invoice_id" "text",
    "invoice_number" "text",
    "invoice_generated" boolean DEFAULT false NOT NULL,
    "invoice_generated_at" timestamp with time zone,
    "invoice_status" "text" DEFAULT 'PENDING'::"text",
    "is_synced_to_erp" boolean DEFAULT false,
    "sale_entry_number" "text",
    "receipt_entry_number" "text",
    "sale_created" boolean DEFAULT false,
    "receipt_created" boolean DEFAULT false,
    "amount_paid" numeric DEFAULT 0,
    "ref_order_id" "text",
    "parent_order_id" "text"
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_number" "text" NOT NULL,
    "supplier_id" "uuid",
    "amount" numeric NOT NULL,
    "payment_mode" "text" NOT NULL,
    "ref_number" "text",
    "remarks" "text",
    "tally_sync_status" "text" DEFAULT 'PENDING'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text",
    "payment_date" "date" DEFAULT CURRENT_DATE,
    "status" "text" DEFAULT 'VERIFIED'::"text",
    "verified_by" "text",
    "verified_at" timestamp with time zone,
    "allocations" "jsonb" DEFAULT '[]'::"jsonb",
    "parent_order_id" "text",
    "ref_order_id" "text",
    "attachment_url" "text",
    "cash_ledger" "text",
    "upi_app" "text",
    "bank_ledger" "text",
    "bank_name" "text",
    "utr" "text",
    "payment_category" "text" DEFAULT 'Supplier'::"text",
    "full_details" "text"
);


ALTER TABLE "public"."payment_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "text" NOT NULL,
    "orderId" "text",
    "userId" "text",
    "customerName" "text",
    "paymentMode" "text",
    "amount" numeric(15,2),
    "ourBankAccount" "text",
    "depositDate" "text",
    "depositBank" "text",
    "branchName" "text",
    "proofDriveLink" "text",
    "remarks" "text",
    "depositRefNo" "text",
    "status" "text",
    "submittedByAdmin" "text",
    "approvedBy" "text",
    "approvedAt" "jsonb",
    "createdAt" "jsonb",
    "createdByRole" "text",
    "orderIds" "text"[],
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "workflow" "jsonb" DEFAULT '{}'::"jsonb",
    "itemBreakdown" "jsonb" DEFAULT '[]'::"jsonb",
    "baseOrderId" "text",
    "is_synced_to_erp" boolean DEFAULT false,
    "receipt_entry_number" "text"
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "text" NOT NULL,
    "old_hsn_code" character varying(8),
    "new_hsn_code" character varying(8),
    "old_gst_rate" numeric(5,2),
    "new_gst_rate" numeric(5,2),
    "updated_by" "text",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "text" NOT NULL,
    "name" "text",
    "nameLowercase" "text",
    "category" "text",
    "baseRate" numeric(12,2),
    "status" "text",
    "specs" "jsonb",
    "media" "jsonb",
    "eyeletPricing" "jsonb",
    "deliveryPricing" "jsonb",
    "workflowSteps" "jsonb",
    "createdAt" "jsonb",
    "updatedAt" "jsonb",
    "categoryName" "text",
    "description" "text",
    "imageUrl" "text",
    "isActive" boolean DEFAULT true,
    "material" "text",
    "printerCategory" "text",
    "hsn_master_id" "uuid",
    "hsn_code" character varying(8),
    "hsn_description" "text",
    "gst_rate" numeric(5,2),
    "gst_effective_from" "date",
    "product_snapshot_version" integer DEFAULT 1,
    "base_rate" numeric(10,2) DEFAULT 0 NOT NULL,
    "eyelet_metal" numeric(10,2) DEFAULT 0,
    "eyelet_plastic" numeric(10,2) DEFAULT 0,
    "delivery_door" numeric(10,2) DEFAULT 0,
    "delivery_courier" numeric(10,2) DEFAULT 0,
    "delivery_transport" numeric(10,2) DEFAULT 0,
    "media_images" "jsonb" DEFAULT '[]'::"jsonb",
    "media_video_url" "text",
    "specs_max_width" "text",
    "specs_gsm" "text",
    "specs_description" "text",
    "workflow_steps" "jsonb" DEFAULT '[]'::"jsonb",
    "name_lowercase" "text",
    "printer_category" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_synced_to_erp" boolean DEFAULT false
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "text" NOT NULL,
    "uid" "text",
    "email" "text",
    "name" "text",
    "displayName" "text",
    "role" "text",
    "roles" "jsonb",
    "customerType" "text",
    "creditLimit" numeric(15,2),
    "usedCredit" numeric(15,2),
    "status" "text",
    "businessName" "text",
    "phone" "text",
    "address" "text",
    "membership" "jsonb",
    "financialStats" "jsonb",
    "creditAuthorizedBy" "text",
    "assignedBy" "text",
    "assignedAt" "jsonb",
    "createdAt" "text",
    "updatedAt" "jsonb",
    "printerCategory" "text",
    "houseNumber" "text",
    "roadName" "text",
    "city" "text",
    "state" "text",
    "country" "text",
    "pincode" "text",
    "gstType" "text",
    "gstNumber" "text",
    "defaultAddressId" "text",
    "addresses" "jsonb",
    "creditStatus" "text",
    "voucherType" "text",
    "gstVerified" boolean DEFAULT false,
    "gstDetails" "jsonb",
    "company_name" "text",
    "contact_person" "text",
    "alternate_mobile" "text",
    "gst_registered" boolean DEFAULT false NOT NULL,
    "gstin" "text",
    "pan_number" "text",
    "customer_code" "text",
    "billing_address_line1" "text",
    "billing_address_line2" "text",
    "billing_area" "text",
    "billing_city" "text",
    "billing_district" "text",
    "billing_state" "text",
    "billing_state_code" "text",
    "billing_pincode" "text",
    "billing_country" "text" DEFAULT 'India'::"text" NOT NULL,
    "shipping_same_as_billing" boolean DEFAULT true NOT NULL,
    "consignee_name" "text",
    "consignee_contact" "text",
    "consignee_mobile" "text",
    "consignee_gstin" "text",
    "shipping_address_line1" "text",
    "shipping_address_line2" "text",
    "shipping_area" "text",
    "shipping_city" "text",
    "shipping_district" "text",
    "shipping_state" "text",
    "shipping_state_code" "text",
    "shipping_pincode" "text",
    "shipping_country" "text" DEFAULT 'India'::"text" NOT NULL,
    "payment_terms" "text",
    "credit_days" integer,
    "preferred_transporter" "text",
    "remarks" "text",
    "is_synced_to_erp" boolean DEFAULT false,
    "current_recharge" numeric DEFAULT 0
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quotation_number" "text" NOT NULL,
    "customer_id" "text" NOT NULL,
    "total_amount" numeric NOT NULL,
    "items" "jsonb",
    "tax_details" "jsonb",
    "tally_sync_status" "text" DEFAULT 'PENDING'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text",
    "quotation_date" "date" DEFAULT CURRENT_DATE,
    "tax_amount" numeric(15,2) DEFAULT 0.00,
    "discount_amount" numeric(15,2) DEFAULT 0.00,
    "terms_conditions" "text",
    "parent_order_id" "text",
    "ref_order_id" "text",
    "status" "text" DEFAULT 'PENDING'::"text",
    "customer_snapshot" "jsonb",
    "logistics_details" "jsonb",
    "shipping_address" "text"
);


ALTER TABLE "public"."quotations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "key" "text" NOT NULL,
    "hits" integer DEFAULT 1 NOT NULL,
    "reset_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipt_entries" (
    "id" "text" NOT NULL,
    "userid" "text",
    "refid" "text",
    "credit" numeric,
    "createdby" "text",
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "isverified" boolean DEFAULT false,
    "verifiedat" "jsonb",
    "paymentmode" "text",
    "is_synced_to_erp" boolean DEFAULT false,
    "sale_entry_number" "text",
    "receipt_entry_number" "text",
    "link" "text",
    "cash_ledger" "text",
    "upi_app" "text",
    "bank_ledger" "text",
    "bank_name" "text",
    "utr" "text"
);


ALTER TABLE "public"."receipt_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "text" NOT NULL,
    "report_type" "text",
    "title" "text",
    "status" "text",
    "payload" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_history" (
    "id" "text" NOT NULL,
    "userId" "text",
    "userName" "text",
    "oldRoles" "jsonb",
    "newRoles" "jsonb",
    "changedBy" "text",
    "changedByName" "text",
    "action" "text",
    "changedAt" "jsonb"
);


ALTER TABLE "public"."role_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settings" (
    "id" "text" NOT NULL,
    "data" "jsonb",
    "metadata" "jsonb",
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_users" (
    "id" "text" NOT NULL,
    "uid" "text",
    "name" "text",
    "email" "text",
    "roles" "jsonb",
    "status" "text",
    "assigned_by" "text",
    "assigned_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "suspended_at" timestamp with time zone,
    "last_login_at" timestamp with time zone,
    "metadata" "jsonb"
);


ALTER TABLE "public"."staff_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stats" (
    "id" "text" NOT NULL,
    "production" "jsonb",
    "payments" "jsonb",
    "dispatch" "jsonb",
    "system" "jsonb",
    "financial" "jsonb",
    "orders" "jsonb"
);


ALTER TABLE "public"."stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "gstin" "text",
    "address" "text",
    "state" "text",
    "phone" "text",
    "email" "text",
    "tally_ledger_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text",
    "opening_balance" numeric(15,2) DEFAULT 0.00,
    "status" "text" DEFAULT 'ACTIVE'::"text",
    "account_number" "text",
    "ifsc_code" "text",
    "bank_name" "text",
    "pan_number" "text",
    "contact_person" "text"
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tally_sync_queue" (
    "id" "text" NOT NULL,
    "syncType" "text",
    "orderId" "text",
    "paymentId" "text",
    "customerId" "text",
    "idempotencyKey" "text",
    "payload" "jsonb",
    "maxRetries" integer,
    "retryCount" integer DEFAULT 0,
    "createdBy" "text",
    "createdAt" timestamp with time zone,
    "_serverCreatedAt" "jsonb",
    "tallyResponse" "jsonb",
    "lastError" "text",
    "lastAttemptAt" timestamp with time zone,
    "processedAt" timestamp with time zone,
    "_updatedAt" "jsonb",
    "status" "text"
);


ALTER TABLE "public"."tally_sync_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tax_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_name" "text" DEFAULT 'Hindustan Enterprises'::"text" NOT NULL,
    "address" "text" DEFAULT '#1, New Bamboo Bazaar'::"text" NOT NULL,
    "city" "text" DEFAULT 'Mysore'::"text" NOT NULL,
    "state" "text" DEFAULT 'Karnataka'::"text" NOT NULL,
    "state_code" "text" DEFAULT '29'::"text" NOT NULL,
    "pincode" "text" DEFAULT '570001'::"text" NOT NULL,
    "phone" "text" DEFAULT '+91 90007 76007'::"text" NOT NULL,
    "email" "text" DEFAULT 'info@hindustanenterprises.com'::"text" NOT NULL,
    "website" "text",
    "gstin" "text" DEFAULT '29AFHPP0687G1Z2'::"text" NOT NULL,
    "pan" "text" DEFAULT 'AFHPP0687G'::"text" NOT NULL,
    "msme_reg" "text",
    "bank_name" "text" DEFAULT 'ICICI Bank'::"text" NOT NULL,
    "branch" "text" DEFAULT 'Mysore Main'::"text" NOT NULL,
    "account_number" "text" DEFAULT '6255505013373'::"text" NOT NULL,
    "ifsc" "text" DEFAULT 'ICIC0006255'::"text" NOT NULL,
    "beneficiary_name" "text" DEFAULT 'Hindustan Enterprises'::"text" NOT NULL,
    "upi_id" "text",
    "invoice_prefix" "text" DEFAULT 'HE'::"text" NOT NULL,
    "default_gst" numeric(5,2) DEFAULT 18.00 NOT NULL,
    "round_off" boolean DEFAULT true NOT NULL,
    "auto_qr" boolean DEFAULT false NOT NULL,
    "amount_in_words" boolean DEFAULT true NOT NULL,
    "logo_url" "text",
    "signature_url" "text",
    "seal_url" "text",
    "declaration" "text" DEFAULT 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.'::"text" NOT NULL,
    "terms" "text" DEFAULT '1. Interest @ 24% PA + taxes applicable if payment not made within the stipulated time\n2. We are not responsible for Damages, Shortages which occur during transit'::"text" NOT NULL,
    "footer_text" "text" DEFAULT 'This is a Computer Generated Invoice'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tax_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "text" NOT NULL,
    "userId" "text",
    "type" "text",
    "ledgerType" "text",
    "refId" "text",
    "debit" numeric,
    "credit" numeric,
    "balanceBefore" numeric,
    "balanceAfter" numeric,
    "availableCredit" numeric,
    "remarks" "text",
    "createdBy" "text",
    "timestamp" "jsonb",
    "isVerified" boolean DEFAULT false,
    "verifiedAt" "jsonb",
    "verifiedBy" "text",
    "approvedBy" "text",
    "paymentId" "text",
    "paymentMode" "text",
    "is_synced_to_erp" boolean DEFAULT false,
    "sale_entry_number" "text",
    "receipt_entry_number" "text",
    "link" "text",
    "cash_ledger" "text",
    "upi_app" "text",
    "bank_ledger" "text",
    "bank_name" "text",
    "utr" "text"
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "text" NOT NULL,
    "uid" "text",
    "email" "text",
    "name" "text",
    "displayName" "text",
    "role" "text",
    "customerType" "text",
    "creditLimit" numeric DEFAULT 0,
    "usedCredit" numeric DEFAULT 0,
    "status" "text",
    "createdAt" timestamp with time zone
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wishlist" (
    "id" "text" NOT NULL,
    "userId" "text",
    "productId" "text",
    "productName" "text",
    "category" "text",
    "basePrice" numeric,
    "imageUrl" "text",
    "createdAt" timestamp with time zone
);


ALTER TABLE "public"."wishlist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_health" (
    "worker_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "last_run" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_success" timestamp with time zone,
    "last_failure" timestamp with time zone,
    "current_job" "text",
    "avg_runtime" numeric DEFAULT 0,
    "retry_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."worker_health" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow" (
    "id" "text" NOT NULL,
    "order_id" "text",
    "current_stage" "text",
    "workflow_role" "text",
    "status" "text",
    "payload" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workflow" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_department_settings" (
    "department_id" "uuid" NOT NULL,
    "max_queue" integer DEFAULT 0,
    "capacity" character varying(255),
    "working_hours" character varying(255),
    "auto_assign" boolean DEFAULT false,
    "allowed_roles" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."workflow_department_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_departments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "color" character varying(50) DEFAULT '#3b82f6'::character varying,
    "icon" character varying(50) DEFAULT 'Layers'::character varying,
    "sla_minutes" integer DEFAULT 120,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."workflow_departments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" character varying(255) NOT NULL,
    "department_id" "uuid",
    "event_type" character varying(255) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "user_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."workflow_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_stage_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "department_id" "uuid",
    "workflow_stage" character varying(100) NOT NULL,
    "workflow_status" character varying(50) NOT NULL,
    "parent_order_id" character varying(255) NOT NULL,
    "child_order_id" character varying(255),
    "entered_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "exited_at" timestamp with time zone,
    "duration_seconds" integer,
    "duration_minutes" integer,
    "active_time_minutes" integer,
    "paused_time_minutes" integer,
    "waiting_time_minutes" integer,
    "assigned_to" "uuid",
    "queue_position" integer DEFAULT 0,
    "priority" character varying(50) DEFAULT 'NORMAL'::character varying,
    "sla_target_minutes" integer,
    "sla_status" character varying(50),
    "sla_breached_at" timestamp with time zone,
    "is_rework" boolean DEFAULT false,
    "is_rejected" boolean DEFAULT false,
    "entered_by" "uuid",
    "exited_by" "uuid",
    "remarks" "text",
    "snapshot" "jsonb" DEFAULT '{}'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."workflow_stage_history" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounts_ledger"
    ADD CONSTRAINT "accounts_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anomalies"
    ADD CONSTRAINT "anomalies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_stats"
    ADD CONSTRAINT "audit_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."backup_designs"
    ADD CONSTRAINT "backup_designs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bankAccounts"
    ADD CONSTRAINT "bankAccounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_amount_ledger"
    ADD CONSTRAINT "bank_amount_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bankaccounts"
    ADD CONSTRAINT "bankaccounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cart"
    ADD CONSTRAINT "cart_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_bank_ledger"
    ADD CONSTRAINT "company_bank_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_cash_ledger"
    ADD CONSTRAINT "company_cash_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_full_details"
    ADD CONSTRAINT "company_full_details_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_profile"
    ADD CONSTRAINT "company_profile_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contra_entries"
    ADD CONSTRAINT "contra_entries_contra_number_key" UNIQUE ("contra_number");



ALTER TABLE ONLY "public"."contra_entries"
    ADD CONSTRAINT "contra_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."design_comments"
    ADD CONSTRAINT "design_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."design_proofs"
    ADD CONSTRAINT "design_proofs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."design_revisions"
    ADD CONSTRAINT "design_revisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."designs"
    ADD CONSTRAINT "designs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dispatch_details"
    ADD CONSTRAINT "dispatch_details_parent_order_id_key" UNIQUE ("parent_order_id");



ALTER TABLE ONLY "public"."dispatch_details"
    ADD CONSTRAINT "dispatch_details_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dispatches"
    ADD CONSTRAINT "dispatches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_jobs"
    ADD CONSTRAINT "document_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."firebase_auth_users"
    ADD CONSTRAINT "firebase_auth_users_pkey" PRIMARY KEY ("uid");



ALTER TABLE ONLY "public"."hand_cash_ledger"
    ADD CONSTRAINT "hand_cash_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hsn_gst_rates"
    ADD CONSTRAINT "hsn_gst_rate_no_overlap" UNIQUE ("hsn_id", "effective_from");



ALTER TABLE ONLY "public"."hsn_gst_rates"
    ADD CONSTRAINT "hsn_gst_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hsn_master"
    ADD CONSTRAINT "hsn_master_hsn_code_key" UNIQUE ("hsn_code");



ALTER TABLE ONLY "public"."hsn_master"
    ADD CONSTRAINT "hsn_master_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."idempotency_keys"
    ADD CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("idempotency_key");



ALTER TABLE ONLY "public"."invoice_events"
    ADD CONSTRAINT "invoice_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_generation_attempts"
    ADD CONSTRAINT "invoice_generation_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_integrity_checks"
    ADD CONSTRAINT "invoice_integrity_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_sequences"
    ADD CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("financial_year");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_journal_number_key" UNIQUE ("journal_number");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications_log"
    ADD CONSTRAINT "notifications_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_entries"
    ADD CONSTRAINT "payment_entries_payment_number_key" UNIQUE ("payment_number");



ALTER TABLE ONLY "public"."payment_entries"
    ADD CONSTRAINT "payment_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_audit_logs"
    ADD CONSTRAINT "product_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_quotation_number_key" UNIQUE ("quotation_number");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."receipt_entries"
    ADD CONSTRAINT "receipt_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_history"
    ADD CONSTRAINT "role_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_users"
    ADD CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stats"
    ADD CONSTRAINT "stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tally_sync_queue"
    ADD CONSTRAINT "tally_sync_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tax_templates"
    ADD CONSTRAINT "tax_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wishlist"
    ADD CONSTRAINT "wishlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_health"
    ADD CONSTRAINT "worker_health_pkey" PRIMARY KEY ("worker_id");



ALTER TABLE ONLY "public"."workflow_department_settings"
    ADD CONSTRAINT "workflow_department_settings_pkey" PRIMARY KEY ("department_id");



ALTER TABLE ONLY "public"."workflow_departments"
    ADD CONSTRAINT "workflow_departments_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."workflow_departments"
    ADD CONSTRAINT "workflow_departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_events"
    ADD CONSTRAINT "workflow_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow"
    ADD CONSTRAINT "workflow_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_stage_history"
    ADD CONSTRAINT "workflow_stage_history_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_activity_logs_meta" ON "public"."activity_logs" USING "gin" ("meta");



CREATE INDEX "idx_activity_logs_timestamp" ON "public"."activity_logs" USING "btree" ("timestamp");



CREATE INDEX "idx_activity_logs_userid" ON "public"."activity_logs" USING "btree" ("userId");



CREATE INDEX "idx_anomalies_order_id_created_at" ON "public"."anomalies" USING "btree" ("order_id", "created_at" DESC);



CREATE INDEX "idx_audit_logs_adminid" ON "public"."audit_logs" USING "btree" ("adminId");



CREATE INDEX "idx_audit_logs_entityid" ON "public"."audit_logs" USING "btree" ("entityId");



CREATE INDEX "idx_audit_logs_meta" ON "public"."audit_logs" USING "gin" ("meta");



CREATE INDEX "idx_audit_logs_timestamp" ON "public"."audit_logs" USING "btree" ("timestamp");



CREATE INDEX "idx_audit_stats_actions" ON "public"."audit_stats" USING "gin" ("actions");



CREATE INDEX "idx_audit_stats_admins" ON "public"."audit_stats" USING "gin" ("admins");



CREATE INDEX "idx_audit_stats_updated_at" ON "public"."audit_stats" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_backup_designs_orderid" ON "public"."backup_designs" USING "btree" ("orderId");



CREATE INDEX "idx_backup_designs_uploadedat" ON "public"."backup_designs" USING "btree" ("uploadedAt");



CREATE INDEX "idx_bank_accounts_label" ON "public"."bank_accounts" USING "btree" ("label");



CREATE INDEX "idx_bankaccounts_payment_type" ON "public"."bankaccounts" USING "btree" ("payment_type");



CREATE INDEX "idx_cart_createdat" ON "public"."cart" USING "btree" ("createdAt");



CREATE INDEX "idx_cart_productid" ON "public"."cart" USING "btree" ("productId");



CREATE INDEX "idx_cart_user_id_created_at" ON "public"."cart" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_cart_userid" ON "public"."cart" USING "btree" ("userId");



CREATE INDEX "idx_categories_name" ON "public"."categories" USING "btree" ("name");



CREATE INDEX "idx_customers_profile_id" ON "public"."customers" USING "btree" ("profile_id");



CREATE INDEX "idx_design_comments_order_item" ON "public"."design_comments" USING "btree" ("order_id", "item_id");



CREATE INDEX "idx_design_proofs_order_item" ON "public"."design_proofs" USING "btree" ("order_id", "item_id");



CREATE INDEX "idx_design_proofs_version" ON "public"."design_proofs" USING "btree" ("order_id", "item_id", "version");



CREATE INDEX "idx_design_revisions_order_item" ON "public"."design_revisions" USING "btree" ("order_id", "item_id");



CREATE INDEX "idx_design_revisions_version" ON "public"."design_revisions" USING "btree" ("order_id", "item_id", "version");



CREATE INDEX "idx_dispatches_dispatchedby" ON "public"."dispatches" USING "btree" ("dispatchedBy");



CREATE INDEX "idx_dispatches_order_id_created_at" ON "public"."dispatches" USING "btree" ("order_id", "created_at" DESC);



CREATE INDEX "idx_dispatches_orderid" ON "public"."dispatches" USING "btree" ("orderId");



CREATE INDEX "idx_document_jobs_status_priority" ON "public"."document_jobs" USING "btree" ("status", "priority", "createdAt");



CREATE INDEX "idx_firebase_auth_users_customclaims" ON "public"."firebase_auth_users" USING "gin" ("customClaims");



CREATE INDEX "idx_firebase_auth_users_email" ON "public"."firebase_auth_users" USING "btree" ("email");



CREATE INDEX "idx_firebase_auth_users_metadata" ON "public"."firebase_auth_users" USING "gin" ("metadata");



CREATE INDEX "idx_hsn_gst_current" ON "public"."hsn_gst_rates" USING "btree" ("hsn_id") WHERE ("effective_to" IS NULL);



CREATE INDEX "idx_invoice_attempts_invoice" ON "public"."invoice_generation_attempts" USING "btree" ("invoice_id");



CREATE INDEX "idx_invoice_events_invoice" ON "public"."invoice_events" USING "btree" ("invoice_id");



CREATE INDEX "idx_invoice_events_type" ON "public"."invoice_events" USING "btree" ("event_type");



CREATE INDEX "idx_invoice_integrity_checks_invoice_id" ON "public"."invoice_integrity_checks" USING "btree" ("invoice_id");



CREATE INDEX "idx_invoices_customer_id" ON "public"."invoices" USING "btree" ("customer_id");



CREATE INDEX "idx_invoices_financial_year" ON "public"."invoices" USING "btree" ("financial_year");



CREATE INDEX "idx_invoices_generated_at" ON "public"."invoices" USING "btree" ("generated_at");



CREATE INDEX "idx_invoices_invoice_date" ON "public"."invoices" USING "btree" ("invoice_date");



CREATE INDEX "idx_invoices_invoice_number" ON "public"."invoices" USING "btree" ("invoice_number");



CREATE INDEX "idx_invoices_parent_order" ON "public"."invoices" USING "btree" ("parent_order_id");



CREATE INDEX "idx_invoices_parent_order_new" ON "public"."invoices" USING "btree" ("parent_order_id");



CREATE INDEX "idx_invoices_status" ON "public"."invoices" USING "btree" ("status");



CREATE INDEX "idx_jobs_status_created_at" ON "public"."jobs" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_notifications_meta" ON "public"."notifications" USING "gin" ("meta");



CREATE INDEX "idx_notifications_role" ON "public"."notifications" USING "btree" ("role");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_notifications_user_id_created_at" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_notifications_userid" ON "public"."notifications" USING "btree" ("userId");



CREATE INDEX "idx_order_items_assigned_printer" ON "public"."order_items" USING "btree" ("assignedPrinterId") WHERE ("assignedPrinterId" IS NOT NULL);



CREATE INDEX "idx_order_items_design_type" ON "public"."order_items" USING "btree" ("designType");



CREATE INDEX "idx_order_items_tiff_path" ON "public"."order_items" USING "btree" ("tiff_path") WHERE ("tiff_path" IS NOT NULL);



CREATE INDEX "idx_orders_amounts" ON "public"."orders" USING "gin" ("amounts");



CREATE INDEX "idx_orders_customer_id_status" ON "public"."orders" USING "btree" ("customerId", "status");



CREATE INDEX "idx_orders_customerid" ON "public"."orders" USING "btree" ("customerId");



CREATE INDEX "idx_orders_customersnapshot" ON "public"."orders" USING "gin" ("customerSnapshot");



CREATE INDEX "idx_orders_delivery" ON "public"."orders" USING "gin" ("delivery");



CREATE INDEX "idx_orders_invoice" ON "public"."orders" USING "btree" ("invoiceNumber");



CREATE INDEX "idx_orders_invoice_generated" ON "public"."orders" USING "btree" ("invoice_generated");



CREATE INDEX "idx_orders_invoice_id" ON "public"."orders" USING "btree" ("invoice_id");



CREATE INDEX "idx_orders_paymentstatus" ON "public"."orders" USING "btree" ("paymentStatus");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_orders_workflow" ON "public"."orders" USING "gin" ("workflow");



CREATE INDEX "idx_orders_workflowsnapshot" ON "public"."orders" USING "gin" ("workflowSnapshot");



CREATE INDEX "idx_payments_bankaccount" ON "public"."payments" USING "btree" ("ourBankAccount");



CREATE INDEX "idx_payments_order_ids" ON "public"."payments" USING "gin" ("orderIds");



CREATE INDEX "idx_payments_orderid" ON "public"."payments" USING "btree" ("orderId");



CREATE INDEX "idx_payments_paymentmode" ON "public"."payments" USING "btree" ("paymentMode");



CREATE INDEX "idx_payments_status" ON "public"."payments" USING "btree" ("status");



CREATE INDEX "idx_payments_userid" ON "public"."payments" USING "btree" ("userId");



CREATE INDEX "idx_product_audit_logs_product_id" ON "public"."product_audit_logs" USING "btree" ("product_id");



CREATE INDEX "idx_products_category" ON "public"."products" USING "btree" ("category");



CREATE INDEX "idx_products_media" ON "public"."products" USING "gin" ("media");



CREATE INDEX "idx_products_namelowercase" ON "public"."products" USING "btree" ("nameLowercase");



CREATE INDEX "idx_products_specs" ON "public"."products" USING "gin" ("specs");



CREATE INDEX "idx_products_status" ON "public"."products" USING "btree" ("status");



CREATE INDEX "idx_products_workflowsteps" ON "public"."products" USING "gin" ("workflowSteps");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_financialstats" ON "public"."profiles" USING "gin" ("financialStats");



CREATE INDEX "idx_profiles_membership" ON "public"."profiles" USING "gin" ("membership");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_profiles_roles" ON "public"."profiles" USING "gin" ("roles");



CREATE INDEX "idx_profiles_status" ON "public"."profiles" USING "btree" ("status");



CREATE INDEX "idx_profiles_uid" ON "public"."profiles" USING "btree" ("uid");



CREATE INDEX "idx_role_history_changedby" ON "public"."role_history" USING "btree" ("changedBy");



CREATE INDEX "idx_role_history_newroles" ON "public"."role_history" USING "gin" ("newRoles");



CREATE INDEX "idx_role_history_oldroles" ON "public"."role_history" USING "gin" ("oldRoles");



CREATE INDEX "idx_role_history_userid" ON "public"."role_history" USING "btree" ("userId");



CREATE INDEX "idx_settings_updated_at" ON "public"."settings" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_staff_users_status_updated_at" ON "public"."staff_users" USING "btree" ("status", "updated_at" DESC);



CREATE INDEX "idx_stats_dispatch" ON "public"."stats" USING "gin" ("dispatch");



CREATE INDEX "idx_stats_financial" ON "public"."stats" USING "gin" ("financial");



CREATE INDEX "idx_stats_orders" ON "public"."stats" USING "gin" ("orders");



CREATE INDEX "idx_stats_payments" ON "public"."stats" USING "gin" ("payments");



CREATE INDEX "idx_stats_production" ON "public"."stats" USING "gin" ("production");



CREATE INDEX "idx_stats_system" ON "public"."stats" USING "gin" ("system");



CREATE INDEX "idx_tally_sync_queue_customerid" ON "public"."tally_sync_queue" USING "btree" ("customerId");



CREATE INDEX "idx_tally_sync_queue_orderid" ON "public"."tally_sync_queue" USING "btree" ("orderId");



CREATE INDEX "idx_tally_sync_queue_payload" ON "public"."tally_sync_queue" USING "gin" ("payload");



CREATE INDEX "idx_tally_sync_queue_paymentid" ON "public"."tally_sync_queue" USING "btree" ("paymentId");



CREATE INDEX "idx_tally_sync_queue_status" ON "public"."tally_sync_queue" USING "btree" ("status");



CREATE INDEX "idx_tally_sync_queue_synctype" ON "public"."tally_sync_queue" USING "btree" ("syncType");



CREATE INDEX "idx_tally_sync_queue_tallyresponse" ON "public"."tally_sync_queue" USING "gin" ("tallyResponse");



CREATE INDEX "idx_transactions_ledgertype" ON "public"."transactions" USING "btree" ("ledgerType");



CREATE INDEX "idx_transactions_refid" ON "public"."transactions" USING "btree" ("refId");



CREATE INDEX "idx_transactions_timestamp" ON "public"."transactions" USING "gin" ("timestamp");



CREATE INDEX "idx_transactions_type" ON "public"."transactions" USING "btree" ("type");



CREATE INDEX "idx_transactions_userid" ON "public"."transactions" USING "btree" ("userId");



CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");



CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role");



CREATE INDEX "idx_users_status" ON "public"."users" USING "btree" ("status");



CREATE INDEX "idx_users_uid" ON "public"."users" USING "btree" ("uid");



CREATE INDEX "idx_we_order" ON "public"."workflow_events" USING "btree" ("order_id");



CREATE INDEX "idx_wishlist_category" ON "public"."wishlist" USING "btree" ("category");



CREATE INDEX "idx_wishlist_productid" ON "public"."wishlist" USING "btree" ("productId");



CREATE INDEX "idx_wishlist_userid" ON "public"."wishlist" USING "btree" ("userId");



CREATE INDEX "idx_workflow_order_id" ON "public"."workflow" USING "btree" ("order_id");



CREATE INDEX "idx_wsh_department" ON "public"."workflow_stage_history" USING "btree" ("department_id");



CREATE INDEX "idx_wsh_entered_at" ON "public"."workflow_stage_history" USING "btree" ("entered_at");



CREATE INDEX "idx_wsh_parent_order" ON "public"."workflow_stage_history" USING "btree" ("parent_order_id");



CREATE OR REPLACE TRIGGER "enforce_immutable_audit_logs" BEFORE DELETE OR UPDATE ON "public"."audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."protect_audit_logs"();



CREATE OR REPLACE TRIGGER "trg_prevent_hsn_code_update" BEFORE UPDATE ON "public"."hsn_master" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_hsn_code_update"();



CREATE OR REPLACE TRIGGER "trigger_enforce_invoice_immutability" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_invoice_immutability"();



CREATE OR REPLACE TRIGGER "trigger_generate_order_id" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."generate_order_id"();



ALTER TABLE ONLY "public"."bank_amount_ledger"
    ADD CONSTRAINT "bank_amount_ledger_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company_full_details"("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "fk_quotations_customer_id" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."hand_cash_ledger"
    ADD CONSTRAINT "hand_cash_ledger_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company_full_details"("id");



ALTER TABLE ONLY "public"."hsn_gst_rates"
    ADD CONSTRAINT "hsn_gst_rates_hsn_id_fkey" FOREIGN KEY ("hsn_id") REFERENCES "public"."hsn_master"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_events"
    ADD CONSTRAINT "invoice_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_generation_attempts"
    ADD CONSTRAINT "invoice_generation_attempts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_integrity_checks"
    ADD CONSTRAINT "invoice_integrity_checks_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_amendment_of_fkey" FOREIGN KEY ("amendment_of") REFERENCES "public"."invoices"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_financial_year_fkey" FOREIGN KEY ("financial_year") REFERENCES "public"."invoice_sequences"("financial_year");



ALTER TABLE ONLY "public"."notifications_log"
    ADD CONSTRAINT "notifications_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_entries"
    ADD CONSTRAINT "payment_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_audit_logs"
    ADD CONSTRAINT "product_audit_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_hsn_master_id_fkey" FOREIGN KEY ("hsn_master_id") REFERENCES "public"."hsn_master"("id");



ALTER TABLE ONLY "public"."workflow_department_settings"
    ADD CONSTRAINT "workflow_department_settings_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."workflow_departments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_events"
    ADD CONSTRAINT "workflow_events_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."workflow_departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflow_stage_history"
    ADD CONSTRAINT "workflow_stage_history_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."workflow_departments"("id") ON DELETE SET NULL;



CREATE POLICY "Admin can manage tax_templates" ON "public"."tax_templates" USING (true);



CREATE POLICY "Allow admin all company_profile" ON "public"."company_profile" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow admin all hsn_master" ON "public"."hsn_master" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow admin all invoice_sequences" ON "public"."invoice_sequences" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated full access to invoice_events" ON "public"."invoice_events" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated full access to invoice_generation_attempts" ON "public"."invoice_generation_attempts" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated full access to invoices" ON "public"."invoices" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated read company_profile" ON "public"."company_profile" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated read hsn_master" ON "public"."hsn_master" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated read invoice_sequences" ON "public"."invoice_sequences" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow insert access to authenticated users" ON "public"."contra_entries" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow insert access to authenticated users" ON "public"."journal_entries" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow insert access to authenticated users" ON "public"."payment_entries" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow insert access to authenticated users" ON "public"."quotations" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow insert access to authenticated users" ON "public"."suppliers" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow read access to authenticated users" ON "public"."contra_entries" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow read access to authenticated users" ON "public"."journal_entries" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow read access to authenticated users" ON "public"."payment_entries" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow read access to authenticated users" ON "public"."quotations" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow read access to authenticated users" ON "public"."suppliers" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow update access to authenticated users" ON "public"."contra_entries" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow update access to authenticated users" ON "public"."journal_entries" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow update access to authenticated users" ON "public"."payment_entries" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow update access to authenticated users" ON "public"."quotations" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow update access to authenticated users" ON "public"."suppliers" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can insert stage history" ON "public"."workflow_stage_history" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can insert workflow events" ON "public"."workflow_events" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can update department settings" ON "public"."workflow_department_settings" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can update departments" ON "public"."workflow_departments" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can update stage history" ON "public"."workflow_stage_history" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can upsert department settings" ON "public"."workflow_department_settings" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable all access for receipt_entries" ON "public"."receipt_entries" USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."workflow_department_settings" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."workflow_departments" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."workflow_stage_history" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users on events" ON "public"."workflow_events" FOR SELECT USING (true);



CREATE POLICY "Staff can manage dispatch_details" ON "public"."dispatch_details" USING (true);



ALTER TABLE "public"."company_profile" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contra_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dispatch_details" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hsn_master" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_generation_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_sequences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."journal_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quotations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."receipt_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tax_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_department_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_departments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_stage_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workflow_stage_history_insert" ON "public"."workflow_stage_history" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "workflow_stage_history_select" ON "public"."workflow_stage_history" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "workflow_stage_history_update_open_only" ON "public"."workflow_stage_history" FOR UPDATE TO "authenticated" USING (("exited_at" IS NULL)) WITH CHECK (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."accounts_ledger";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."activity_logs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."anomalies";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."audit_logs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."audit_stats";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."backup_designs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bankAccounts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bank_accounts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bankaccounts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cart";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."categories";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."customers";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."designs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."dispatches";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."firebase_auth_users";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."jobs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."order_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."payments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."products";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."reports";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."role_history";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."settings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."staff_users";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."stats";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tally_sync_queue";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."transactions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."users";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wishlist";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."workflow";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."atomic_dispatch_order"("p_order_id" "text", "p_actor_id" "text", "p_actor_name" "text", "p_invoice_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."atomic_dispatch_order"("p_order_id" "text", "p_actor_id" "text", "p_actor_name" "text", "p_invoice_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."atomic_dispatch_order"("p_order_id" "text", "p_actor_id" "text", "p_actor_name" "text", "p_invoice_date" "date") TO "service_role";



GRANT ALL ON TABLE "public"."document_jobs" TO "anon";
GRANT ALL ON TABLE "public"."document_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."document_jobs" TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_pending_job"("p_worker_id" "text", "p_now" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_pending_job"("p_worker_id" "text", "p_now" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_pending_job"("p_worker_id" "text", "p_now" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_receipt_entry"("p_receipt_entry_number" "text", "p_customer_id" "text", "p_allocations" "jsonb", "p_amount" numeric, "p_payment_mode" "text", "p_ref_number" "text", "p_remarks" "text", "p_created_by" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_receipt_entry"("p_receipt_entry_number" "text", "p_customer_id" "text", "p_allocations" "jsonb", "p_amount" numeric, "p_payment_mode" "text", "p_ref_number" "text", "p_remarks" "text", "p_created_by" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_receipt_entry"("p_receipt_entry_number" "text", "p_customer_id" "text", "p_allocations" "jsonb", "p_amount" numeric, "p_payment_mode" "text", "p_ref_number" "text", "p_remarks" "text", "p_created_by" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_receipt_entry"("p_receipt_entry_number" "text", "p_customer_id" "text", "p_allocations" "jsonb", "p_amount" numeric, "p_payment_mode" "text", "p_ref_number" "text", "p_remarks" "text", "p_created_by" "text", "p_link" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_receipt_entry"("p_receipt_entry_number" "text", "p_customer_id" "text", "p_allocations" "jsonb", "p_amount" numeric, "p_payment_mode" "text", "p_ref_number" "text", "p_remarks" "text", "p_created_by" "text", "p_link" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_receipt_entry"("p_receipt_entry_number" "text", "p_customer_id" "text", "p_allocations" "jsonb", "p_amount" numeric, "p_payment_mode" "text", "p_ref_number" "text", "p_remarks" "text", "p_created_by" "text", "p_link" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_sale_entry"("p_sale_entry_number" "text", "p_customer_id" "text", "p_order_ids" "text"[], "p_total_amount" numeric, "p_remarks" "text", "p_created_by" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_sale_entry"("p_sale_entry_number" "text", "p_customer_id" "text", "p_order_ids" "text"[], "p_total_amount" numeric, "p_remarks" "text", "p_created_by" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_sale_entry"("p_sale_entry_number" "text", "p_customer_id" "text", "p_order_ids" "text"[], "p_total_amount" numeric, "p_remarks" "text", "p_created_by" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_sale_entry"("p_sale_entry_number" "text", "p_customer_id" "text", "p_order_ids" "text"[], "p_total_amount" numeric, "p_remarks" "text", "p_created_by" "text", "p_link" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_sale_entry"("p_sale_entry_number" "text", "p_customer_id" "text", "p_order_ids" "text"[], "p_total_amount" numeric, "p_remarks" "text", "p_created_by" "text", "p_link" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_sale_entry"("p_sale_entry_number" "text", "p_customer_id" "text", "p_order_ids" "text"[], "p_total_amount" numeric, "p_remarks" "text", "p_created_by" "text", "p_link" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_invoice_immutability"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_invoice_immutability"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_invoice_immutability"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_invoice_for_child_orders"("p_child_order_ids" "text"[], "p_parent_order_id" "text", "p_customer_id" "text", "p_actor_id" "text", "p_actor_name" "text", "p_invoice_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invoice_for_child_orders"("p_child_order_ids" "text"[], "p_parent_order_id" "text", "p_customer_id" "text", "p_actor_id" "text", "p_actor_name" "text", "p_invoice_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invoice_for_child_orders"("p_child_order_ids" "text"[], "p_parent_order_id" "text", "p_customer_id" "text", "p_actor_id" "text", "p_actor_name" "text", "p_invoice_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_invoice_tx"("p_parent_order_id" "text", "p_invoice_id" "text", "p_invoice_number" "text", "p_child_ids" "text"[], "p_customer_id" "text", "p_customer_snapshot" "jsonb", "p_items" "jsonb", "p_amounts" "jsonb", "p_order_type" "text", "p_payment_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invoice_tx"("p_parent_order_id" "text", "p_invoice_id" "text", "p_invoice_number" "text", "p_child_ids" "text"[], "p_customer_id" "text", "p_customer_snapshot" "jsonb", "p_items" "jsonb", "p_amounts" "jsonb", "p_order_type" "text", "p_payment_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invoice_tx"("p_parent_order_id" "text", "p_invoice_id" "text", "p_invoice_number" "text", "p_child_ids" "text"[], "p_customer_id" "text", "p_customer_snapshot" "jsonb", "p_items" "jsonb", "p_amounts" "jsonb", "p_order_type" "text", "p_payment_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_order_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_order_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_order_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_financial_year"("p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_financial_year"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_financial_year"("p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_order_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_order_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_order_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_rate_limit"("p_key" "text", "p_limit" integer, "p_window_interval" interval) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_rate_limit"("p_key" "text", "p_limit" integer, "p_window_interval" interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_rate_limit"("p_key" "text", "p_limit" integer, "p_window_interval" interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."place_order_tx"("p_customer_id" "text", "p_order_type" "text", "p_grand_total" numeric, "p_parent_order" "jsonb", "p_child_orders" "jsonb"[], "p_order_items" "jsonb"[], "p_ledger_entries" "jsonb"[], "p_jobs" "jsonb"[], "p_idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."place_order_tx"("p_customer_id" "text", "p_order_type" "text", "p_grand_total" numeric, "p_parent_order" "jsonb", "p_child_orders" "jsonb"[], "p_order_items" "jsonb"[], "p_ledger_entries" "jsonb"[], "p_jobs" "jsonb"[], "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."place_order_tx"("p_customer_id" "text", "p_order_type" "text", "p_grand_total" numeric, "p_parent_order" "jsonb", "p_child_orders" "jsonb"[], "p_order_items" "jsonb"[], "p_ledger_entries" "jsonb"[], "p_jobs" "jsonb"[], "p_idempotency_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_hsn_code_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_hsn_code_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_hsn_code_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_audit_logs"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_audit_logs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_audit_logs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reserve_invoice_number"("p_invoice_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."reserve_invoice_number"("p_invoice_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reserve_invoice_number"("p_invoice_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_profile_uid"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_profile_uid"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_profile_uid"() TO "service_role";


















GRANT ALL ON TABLE "public"."accounts_ledger" TO "anon";
GRANT ALL ON TABLE "public"."accounts_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."anomalies" TO "anon";
GRANT ALL ON TABLE "public"."anomalies" TO "authenticated";
GRANT ALL ON TABLE "public"."anomalies" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."audit_stats" TO "anon";
GRANT ALL ON TABLE "public"."audit_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_stats" TO "service_role";



GRANT ALL ON TABLE "public"."backup_designs" TO "anon";
GRANT ALL ON TABLE "public"."backup_designs" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_designs" TO "service_role";



GRANT ALL ON TABLE "public"."bankAccounts" TO "anon";
GRANT ALL ON TABLE "public"."bankAccounts" TO "authenticated";
GRANT ALL ON TABLE "public"."bankAccounts" TO "service_role";



GRANT ALL ON TABLE "public"."bank_accounts" TO "anon";
GRANT ALL ON TABLE "public"."bank_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."bank_amount_ledger" TO "anon";
GRANT ALL ON TABLE "public"."bank_amount_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_amount_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."bankaccounts" TO "anon";
GRANT ALL ON TABLE "public"."bankaccounts" TO "authenticated";
GRANT ALL ON TABLE "public"."bankaccounts" TO "service_role";



GRANT ALL ON TABLE "public"."cart" TO "anon";
GRANT ALL ON TABLE "public"."cart" TO "authenticated";
GRANT ALL ON TABLE "public"."cart" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."company_bank_ledger" TO "anon";
GRANT ALL ON TABLE "public"."company_bank_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."company_bank_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."company_cash_ledger" TO "anon";
GRANT ALL ON TABLE "public"."company_cash_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."company_cash_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."company_full_details" TO "anon";
GRANT ALL ON TABLE "public"."company_full_details" TO "authenticated";
GRANT ALL ON TABLE "public"."company_full_details" TO "service_role";



GRANT ALL ON TABLE "public"."company_profile" TO "anon";
GRANT ALL ON TABLE "public"."company_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."company_profile" TO "service_role";



GRANT ALL ON TABLE "public"."contra_entries" TO "anon";
GRANT ALL ON TABLE "public"."contra_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."contra_entries" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."design_comments" TO "anon";
GRANT ALL ON TABLE "public"."design_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."design_comments" TO "service_role";



GRANT ALL ON TABLE "public"."design_proofs" TO "anon";
GRANT ALL ON TABLE "public"."design_proofs" TO "authenticated";
GRANT ALL ON TABLE "public"."design_proofs" TO "service_role";



GRANT ALL ON TABLE "public"."design_revisions" TO "anon";
GRANT ALL ON TABLE "public"."design_revisions" TO "authenticated";
GRANT ALL ON TABLE "public"."design_revisions" TO "service_role";



GRANT ALL ON TABLE "public"."designs" TO "anon";
GRANT ALL ON TABLE "public"."designs" TO "authenticated";
GRANT ALL ON TABLE "public"."designs" TO "service_role";



GRANT ALL ON TABLE "public"."dispatch_details" TO "anon";
GRANT ALL ON TABLE "public"."dispatch_details" TO "authenticated";
GRANT ALL ON TABLE "public"."dispatch_details" TO "service_role";



GRANT ALL ON TABLE "public"."dispatches" TO "anon";
GRANT ALL ON TABLE "public"."dispatches" TO "authenticated";
GRANT ALL ON TABLE "public"."dispatches" TO "service_role";



GRANT ALL ON TABLE "public"."firebase_auth_users" TO "anon";
GRANT ALL ON TABLE "public"."firebase_auth_users" TO "authenticated";
GRANT ALL ON TABLE "public"."firebase_auth_users" TO "service_role";



GRANT ALL ON TABLE "public"."hand_cash_ledger" TO "anon";
GRANT ALL ON TABLE "public"."hand_cash_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."hand_cash_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."hsn_gst_rates" TO "anon";
GRANT ALL ON TABLE "public"."hsn_gst_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."hsn_gst_rates" TO "service_role";



GRANT ALL ON TABLE "public"."hsn_master" TO "anon";
GRANT ALL ON TABLE "public"."hsn_master" TO "authenticated";
GRANT ALL ON TABLE "public"."hsn_master" TO "service_role";



GRANT ALL ON TABLE "public"."idempotency_keys" TO "anon";
GRANT ALL ON TABLE "public"."idempotency_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."idempotency_keys" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_events" TO "anon";
GRANT ALL ON TABLE "public"."invoice_events" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_events" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_generation_attempts" TO "anon";
GRANT ALL ON TABLE "public"."invoice_generation_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_generation_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_integrity_checks" TO "anon";
GRANT ALL ON TABLE "public"."invoice_integrity_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_integrity_checks" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_sequences" TO "anon";
GRANT ALL ON TABLE "public"."invoice_sequences" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_sequences" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."jobs" TO "anon";
GRANT ALL ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



GRANT ALL ON TABLE "public"."journal_entries" TO "anon";
GRANT ALL ON TABLE "public"."journal_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_entries" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."notifications_log" TO "anon";
GRANT ALL ON TABLE "public"."notifications_log" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."order_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."order_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."order_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."payment_entries" TO "anon";
GRANT ALL ON TABLE "public"."payment_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_entries" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."product_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."product_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."product_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."quotations" TO "anon";
GRANT ALL ON TABLE "public"."quotations" TO "authenticated";
GRANT ALL ON TABLE "public"."quotations" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."receipt_entries" TO "anon";
GRANT ALL ON TABLE "public"."receipt_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."receipt_entries" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."role_history" TO "anon";
GRANT ALL ON TABLE "public"."role_history" TO "authenticated";
GRANT ALL ON TABLE "public"."role_history" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "anon";
GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."staff_users" TO "anon";
GRANT ALL ON TABLE "public"."staff_users" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_users" TO "service_role";



GRANT ALL ON TABLE "public"."stats" TO "anon";
GRANT ALL ON TABLE "public"."stats" TO "authenticated";
GRANT ALL ON TABLE "public"."stats" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."tally_sync_queue" TO "anon";
GRANT ALL ON TABLE "public"."tally_sync_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."tally_sync_queue" TO "service_role";



GRANT ALL ON TABLE "public"."tax_templates" TO "anon";
GRANT ALL ON TABLE "public"."tax_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."tax_templates" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."wishlist" TO "anon";
GRANT ALL ON TABLE "public"."wishlist" TO "authenticated";
GRANT ALL ON TABLE "public"."wishlist" TO "service_role";



GRANT ALL ON TABLE "public"."worker_health" TO "anon";
GRANT ALL ON TABLE "public"."worker_health" TO "authenticated";
GRANT ALL ON TABLE "public"."worker_health" TO "service_role";



GRANT ALL ON TABLE "public"."workflow" TO "anon";
GRANT ALL ON TABLE "public"."workflow" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_department_settings" TO "anon";
GRANT ALL ON TABLE "public"."workflow_department_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_department_settings" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_departments" TO "anon";
GRANT ALL ON TABLE "public"."workflow_departments" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_departments" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_events" TO "anon";
GRANT ALL ON TABLE "public"."workflow_events" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_events" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_stage_history" TO "anon";
GRANT ALL ON TABLE "public"."workflow_stage_history" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_stage_history" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































