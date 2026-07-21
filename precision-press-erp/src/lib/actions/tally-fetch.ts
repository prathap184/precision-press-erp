'use server';

import { supabaseServer } from '@/lib/supabase-server';
import { enqueueTallySync } from '@/lib/actions/tally-sync';
import { TallySyncEvent } from '@/types/tally';

const POLL_INTERVAL_MS = 1000; // 1 second
const TIMEOUT_MS = 15000;      // 15 seconds max wait

/**
 * Initiates a live fetch request to the Tally Connector and waits for the response.
 */
export async function liveTallyFetch({
  fetchType,
  createdBy = 'system',
}: {
  fetchType: 'FETCH_MASTERS' | 'FETCH_BALANCES';
  createdBy?: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // 1. Enqueue the fetch event with a unique ID to bypass idempotency
    const uniqueRef = `FETCH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const enqueueRes = await enqueueTallySync({
      syncType: fetchType,
      orderId: uniqueRef,
      payload: {},
      createdBy,
      voucherType: fetchType,
    });

    if (!enqueueRes.success || !enqueueRes.eventId) {
      return { success: false, error: 'Failed to enqueue fetch request.' };
    }

    const eventId = enqueueRes.eventId;

    // 2. Poll Supabase waiting for the connector to process it
    const startTime = Date.now();
    let isComplete = false;
    let resultData = null;

    while (Date.now() - startTime < TIMEOUT_MS) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

      const { data: row } = await supabaseServer
        .from('tally_sync_queue')
        .select('status, tallyResponse, lastError')
        .eq('id', eventId)
        .single();

      if (row) {
        const ev = row as Pick<TallySyncEvent, 'status' | 'tallyResponse' | 'lastError'>;

        if (ev.status === 'SUCCESS') {
          isComplete = true;
          resultData = ev.tallyResponse?.json || ev.tallyResponse?.rawXml;
          break;
        } else if (ev.status === 'FAILED') {
          return { success: false, error: ev.lastError || 'Tally Connector failed to fetch data.' };
        }
      }
    }

    if (!isComplete) {
      return { success: false, error: 'Timeout waiting for Tally Connector. Ensure Tally and the Connector are running.' };
    }

    return { success: true, data: resultData };
  } catch (error: any) {
    console.error('[LiveTallyFetch] Error:', error.message);
    return { success: false, error: 'Internal server error during live fetch.' };
  }
}
