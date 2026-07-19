-- SQL Migration: claim_pending_job function
-- Claims a pending job atomically, locking the row and marking it RUNNING to prevent concurrency races.

CREATE OR REPLACE FUNCTION claim_pending_job(
  p_worker_id text,
  p_now timestamptz
) RETURNS SETOF document_jobs LANGUAGE plpgsql AS $$
DECLARE
  v_job_id text;
BEGIN
  -- 1. Select one pending job id atomically
  SELECT job_id INTO v_job_id
  FROM document_jobs
  WHERE status = 'PENDING'
    AND (
      metadata->>'runAfter' IS NULL
      OR (metadata->>'runAfter')::timestamptz <= p_now
    )
  ORDER BY priority ASC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  -- 2. If a job is found, update it to RUNNING status
  IF v_job_id IS NOT NULL THEN
    RETURN QUERY
    UPDATE document_jobs
    SET status = 'RUNNING',
        started_at = p_now,
        worker_id = p_worker_id
    WHERE job_id = v_job_id
    RETURNING *;
  END IF;

  RETURN;
END;
$$;
