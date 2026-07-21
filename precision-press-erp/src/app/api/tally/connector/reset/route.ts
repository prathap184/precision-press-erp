import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const { data: failed, error: fetchErr } = await supabaseServer
      .from('tally_sync_queue')
      .select('id')
      .eq('status', 'FAILED');

    if (fetchErr) throw fetchErr;

    const ids = (failed || []).map((r: any) => r.id);

    if (ids.length > 0) {
      const { error: updErr } = await supabaseServer
        .from('tally_sync_queue')
        .update({ status: 'PENDING', retryCount: 0, lastError: null })
        .in('id', ids);

      if (updErr) throw updErr;
    }

    return NextResponse.json({ success: true, reset: ids.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
