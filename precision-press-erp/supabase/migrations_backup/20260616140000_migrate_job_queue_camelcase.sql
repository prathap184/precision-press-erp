-- SQL Migration: Migrate job queue to camelCase columns and add worker timeouts/debugging fields
-- Enforces row-level safety, preserves data, and updates RPCs.

DO $$
BEGIN
  -- Rename job_id to id
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'document_jobs'::regclass AND attname = 'job_id') THEN
    ALTER TABLE document_jobs RENAME COLUMN job_id TO id;
  END IF;

  -- Rename job_type to "jobType"
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'document_jobs'::regclass AND attname = 'job_type') THEN
    ALTER TABLE document_jobs RENAME COLUMN job_type TO "jobType";
  END IF;

  -- Rename order_id to "orderId"
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'document_jobs'::regclass AND attname = 'order_id') THEN
    ALTER TABLE document_jobs RENAME COLUMN order_id TO "orderId";
  END IF;

  -- Rename parent_order_id to "parentOrderId"
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'document_jobs'::regclass AND attname = 'parent_order_id') THEN
    ALTER TABLE document_jobs RENAME COLUMN parent_order_id TO "parentOrderId";
  END IF;

  -- Rename max_attempts to "maxAttempts"
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'document_jobs'::regclass AND attname = 'max_attempts') THEN
    ALTER TABLE document_jobs RENAME COLUMN max_attempts TO "maxAttempts";
  END IF;

  -- Rename last_error to "errorMessage"
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'document_jobs'::regclass AND attname = 'last_error') THEN
    ALTER TABLE document_jobs RENAME COLUMN last_error TO "errorMessage";
  END IF;

  -- Rename created_at to "createdAt"
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'document_jobs'::regclass AND attname = 'created_at') THEN
    ALTER TABLE document_jobs RENAME COLUMN created_at TO "createdAt";
  END IF;

  -- Rename started_at to "startedAt"
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'document_jobs'::regclass AND attname = 'started_at') THEN
    ALTER TABLE document_jobs RENAME COLUMN started_at TO "startedAt";
  END IF;

  -- Rename completed_at to "completedAt"
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'document_jobs'::regclass AND attname = 'completed_at') THEN
    ALTER TABLE document_jobs RENAME COLUMN completed_at TO "completedAt";
  END IF;

  -- Rename metadata to "payload"
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'document_jobs'::regclass AND attname = 'metadata') THEN
    ALTER TABLE document_jobs RENAME COLUMN metadata TO "payload";
  END IF;
END $$;

-- Add new fields if they don't exist
ALTER TABLE document_jobs ADD COLUMN IF NOT EXISTS "failedAt" timestamptz;
ALTER TABLE document_jobs ADD COLUMN IF NOT EXISTS "heartbeatAt" timestamptz;
ALTER TABLE document_jobs ADD COLUMN IF NOT EXISTS "stackTrace" text;
ALTER TABLE document_jobs ADD COLUMN IF NOT EXISTS "sqlError" text;
ALTER TABLE document_jobs ADD COLUMN IF NOT EXISTS "workerVersion" text;

-- Ensure default values
ALTER TABLE document_jobs ALTER COLUMN "maxAttempts" SET DEFAULT 4;
ALTER TABLE document_jobs ALTER COLUMN "payload" SET DEFAULT '{}'::jsonb;

-- Recreate index on status, priority, and createdAt for claiming performance
DROP INDEX IF EXISTS idx_document_jobs_status_priority;
CREATE INDEX IF NOT EXISTS idx_document_jobs_status_priority ON document_jobs (status, priority, "createdAt");

-- Recreate claim_pending_job function with heartbeat timeout and camelCase columns
CREATE OR REPLACE FUNCTION claim_pending_job(
  p_worker_id text,
  p_now timestamptz
) RETURNS SETOF document_jobs LANGUAGE plpgsql AS $$
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

