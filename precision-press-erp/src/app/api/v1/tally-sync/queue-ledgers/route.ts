import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

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

    // Helper to safely parse the payload
    const getLedgers = (response: any) => {
      if (!response) return [];
      try {
        let parsed = response;
        if (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        // If it was double stringified
        if (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        return parsed?.json?.ledgers || [];
      } catch (e) {
        console.error('Error parsing tallyResponse', e);
        return [];
      }
    };

    // Find the best entry: prefer one where ledgers have non-empty parent fields
    let best = data[0];
    for (const row of data) {
      const ledgers = getLedgers(row.tallyResponse);
      const hasParents = ledgers.some((l: any) => l.parent && l.parent.trim() !== '');
      if (hasParents) {
        best = row;
        break;
      }
    }

    const ledgers = getLedgers(best.tallyResponse);
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

