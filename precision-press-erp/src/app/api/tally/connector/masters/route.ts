/**
 * TALLY CONNECTOR API — MASTERS SYNC
 * ────────────────────────────────────
 * POST /api/tally/connector/masters
 *
 * Called by the local Connector Service after fetching "List of Accounts" from Tally.
 * Parses the Tally response and creates/updates records in the `customers` and `suppliers`
 * Firestore collections.
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

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
    const { ledgers } = body; 
    // Expects ledgers to be an array of { name, group, address, gst, etc }

    if (!Array.isArray(ledgers)) {
      return NextResponse.json({ error: 'ledgers array is required' }, { status: 400 });
    }

    let importedCount = 0;
    const batch = adminDb.batch();
    
    // We process up to 500 ledgers per batch (Firestore limit).
    // In a production scenario with thousands of ledgers, we'd chunk this.
    const chunk = ledgers.slice(0, 500);

    for (const ledger of chunk) {
      if (!ledger.name || !ledger.group) continue;
      
      const groupName = (ledger.group || '').toLowerCase();
      const isDebtor = groupName.includes('debtor') || groupName.includes('customer');
      const isCreditor = groupName.includes('creditor') || groupName.includes('supplier');
      
      if (isDebtor) {
        // Upsert into customers collection
        const customerRef = adminDb.collection('customers').doc(ledger.name.replace(/[^a-zA-Z0-9_-]/g, '_'));
        batch.set(customerRef, {
          name: ledger.name,
          address: ledger.address || '',
          gstNumber: ledger.gst || '',
          source: 'tally_sync',
          updatedAt: new Date().toISOString()
        }, { merge: true });
        importedCount++;
      } else if (isCreditor) {
        // Upsert into suppliers collection
        const supplierRef = adminDb.collection('suppliers').doc(ledger.name.replace(/[^a-zA-Z0-9_-]/g, '_'));
        batch.set(supplierRef, {
          name: ledger.name,
          address: ledger.address || '',
          gstNumber: ledger.gst || '',
          source: 'tally_sync',
          updatedAt: new Date().toISOString()
        }, { merge: true });
        importedCount++;
      }
    }

    if (importedCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({ success: true, importedCount });
  } catch (err: any) {
    console.error('[TallyConnector] /masters error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
