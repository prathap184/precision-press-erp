-- Trigger to strictly enforce financial immutability after the financial lock is set
CREATE OR REPLACE FUNCTION enforce_invoice_immutability()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Apply the trigger to the invoices table
DROP TRIGGER IF EXISTS trigger_enforce_invoice_immutability ON invoices;
CREATE TRIGGER trigger_enforce_invoice_immutability
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION enforce_invoice_immutability();
