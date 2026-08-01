CREATE SEQUENCE IF NOT EXISTS "public"."order_id_seq" START 1000;

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

  -- 2. Read and Lock Customer Profile Row (if it exists)
  SELECT COALESCE("usedCredit", 0), COALESCE("creditLimit", 0)
  INTO v_used_credit, v_credit_limit
  FROM profiles
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- If customer has no profile in Postgres, they cannot place a CREDIT order
    IF p_order_type = 'CREDIT' THEN
      RAISE EXCEPTION 'Customer profile not found for ID % - Cannot place CREDIT order', p_customer_id;
    END IF;
  ELSE
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
  END IF;

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
      COALESCE((p_parent_order->>'createdAt')::timestamp with time zone, v_now),
      COALESCE((p_parent_order->>'updatedAt')::timestamp with time zone, v_now),
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
      COALESCE((child_val->>'createdAt')::timestamp with time zone, v_now),
      COALESCE((child_val->>'updatedAt')::timestamp with time zone, v_now),
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




CREATE OR REPLACE FUNCTION "public"."sync_profile_uid"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
    begin
      new.uid := coalesce(new.uid, new.id);
      new.updated_at := coalesce(new.updated_at, now());
      return new;
    end;
    $$;




