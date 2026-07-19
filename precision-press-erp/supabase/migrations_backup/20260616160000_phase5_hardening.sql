-- SQL Migration: Phase 5 Production Hardening
-- Creates tables and functions for Postgres-backed rate limiting, auditing metadata, immutability, optimistic locking, worker health, and notifications logging.

-- 1. Rate Limiting Schema
CREATE TABLE IF NOT EXISTS public.rate_limits (
    key TEXT PRIMARY KEY,
    hits INTEGER NOT NULL DEFAULT 1,
    reset_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE OR REPLACE FUNCTION public.increment_rate_limit(
    p_key TEXT,
    p_limit INTEGER,
    p_window_interval INTERVAL
) RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Optimistic Locking Column
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- 3. Audit Log Enhancements & Immutability Triggers
ALTER TABLE public.audit_logs 
    ADD COLUMN IF NOT EXISTS actor_role TEXT,
    ADD COLUMN IF NOT EXISTS ip_address TEXT,
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS session_id TEXT,
    ADD COLUMN IF NOT EXISTS request_id TEXT,
    ADD COLUMN IF NOT EXISTS previous_value JSONB,
    ADD COLUMN IF NOT EXISTS new_value JSONB;

CREATE OR REPLACE FUNCTION public.protect_audit_logs() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable. No updates or deletes allowed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_immutable_audit_logs ON public.audit_logs;
CREATE TRIGGER enforce_immutable_audit_logs
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.protect_audit_logs();

-- 4. Worker Monitoring Schema
CREATE TABLE IF NOT EXISTS public.worker_health (
    worker_id TEXT PRIMARY KEY,
    status TEXT NOT NULL, -- 'IDLE' | 'RUNNING' | 'FAILED'
    last_run TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_success TIMESTAMP WITH TIME ZONE,
    last_failure TIMESTAMP WITH TIME ZONE,
    current_job TEXT,
    avg_runtime NUMERIC DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 5. Notifications Logging Schema
CREATE TABLE IF NOT EXISTS public.notifications_log (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    channel TEXT NOT NULL, -- 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH' | 'IN_APP'
    title TEXT,
    body TEXT,
    status TEXT NOT NULL, -- 'SENT' | 'DELIVERED' | 'FAILED' | 'RETRYING'
    retry_count INTEGER NOT NULL DEFAULT 0,
    delivery_time TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
-- 6. SHA-256 Deduplication Support for Design Revisions
ALTER TABLE public.design_revisions
    ADD COLUMN IF NOT EXISTS sha256_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_design_revisions_sha256
    ON public.design_revisions(sha256_hash)
    WHERE sha256_hash IS NOT NULL;

-- 7. Worker Health — add last_heartbeat alias (used by application code)
ALTER TABLE public.worker_health
    ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

-- Ensure worker_health upsert uses last_heartbeat
CREATE INDEX IF NOT EXISTS idx_worker_health_heartbeat
    ON public.worker_health(last_heartbeat);

-- 8. Grant RLS permissions for monitoring API
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;

-- Service role (used by supabaseServer) can access all
CREATE POLICY IF NOT EXISTS "service_role_rate_limits" ON public.rate_limits
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_worker_health" ON public.worker_health
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_notifications_log" ON public.notifications_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);
