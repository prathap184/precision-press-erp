CREATE SEQUENCE IF NOT EXISTS order_id_seq START 1000;

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


CREATE OR REPLACE FUNCTION place_order_tx(
  p_customer_id text,
  p_order_type text,
  p_grand_total numeric,
  p_parent_order jsonb,
  p_child_orders jsonb[],
  p_order_items jsonb[],
  p_ledger_entries jsonb[],
  p_jobs jsonb[],
  p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql AS $$
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

  -- 2. Read and Lock Customer Profile Row (Updated for contact table with explicit UUID cast)
  SELECT COALESCE(used_credit, 0), COALESCE(credit_limit, 0)
  INTO v_used_credit, v_credit_limit
  FROM contact
  WHERE id = p_customer_id::uuid
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
  UPDATE contact
  SET used_credit = v_new_used_credit, updated_at = v_now
  WHERE id = p_customer_id::uuid;

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
