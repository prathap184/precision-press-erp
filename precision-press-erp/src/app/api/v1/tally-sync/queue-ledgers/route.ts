import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export async function GET() {
  try {
    // Get the last 5 successful FETCH_MASTERS entries
    // We pick the BEST one — the one where ledgers have non-empty parent fields
    const { data, error } = await supabaseServer
      .from('tally_sync_queue')
      .select('tallyResponse, processedAt, lastAttemptAt, createdAt')
      .eq('syncType', 'FETCH_MASTERS')
      .eq('status', 'SUCCESS')
      .order('lastAttemptAt', { ascending: false })
      .limit(5);

    if (error) throw error;

    if (!data || data.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No Tally data found. Please pull from Tally first.',
      });
    }

    // Find the best entry: prefer one where ledgers have non-empty parent fields
    let best = data[0];
    for (const row of data) {
      const ledgers = (row.tallyResponse as any)?.json?.ledgers || [];
      const hasParents = ledgers.some((l: any) => l.parent && l.parent.trim() !== '');
      if (hasParents) {
        best = row;
        break;
      }
    }

    const ledgers = (best.tallyResponse as any)?.json?.ledgers || [];
    const fetchedAt = best.lastAttemptAt || best.processedAt || best.createdAt;

    return NextResponse.json({
      success: true,
      ledgers,
      fetchedAt,
      count: ledgers.length,
    });
  } catch (err: any) {
    console.error('queue-ledgers error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

