-- Migration: Atomic Dispatch RPC

CREATE OR REPLACE FUNCTION public.atomic_dispatch_order(
  p_order_id TEXT,
  p_actor_id TEXT,
  p_actor_name TEXT,
  p_invoice_date DATE
)
RETURNS TABLE (
  success BOOLEAN,
  invoice_id TEXT,
  invoice_number TEXT,
  message TEXT
) AS $$
DECLARE
  v_current_status TEXT;
  v_customer_id TEXT;
  v_inv_id TEXT;
  v_inv_status TEXT;
  v_inv_number TEXT;
  v_fy TEXT;
  v_prefix TEXT;
  v_seq INTEGER;
  v_is_locked BOOLEAN;
  v_new_inv_num TEXT;
  v_new_inv_id TEXT;
BEGIN
  -- 1. Lock and validate order
  SELECT status, "customerId"
  INTO v_current_status, v_customer_id
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT, 'Order not found'::TEXT;
    RETURN;
  END IF;

  -- 2. Verify not already dispatched
  IF v_current_status = 'DISPATCHED' THEN
    -- Find existing invoice if any
    SELECT id, public.invoices.invoice_number INTO v_inv_id, v_inv_number
    FROM public.invoices WHERE parent_order_id = p_order_id LIMIT 1;
    
    RETURN QUERY SELECT true, v_inv_id, v_inv_number, 'Order already dispatched'::TEXT;
    RETURN;
  END IF;

  -- 3. Update order status
  UPDATE public.orders
  SET status = 'DISPATCHED', updated_at = now()
  WHERE id = p_order_id;

  -- 4. Check existing invoice row
  SELECT id, status, public.invoices.invoice_number 
  INTO v_inv_id, v_inv_status, v_inv_number
  FROM public.invoices 
  WHERE parent_order_id = p_order_id 
  LIMIT 1;

  IF FOUND THEN
    -- Business rules for existing invoice
    IF v_inv_status = 'DISPATCH_ROLLED_BACK' THEN
      UPDATE public.invoices
      SET status = 'PENDING', updated_at = now()
      WHERE id = v_inv_id;

      INSERT INTO public.invoice_events (invoice_id, event_type, actor_id, actor_name)
      VALUES (v_inv_id, 'PENDING_CREATED', p_actor_id, p_actor_name);
      
      RETURN QUERY SELECT true, v_inv_id, v_inv_number, 'Reused rolled back invoice'::TEXT;
      RETURN;
    ELSE
      -- PENDING, GENERATING, GENERATED, FAILED, PERMANENTLY_FAILED, DLQ
      RETURN QUERY SELECT true, v_inv_id, v_inv_number, 'Invoice already exists in status ' || v_inv_status;
      RETURN;
    END IF;
  END IF;

  -- 5. Reserve new invoice number
  v_fy := public.get_financial_year(p_invoice_date);

  SELECT prefix, last_number, is_locked 
  INTO v_prefix, v_seq, v_is_locked
  FROM public.invoice_sequences
  WHERE public.invoice_sequences.financial_year = v_fy
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
  WHERE public.invoice_sequences.financial_year = v_fy;

  v_new_inv_num := v_prefix || v_fy || '/' || lpad(v_seq::TEXT, 6, '0');
  v_new_inv_id := 'INV-' || gen_random_uuid()::TEXT;

  -- 6. Create Invoice Row (PENDING)
  INSERT INTO public.invoices (
    id, invoice_number, invoice_sequence, financial_year,
    invoice_number_reserved_at, parent_order_id, status,
    customer_id, invoice_date, reservation_user_id, reservation_user_name
  ) VALUES (
    v_new_inv_id, v_new_inv_num, v_seq, v_fy,
    now(), p_order_id, 'PENDING',
    v_customer_id, p_invoice_date, p_actor_id, p_actor_name
  );

  -- 7. Insert Initial Event
  INSERT INTO public.invoice_events (invoice_id, event_type, actor_id, actor_name)
  VALUES (v_new_inv_id, 'PENDING_CREATED', p_actor_id, p_actor_name);

  RETURN QUERY SELECT true, v_new_inv_id, v_new_inv_num, 'Successfully dispatched and reserved invoice'::TEXT;
END;
$$ LANGUAGE plpgsql;
