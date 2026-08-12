import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from('tally_sync_queue')
      .select('tallyResponse, processedAt')
      .eq('syncType', 'FETCH_MASTERS')
      .eq('status', 'SUCCESS')
      .order('processedAt', { ascending: false })
      .limit(1)
      .single();

    if (error || !data || !data.tallyResponse) {
      return NextResponse.json({ success: false, error: 'No Tally data found. Please pull from Tally first.' });
    }

    const ledgers = (data.tallyResponse as any)?.json?.ledgers || [];

    return NextResponse.json({
      success: true,
      ledgers,
      fetchedAt: data.processedAt,
      count: ledgers.length,
    });
  } catch (err: any) {
    console.error('queue-ledgers error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
