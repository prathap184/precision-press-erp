/**
 * TALLY CONNECTOR API — MARK RESULT
 * ────────────────────────────────────
 * POST /api/tally/connector/mark-result
 *
 * Called by the local Connector Service after processing a sync event.
 * Records SUCCESS or FAILED status with Tally's response.
 *
 * Body:
 *   {
 *     eventId: string,
 *     status: 'SUCCESS' | 'FAILED',
 *     tallyResponse?: { requestId, lineno, status, rawXml },
 *     error?: string
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { markTallySyncResult } from '@/lib/actions/tally-sync';

function verifyConnectorSecret(req: NextRequest): boolean {
  const secret = req.headers.get('x-connector-secret');
  const expected = process.env.TALLY_CONNECTOR_SECRET;
  if (!expected) return false;
  return secret === expected;
}

export async function POST(req: NextRequest) {
  if (!verifyConnectorSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { eventId, status, tallyResponse, error } = body;

    if (!eventId || !status) {
      return NextResponse.json({ error: 'eventId and status are required' }, { status: 400 });
    }

    if (!['SUCCESS', 'FAILED'].includes(status)) {
      return NextResponse.json({ error: 'status must be SUCCESS or FAILED' }, { status: 400 });
    }

    const result = await markTallySyncResult({ eventId, status, tallyResponse, error });

    return NextResponse.json({ success: result.success });
  } catch (err: any) {
    console.error('[TallyConnector] /mark-result error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
