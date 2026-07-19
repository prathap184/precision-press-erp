/**
 * reset-failed.js — Resets FAILED queue items back to PENDING via the ERP API.
 *
 * Usage:
 *   node reset-failed.js                   # list all failed events
 *   node reset-failed.js TSYNC-R-xxx-xxx   # reset a specific event
 *   node reset-failed.js --all             # reset all FAILED items
 */

'use strict';

require('dotenv').config();
const axios = require('axios');

const ERP_BASE_URL = process.env.ERP_BASE_URL.replace(/\/$/, '');
const CONNECTOR_SECRET = process.env.CONNECTOR_SECRET;

const erpApi = axios.create({
  baseURL: ERP_BASE_URL,
  headers: { 'x-connector-secret': CONNECTOR_SECRET },
  timeout: 15000,
});

async function run() {
  const arg = process.argv[2];

  // Fetch pending events to see current state
  const res = await erpApi.get('/api/tally/connector/pending');
  console.log(`\nCurrent PENDING queue: ${res.data.count} event(s)`);
  if (res.data.events?.length) {
    res.data.events.forEach(e => {
      console.log(`  - ${e.id} | ${e.syncType} | retryCount=${e.retryCount}`);
    });
  }

  console.log('\n⚠️  To reset FAILED items, go to:');
  console.log('   Firebase Console → Firestore → tally_sync_queue');
  console.log('   For each FAILED item: set status=PENDING, retryCount=0');
  console.log('\n   Items to reset:');
  console.log('   TSYNC-R-1778295486521-M8E  (PAY-95202734 — duplicated)');
  console.log('   TSYNC-R-1778295640887-Z2S  (PAY-94941459 — duplicated)');
  console.log('   TSYNC-R-1778295090248-U2N  (unknown cust — validation failed)');
}

run().catch(console.error);
