-- Phase 5: RPC for atomic invoice generation

CREATE OR REPLACE FUNCTION public.get_financial_year(p_date DATE) RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.reserve_invoice_number(p_invoice_date DATE)
RETURNS TABLE (
  invoice_number TEXT,
  invoice_sequence INTEGER,
  financial_year TEXT
) AS $$
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
$$ LANGUAGE plpgsql;

-- Also we need an RPC to insert the invoice atomically if we don't want to do multiple roundtrips,
-- but since we just need the number, returning the number is fine. We can just insert it from TS.
