-- Add integrity status columns to invoices
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS invoice_integrity_status VARCHAR NOT NULL DEFAULT 'NOT_VERIFIED',
ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_verified_by VARCHAR,
ADD COLUMN IF NOT EXISTS last_verification_hash VARCHAR;

-- Create audit history table for integrity checks
CREATE TABLE IF NOT EXISTS invoice_integrity_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id VARCHAR NOT NULL REFERENCES invoices(id),
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_by VARCHAR NOT NULL DEFAULT 'SYSTEM',
    expected_snapshot_hash VARCHAR,
    calculated_snapshot_hash VARCHAR,
    snapshot_result VARCHAR NOT NULL,
    expected_pdf_hash VARCHAR,
    calculated_pdf_hash VARCHAR,
    pdf_result VARCHAR NOT NULL,
    final_result VARCHAR NOT NULL,
    verification_duration_ms INTEGER,
    algorithm VARCHAR NOT NULL DEFAULT 'SHA-256'
);

-- Index for querying audit history by invoice
CREATE INDEX IF NOT EXISTS idx_invoice_integrity_checks_invoice_id ON invoice_integrity_checks(invoice_id);