-- Recreate place_order_tx to support camelCase job insert
CREATE OR REPLACE FUNCTION place_order_tx(
  p_customer_id text,
  p_order_type text,
  p_grand_total numeric,
  p_parent_order jsonb,
  p_child_orders jsonb[],
  p_order_items jsonb[],
  p_ledger_entries jsonb[],
  p_jobs jsonb[]
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_used_credit numeric;
  v_credit_limit numeric;
  v_new_used_credit numeric;
  child_val jsonb;
  item_val jsonb;
  ledger_val jsonb;
  job_val jsonb;
  v_result jsonb;
BEGIN
  -- 1. Read and Lock Customer Profile Row
  SELECT COALESCE("usedCredit", 0), COALESCE("creditLimit", 0)
  INTO v_used_credit, v_credit_limit
  FROM profiles
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer profile not found for ID %', p_customer_id;
  END IF;

  -- 2. Validate Credit Limit (if CREDIT customer)
  IF p_order_type = 'CREDIT' THEN
    IF (v_used_credit + p_grand_total) > v_credit_limit THEN
      RAISE EXCEPTION 'Credit limit exceeded. Current used: %, Limit: %, Requested: %', v_used_credit, v_credit_limit, p_grand_total;
    END IF;
  END IF;

  -- 3. Update Locked Customer Used Credit Balance
  v_new_used_credit := v_used_credit + p_grand_total;
  UPDATE profiles
  SET "usedCredit" = v_new_used_credit, "updatedAt" = to_jsonb(NOW()::text)
  WHERE id = p_customer_id;

  -- 4. Insert Parent Order (if provided)
  IF p_parent_order IS NOT NULL THEN
    INSERT INTO orders (
      id, "customerId", "customerName", "customerSnapshot", "orderType", "orderSource",
      "createdBy", "createdByRole", "proxyExecutor", "printerCategory", amounts, delivery,
      workflow, "workflowSnapshot", "currentWorkflowRole", "currentWorkflowLabel",
      "productionNotes", "thumbnailUrl", "productName", "description", items, status, "paymentStatus",
      "createdAt", "updatedAt", "shippingAddress", "deliveryChoice"
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
      COALESCE(p_parent_order->'createdAt', to_jsonb(NOW()::text)),
      COALESCE(p_parent_order->'updatedAt', to_jsonb(NOW()::text)),
      p_parent_order->>'shippingAddress',
      p_parent_order->>'deliveryChoice'
    );
  END IF;

  -- 5. Insert Child Orders (Batch)
  IF p_child_orders IS NOT NULL THEN
    FOREACH child_val IN ARRAY p_child_orders LOOP
      INSERT INTO orders (
        id, "customerId", "customerName", "customerSnapshot", "orderType", "orderSource",
        "createdBy", "createdByRole", "proxyExecutor", "printerCategory", amounts, delivery,
        workflow, "workflowSnapshot", "currentWorkflowRole", "currentWorkflowLabel",
        "productionNotes", "thumbnailUrl", "productName", "description", items, status, "paymentStatus",
        "createdAt", "updatedAt", "shippingAddress", "deliveryChoice"
      ) VALUES (
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
        COALESCE(child_val->'createdAt', to_jsonb(NOW()::text)),
        COALESCE(child_val->'updatedAt', to_jsonb(NOW()::text)),
        child_val->>'shippingAddress',
        child_val->>'deliveryChoice'
      );
    END LOOP;
  END IF;

  -- 6. Insert Order Items into order_items table (Batch)
  IF p_order_items IS NOT NULL THEN
    FOREACH item_val IN ARRAY p_order_items LOOP
      INSERT INTO order_items (
        id, order_id, product_name, product_id, category, project_name, specs, material_metadata,
        pricing_snapshot, file_url, design_url, design_status, design_upload_stats,
        "assignedPrinterId", "assignedPrinterName", "fileUrl", "productId", "productName",
        "projectName", "materialMetadata", "pricingSnapshot", "designUrl", "designStatus",
        "designUploadStats", description, "designType", "itemWorkspace", created_at, updated_at
      ) VALUES (
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
        NOW(),
        NOW()
      );
    END LOOP;
  END IF;

  -- 7. Insert Ledger Entries into transactions table (Batch)
  IF p_ledger_entries IS NOT NULL THEN
    FOREACH ledger_val IN ARRAY p_ledger_entries LOOP
      INSERT INTO transactions (
        id, "userId", type, "ledgerType", "refId", debit, credit, "balanceBefore", "balanceAfter",
        "availableCredit", remarks, "createdBy", timestamp, "isVerified", "verifiedAt", "verifiedBy",
        "paymentId"
      ) VALUES (
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
        to_jsonb(NOW()::text),
        COALESCE((ledger_val->>'isVerified')::boolean, false),
        CASE WHEN ledger_val->>'verifiedAt' IS NOT NULL THEN to_jsonb(ledger_val->>'verifiedAt') ELSE NULL END,
        ledger_val->>'verifiedBy',
        ledger_val->>'paymentId'
      );
    END LOOP;
  END IF;

  -- 8. Insert Background Jobs into document_jobs table (Batch)
  IF p_jobs IS NOT NULL THEN
    FOREACH job_val IN ARRAY p_jobs LOOP
      INSERT INTO document_jobs (
        id, "jobType", "orderId", "parentOrderId", priority, status, "createdAt", "payload"
      ) VALUES (
        job_val->>'jobId',
        job_val->>'jobType',
        job_val->>'orderId',
        p_parent_order->>'id',
        COALESCE((job_val->>'priority')::integer, 2),
        'PENDING',
        NOW(),
        COALESCE(job_val->'payload', '{}'::jsonb)
      );
    END LOOP;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'orderId', p_parent_order->>'id',
    'balanceBefore', v_used_credit,
    'balanceAfter', v_new_used_credit
  );
  
  RETURN v_result;
END;
$$;

-- Atomic transaction RPC function to generate the tax invoice, locking the parent order and preventing duplication
CREATE OR REPLACE FUNCTION generate_invoice_tx(
  p_parent_order_id text,
  p_invoice_id text,
  p_invoice_number text,
  p_child_ids text[],
  p_customer_id text,
  p_customer_snapshot jsonb,
  p_items jsonb,
  p_amounts jsonb,
  p_order_type text,
  p_payment_status text
) RETURNS jsonb LANGUAGE plpgsql AS $$
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
