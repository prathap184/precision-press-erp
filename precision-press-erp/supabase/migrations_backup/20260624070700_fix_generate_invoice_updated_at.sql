CREATE OR REPLACE FUNCTION public.atomic_dispatch_order(
  p_order_id TEXT,
  p_actor_id TEXT,
  p_actor_name TEXT,
  p_invoice_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  success BOOLEAN,
  invoice_id TEXT,
  invoice_number TEXT,
  message TEXT
) AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.generate_invoice_for_child_orders(
  p_child_order_ids   TEXT[],
  p_parent_order_id   TEXT,
  p_customer_id       TEXT,
  p_actor_id          TEXT,
  p_actor_name        TEXT,
  p_invoice_date      DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  success          BOOLEAN,
  invoice_id       TEXT,
  invoice_number   TEXT,
  message          TEXT
) AS $$
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
$$ LANGUAGE plpgsql;
