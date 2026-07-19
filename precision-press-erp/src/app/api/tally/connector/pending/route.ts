/**
 * TALLY CONNECTOR API — FETCH PENDING EVENTS
 * ────────────────────────────────────────────
 * GET /api/tally/connector/pending
 *
 * Called by the local Connector Service on the Accounting PC.
 * Returns up to 20 PENDING sync events ordered oldest-first.
 *
 * SECURITY:
 *   - Requires X-Connector-Secret header matching TALLY_CONNECTOR_SECRET env var.
 *   - This route should ONLY be accessible from the Accounting PC.
 *   - In production, restrict via firewall or VPN — never expose publicly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPendingTallySyncEvents, markTallySyncInFlight } from '@/lib/actions/tally-sync';

function verifyConnectorSecret(req: NextRequest): boolean {
  const secret = req.headers.get('x-connector-secret');
  const expected = process.env.TALLY_CONNECTOR_SECRET;
  if (!expected) {
    console.error('[TallyConnector] TALLY_CONNECTOR_SECRET is not set in environment.');
    return false;
  }
  return secret === expected;
}

export async function GET(req: NextRequest) {
  if (!verifyConnectorSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const events = await getPendingTallySyncEvents(20);

    // Mark all fetched events as IN_FLIGHT to prevent double-pickup
    if (events.length > 0) {
      await markTallySyncInFlight(events.map(e => e.id));
    }

    return NextResponse.json({
      events,
      fetchedAt: new Date().toISOString(),
      count: events.length,
    });
  } catch (err: any) {
    console.error('[TallyConnector] /pending error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
