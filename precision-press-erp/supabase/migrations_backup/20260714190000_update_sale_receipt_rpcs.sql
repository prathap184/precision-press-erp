-- Update RPC for creating a Sale Entry
CREATE OR REPLACE FUNCTION create_sale_entry(
  p_sale_entry_number TEXT,
  p_customer_id UUID,
  p_order_ids TEXT[],
  p_total_amount NUMERIC,
  p_remarks TEXT,
  p_created_by UUID
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

-- Update RPC for creating a Receipt Entry
CREATE OR REPLACE FUNCTION create_receipt_entry(
  p_receipt_entry_number TEXT,
  p_customer_id UUID,
  p_order_ids TEXT[],
  p_amount NUMERIC,
  p_payment_mode TEXT,
  p_ref_number TEXT,
  p_remarks TEXT,
  p_created_by UUID
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

  IF array_length(p_order_ids, 1) > 0 THEN
    UPDATE orders
    SET receipt_entry_number = p_receipt_entry_number,
        receipt_created = true
    WHERE id = ANY(p_order_ids);
  END IF;

  RETURN jsonb_build_object('success', true, 'receiptEntryNumber', p_receipt_entry_number);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
