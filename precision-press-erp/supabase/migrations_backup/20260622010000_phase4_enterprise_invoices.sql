-- Phase 4: Enterprise Invoice Schema Upgrade

-- Drop the old table completely, we are redesigning from scratch.
DROP TABLE IF EXISTS public.invoice_generation_attempts CASCADE;
DROP TABLE IF EXISTS public.invoice_events CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TYPE IF EXISTS invoice_event_type CASCADE;

-- 1. Create generalized enum for invoice events
CREATE TYPE invoice_event_type AS ENUM (
  'PENDING_CREATED', 'GENERATION_STARTED', 'GENERATION_COMPLETED', 'GENERATION_FAILED', 'GENERATION_RETRIED',
  'PDF_GENERATED', 'PDF_DOWNLOADED', 'EMAIL_SENT',
  'WHATSAPP_SENT', 'DISPATCH_UPDATED', 'DISPATCH_ROLLED_BACK', 'CANCELLED', 'CREDIT_NOTE_CREATED',
  'SYSTEM_RESTART', 'WORKER_TIMEOUT', 'MANUAL_RETRY'
);

-- 2. Invoices (Complete Redesign)
CREATE TABLE public.invoices (
  -- Identity
  id                            TEXT         PRIMARY KEY,
  invoice_number                TEXT         UNIQUE NOT NULL,       -- IMMUTABLE: HE/2026-27/0148
  invoice_sequence              INTEGER      NOT NULL,              -- 148
  financial_year                TEXT         NOT NULL REFERENCES public.invoice_sequences(financial_year),
  invoice_number_reserved_at    TIMESTAMPTZ  NOT NULL,              
  reservation_reason            TEXT,                               
  reservation_user_id           TEXT,                               
  reservation_user_name         TEXT,                               
  invoice_schema_version        INTEGER      NOT NULL DEFAULT 1,
  parent_order_id               TEXT         NOT NULL,

  -- Status machine
  status                        TEXT         NOT NULL DEFAULT 'PENDING',

  -- Queue metrics (top level)
  generation_requested_at  TIMESTAMPTZ,
  queued_at                TIMESTAMPTZ,
  started_at               TIMESTAMPTZ,
  finished_at              TIMESTAMPTZ,
  processing_time_ms       INTEGER,
  queue_name               TEXT,
  worker_id                TEXT,
  generation_lock_until    TIMESTAMPTZ,                              -- Soft lock: another worker can claim if this timestamp is passed

  -- Retry tracking
  attempt_count            INTEGER      DEFAULT 0,
  max_attempts             INTEGER      DEFAULT 6,
  last_error               TEXT,
  last_attempted_at        TIMESTAMPTZ,
  current_attempt_id       TEXT,
  generating_heartbeat_at  TIMESTAMPTZ,

  -- Security & Audit
  financial_lock_at        TIMESTAMPTZ,                              -- When financial fields became permanently frozen
  snapshot_hash            TEXT,                                     -- SHA-256 covering Customer, Company, Items, Tax, Totals, Invoice No, Date, FY, and Schema Version
  snapshot_hash_algorithm  TEXT         DEFAULT 'SHA-256',

  -- Customer snapshot (immutable after GENERATED)
  customer_id              TEXT         NOT NULL,
  customer_snapshot        JSONB        NOT NULL DEFAULT '{}',

  -- Company snapshot (immutable after GENERATED)
  company_snapshot         JSONB        NOT NULL DEFAULT '{}',

  -- Items snapshot (immutable after GENERATED)
  items                    JSONB        NOT NULL DEFAULT '[]',

  -- Tax snapshot (immutable after GENERATED — all NUMERIC)
  is_inter_state           BOOLEAN,
  taxable_value            NUMERIC(12,2),
  cgst_rate                NUMERIC(5,2),
  cgst_amount              NUMERIC(12,2),
  sgst_rate                NUMERIC(5,2),
  sgst_amount              NUMERIC(12,2),
  igst_rate                NUMERIC(5,2),
  igst_amount              NUMERIC(12,2),
  round_off                NUMERIC(10,2),
  grand_total              NUMERIC(12,2),
  amount_in_words          TEXT,

  -- PDF storage
  pdf_url                  TEXT,
  pdf_generated_at         TIMESTAMPTZ,
  pdf_version              INTEGER      DEFAULT 0,
  pdf_template_version     TEXT,
  pdf_sha256               TEXT,                                     -- SHA-256 of the generated PDF buffer
  pdf_size_bytes           INTEGER,
  pdf_content_type         TEXT,
  pdf_generated_by         TEXT,                                     -- e.g. 'ERP 1.0.0'

  -- System provenance
  generated_by_system_version TEXT,
  generation_version       INTEGER      DEFAULT 1,                   -- E.g. algorithm version 1, 2, 3

  -- Future e-invoice fields (reserved, always NULL for now)
  irn                      TEXT,
  ack_number               TEXT,
  ack_date                 TIMESTAMPTZ,
  qr_code                  TEXT,
  signed_invoice           TEXT,

  -- Invoice metadata
  invoice_type             TEXT         DEFAULT 'ORIGINAL',
  amendment_of             TEXT         REFERENCES public.invoices(id),
  invoice_date             DATE         NOT NULL,
  order_type               TEXT,
  payment_status           TEXT,

  -- Current dispatch summary (mutable — every change logged to invoice_events)
  lr_number                TEXT,
  transporter              TEXT,
  vehicle_number           TEXT,
  eway_bill                TEXT,
  dispatch_date            DATE,
  delivery_date            DATE,
  remarks                  TEXT,
  row_version              INTEGER      DEFAULT 1,                   -- Optimistic locking for admin edits

  -- Timestamps
  created_at               TIMESTAMPTZ  DEFAULT now(),
  generated_at             TIMESTAMPTZ,
  cancelled_at             TIMESTAMPTZ,

  CONSTRAINT valid_invoice_status CHECK (
    status IN (
      'PENDING', 'GENERATING', 'GENERATED',
      'FAILED', 'PERMANENTLY_FAILED', 'DLQ',
      'DISPATCH_ROLLED_BACK', 'CANCELLED'
    )
  ),
  CONSTRAINT valid_invoice_type CHECK (
    invoice_type IN ('ORIGINAL', 'CREDIT_NOTE', 'DEBIT_NOTE')
  )
);

