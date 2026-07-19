import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // ── 1. Worker Health ─────────────────────────────────────────────────────
    const { data: workers, error: workerErr } = await supabaseServer
      .from('worker_health')
      .select('worker_id, status, last_heartbeat')
      .order('last_heartbeat', { ascending: false })
      .limit(20);

    // ── 2. Job Stats (by status) ─────────────────────────────────────────────
    const { data: jobStats, error: jobErr } = await supabaseServer
      .rpc('get_job_status_counts');

    // If RPC not available, fall back to per-status queries
    let computedJobStats = jobStats;
    if (jobErr || !jobStats) {
      const statuses = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING'];
      computedJobStats = [];
      for (const status of statuses) {
        const { count } = await supabaseServer
          .from('document_jobs')
          .select('*', { count: 'exact', head: true })
          .eq('status', status)
          .then(r => ({ count: r.count ?? 0 }));
        (computedJobStats as any[]).push({ status, count });
      }
    }

    // ── 3. Audit Logs (last 24h count) ──────────────────────────────────────
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentAuditCount } = await supabaseServer
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .gte('timestamp', since24h);

    // ── 4. Active Rate Limits ────────────────────────────────────────────────
    const { data: rateLimits } = await supabaseServer
      .from('rate_limits')
      .select('key, hits, reset_at')
      .gte('reset_at', new Date().toISOString())
      .order('hits', { ascending: false })
      .limit(10);

    // ── 5. Notification Stats (last 24h) ─────────────────────────────────────
    const { data: rawNotifs } = await supabaseServer
      .from('notifications_log')
      .select('channel, status')
      .gte('delivery_time', since24h);

    const notifMap: Record<string, number> = {};
    (rawNotifs || []).forEach((n: any) => {
      const k = `${n.channel}::${n.status}`;
      notifMap[k] = (notifMap[k] || 0) + 1;
    });
    const notifStats = Object.entries(notifMap).map(([k, count]) => {
      const [channel, status] = k.split('::');
      return { channel, status, count };
    });

    // ── 6. DB Health Check ───────────────────────────────────────────────────
    let dbStatus: 'OK' | 'DEGRADED' | 'DOWN' = 'DOWN';
    try {
      const { error: pingErr } = await supabaseServer.from('profiles').select('id').limit(1).single();
      dbStatus = pingErr && pingErr.code !== 'PGRST116' ? 'DEGRADED' : 'OK';
    } catch {
      dbStatus = 'DOWN';
    }

    return NextResponse.json({
      workers: workers || [],
      jobStats: computedJobStats || [],
      recentAuditCount: recentAuditCount || 0,
      rateLimits: rateLimits || [],
      notifStats,
      dbStatus,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Monitoring API]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
