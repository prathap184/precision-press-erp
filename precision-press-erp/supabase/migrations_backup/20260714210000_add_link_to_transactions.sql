ALTER TABLE transactions ADD COLUMN IF NOT EXISTS link TEXT;

CREATE OR REPLACE FUNCTION create_sale_entry(
  p_sale_entry_number TEXT,
  p_customer_id TEXT,
  p_order_ids TEXT[],
  p_total_amount NUMERIC,
  p_remarks TEXT,
  p_created_by TEXT,
  p_link TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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


CREATE OR REPLACE FUNCTION create_receipt_entry(
  p_receipt_entry_number TEXT,
  p_customer_id TEXT,
  p_allocations JSONB,
  p_amount NUMERIC,
  p_payment_mode TEXT,
  p_ref_number TEXT,
  p_remarks TEXT,
  p_created_by TEXT,
  p_link TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
