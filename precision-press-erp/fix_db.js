const { Client } = require('pg');
const dbUrl = 'postgresql://postgres.eeqqiylszgrbkfcdrftv:Powerstar%40200319@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres';
const client = new Client({ connectionString: dbUrl });

const sql = `
CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "key" "text" PRIMARY KEY,
    "hits" integer DEFAULT 1 NOT NULL,
    "reset_at" timestamp with time zone NOT NULL
);

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

CREATE TABLE IF NOT EXISTS "public"."staff_users" (
    "id" "text" PRIMARY KEY,
    "uid" "text",
    "name" "text",
    "email" "text",
    "roles" "jsonb",
    "status" "text",
    "assigned_by" "text",
    "assigned_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "suspended_at" timestamp with time zone,
    "last_login_at" timestamp with time zone,
    "metadata" "jsonb"
);
`;

client.connect().then(async () => {
  await client.query(sql);
  console.log('Successfully created rate_limits, increment_rate_limit, and staff_users!');
  await client.end();
}).catch(console.error);