-- Allowed multiple invoices per order to support PARTIAL DISPATCH in the future
CREATE INDEX idx_invoices_parent_order ON public.invoices (parent_order_id);
CREATE INDEX idx_invoices_status ON public.invoices (status);

-- Dashboard Query Indexes
CREATE INDEX idx_invoices_invoice_date ON public.invoices (invoice_date);
CREATE INDEX idx_invoices_financial_year ON public.invoices (financial_year);
CREATE INDEX idx_invoices_generated_at ON public.invoices (generated_at);
CREATE INDEX idx_invoices_customer_id ON public.invoices (customer_id);
CREATE INDEX idx_invoices_invoice_number ON public.invoices (invoice_number);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access to invoices" ON public.invoices FOR ALL USING (auth.role() = 'authenticated');

-- 3. Invoice Events (Generalized Audit Log)
CREATE TABLE public.invoice_events (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      TEXT         NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  event_type      invoice_event_type NOT NULL, 
  field_name      TEXT,        -- optional, if it's a specific field change
  old_value       TEXT,
  new_value       TEXT,
  event_metadata  JSONB,       -- for structured data like error traces
  actor_id        TEXT,
  actor_name      TEXT,
  created_at      TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX idx_invoice_events_invoice ON public.invoice_events (invoice_id);
CREATE INDEX idx_invoice_events_type ON public.invoice_events (event_type);

ALTER TABLE public.invoice_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access to invoice_events" ON public.invoice_events FOR ALL USING (auth.role() = 'authenticated');

-- 4. Invoice Generation Attempts (Background job history)
CREATE TABLE public.invoice_generation_attempts (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      TEXT         NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  attempt_number  INTEGER      NOT NULL,
  queue_name      TEXT,
  worker_id       TEXT,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  result_status   TEXT,        -- SUCCESS, FAILED
  error_message   TEXT,
  error_trace     TEXT
);

CREATE INDEX idx_invoice_attempts_invoice ON public.invoice_generation_attempts (invoice_id);

ALTER TABLE public.invoice_generation_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access to invoice_generation_attempts" ON public.invoice_generation_attempts FOR ALL USING (auth.role() = 'authenticated');
