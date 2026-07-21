import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export async function GET() {
  try {
    const { error, count } = await supabaseServer
      .from('tally_sync_queue')
      .delete()
      .eq('status', 'PENDING')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    return NextResponse.json({ success: true, deleted: count ?? 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
