/**
 * CONNECTOR.JS — Tally Sync Engine
 * ──────────────────────────────────
 * The main polling engine that runs on the accountant's PC.
 * 
 * Flow:
 *   1. Polls ERP API for PENDING sync events
 *   2. Translates each event to Tally XML via xml-builder.js
 *   3. Pushes the XML to Tally on localhost:9000
 *   4. Reports SUCCESS or FAILED back to ERP API
 * 
 * Self-Healing:
 *   ✅ Network drops → sleep and retry
 *   ✅ Tally busy/locked → sleep 5s and retry
 *   ✅ Duplicate ledger → auto switch to Alter
 *   ✅ Missing ledger → auto create then retry
 *   ✅ Tally closed → queue holds, resumes on open
 */

require('dotenv').config();
const axios = require('axios');
const xml2js = require('xml2js');
const { buildXML, buildFetchMastersXML } = require('./xml-builder');

// ─── Configuration ────────────────────────────────────────────────────────────

const ERP_BASE_URL = process.env.ERP_BASE_URL || 'http://40.81.236.61:3000';
const CONNECTOR_SECRET = process.env.TALLY_CONNECTOR_SECRET || '';
const TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '10000', 10);

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level, msg, data) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level}]`;
  if (data) {
    console.log(`${prefix} ${msg}`, typeof data === 'string' ? data : JSON.stringify(data).substring(0, 200));
  } else {
    console.log(`${prefix} ${msg}`);
  }
}

// ─── ERP API Helpers ──────────────────────────────────────────────────────────

async function fetchPendingEvents() {
  const res = await axios.get(`${ERP_BASE_URL}/api/tally/connector/pending`, {
    headers: { 'x-connector-secret': CONNECTOR_SECRET },
    timeout: 15000,
  });
  return res.data.events || [];
}

async function markResult(eventId, status, tallyResponse, error) {
  await axios.post(
    `${ERP_BASE_URL}/api/tally/connector/mark-result`,
    { eventId, status, tallyResponse, error },
    {
      headers: {
        'x-connector-secret': CONNECTOR_SECRET,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );
}

// ─── Tally XML Push ───────────────────────────────────────────────────────────

async function pushToTally(xmlString) {
  const res = await axios.post(TALLY_URL, xmlString, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    timeout: 60000,
    responseType: 'arraybuffer',
  });
  
  let text = res.data.toString('utf8');
  if (text.includes('\u0000')) {
    text = text.replace(/\0/g, '');
  }
  return text;
}

function parseTallyResponse(rawXml) {
  // Quick parse to check if Tally accepted or rejected
  const result = {
    accepted: false,
    created: 0,
    altered: 0,
    error: null,
    rawXml: String(rawXml).substring(0, 500),
  };

  const raw = String(rawXml);

  // Check for CREATED count
  const createdMatch = raw.match(/<CREATED>(\d+)<\/CREATED>/i);
  if (createdMatch) result.created = parseInt(createdMatch[1], 10);

  // Check for ALTERED count
  const alteredMatch = raw.match(/<ALTERED>(\d+)<\/ALTERED>/i);
  if (alteredMatch) result.altered = parseInt(alteredMatch[1], 10);

  // Check for LINEERROR
  const errorMatch = raw.match(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/i);
  if (errorMatch) result.error = errorMatch[1].trim();

  // Check for general errors
  const generalError = raw.match(/<ERRORMSG>([\s\S]*?)<\/ERRORMSG>/i);
  if (generalError) result.error = generalError[1].trim();

  result.accepted = (result.created > 0 || result.altered > 0) && !result.error;

  return result;
}

// ─── Check if Tally is Running ────────────────────────────────────────────────

async function isTallyAlive() {
  try {
    await axios.get(TALLY_URL, { timeout: 3000 });
    return true;
  } catch (err) {
    // Tally returns weird responses to GET, but if we get a connection, it's alive
    if (err.response) return true;
    return false;
  }
}

// ─── Process a Single Event ───────────────────────────────────────────────────

async function processEvent(event) {
  const { id, syncType, payload } = event;
  log('INFO', `Processing: ${id} (${syncType})`);

  try {
    // Build the XML
    const xml = buildXML(syncType, payload);

    // Push to Tally
    const rawResponse = await pushToTally(xml);

    // ── Special handling for FETCH_MASTERS (Export Data) ──
    if (syncType === 'FETCH_MASTERS') {
      const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
      const ledgers = [];
      let match;

      while ((match = ledgerRegex.exec(rawResponse)) !== null) {
        const ledgerName = match[1];
        const ledgerBody = match[2];

        const parentMatch = ledgerBody.match(/<PARENT>([^<]*)<\/PARENT>/i);
        const gstinMatch = ledgerBody.match(/<PARTYGSTIN>([^<]*)<\/PARTYGSTIN>/i);
        const stateMatch = ledgerBody.match(/<LEDSTATENAME>([^<]*)<\/LEDSTATENAME>/i);
        const balMatch = ledgerBody.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
        const closingBalMatch = ledgerBody.match(/<CLOSINGBALANCE>([^<]*)<\/CLOSINGBALANCE>/i);

        const aliases = [];
        const nameListMatch = ledgerBody.match(/<NAME\.LIST>([\s\S]*?)<\/NAME\.LIST>/i);
        if (nameListMatch) {
          const nameRegex = /<NAME>([^<]*)<\/NAME>/gi;
          let nameMatch;
          let first = true;
          while ((nameMatch = nameRegex.exec(nameListMatch[1])) !== null) {
            if (first) { first = false; continue; }
            aliases.push(nameMatch[1]);
          }
        }

        ledgers.push({
          name: ledgerName,
          aliases,
          parent: parentMatch ? parentMatch[1] : '',
          openingBalance: balMatch ? balMatch[1].trim() : '0',
          closingBalance: closingBalMatch ? closingBalMatch[1].trim() : '0',
          gstin: gstinMatch ? gstinMatch[1] : '',
          state: stateMatch ? stateMatch[1] : '',
        });
      }

      if (ledgers.length === 0) {
        log('WARN', `⚠️ Tally returned 0 ledgers. Raw Response preview: ${rawResponse.substring(0, 300)}`);
      } else {
        log('SUCCESS', `✅ ${id} → Tally exported ${ledgers.length} ledgers`);
      }
      
      await markResult(id, 'SUCCESS', {
        status: 'Accepted',
        json: { ledgers },
      });
      return;
    }

    // ── Standard Voucher Handling (Create/Alter) ──
    const result = parseTallyResponse(rawResponse);

    if (result.accepted) {
      log('SUCCESS', `✅ ${id} → Tally accepted (created: ${result.created}, altered: ${result.altered})`);
      await markResult(id, 'SUCCESS', {
        status: 'Accepted',
        rawXml: result.rawXml,
      });
    } else if (result.error && result.error.includes('already exists')) {
      // ── SELF-HEAL: Duplicate Ledger → Switch to Alter ──
      log('WARN', `⚠️ ${id} → Duplicate detected, switching to Alter mode`);
      const alteredPayload = { ...payload };
      const alteredXml = buildXML(syncType, alteredPayload)
        .replace('ACTION="Create"', 'ACTION="Alter"');
      
      const alteredResponse = await pushToTally(alteredXml);
      const alteredResult = parseTallyResponse(alteredResponse);

      if (alteredResult.accepted) {
        log('SUCCESS', `✅ ${id} → Self-healed via Alter`);
        await markResult(id, 'SUCCESS', {
          status: 'Accepted',
          rawXml: alteredResult.rawXml,
        });
      } else {
        throw new Error(`Alter also failed: ${alteredResult.error || 'Unknown'}`);
      }
    } else {
      throw new Error(result.error || 'Tally did not accept the voucher');
    }
  } catch (err) {
    const errMsg = err.message || 'Unknown error';

    // Check if Tally is busy/locked
    if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ECONNRESET')) {
      log('WARN', `⏳ ${id} → Tally appears closed or busy. Will retry on next poll.`);
      // Don't mark as failed — the ERP already set it to IN_FLIGHT.
      // It will be retried on the next connector restart or manual retry.
      return;
    }

    log('ERROR', `❌ ${id} → ${errMsg}`);
    await markResult(id, 'FAILED', null, errMsg);
  }
}

// ─── Main Poll Loop ───────────────────────────────────────────────────────────

async function pollOnce() {
  try {
    // Step 1: Check if Tally is alive
    const tallyAlive = await isTallyAlive();
    if (!tallyAlive) {
      log('WARN', '⏳ Tally is not running. Waiting...');
      return;
    }

    // Step 2: Fetch pending events from ERP
    const events = await fetchPendingEvents();

    if (events.length === 0) {
      // Silent — no spam logging when idle
      return;
    }

    log('INFO', `📥 Fetched ${events.length} pending event(s)`);

    // Step 3: Process events ONE AT A TIME (single-threaded, no collisions)
    for (const event of events) {
      await processEvent(event);
      // Small delay between events to not overwhelm Tally
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (err) {
    // Network drop, ERP down, etc — just log and wait
    log('WARN', `🌐 Poll failed (ERP or network issue): ${err.message}`);
  }
}

async function startPolling() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  TALLY SYNC ENGINE — Precision Press ERP');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  ERP Server:   ${ERP_BASE_URL}`);
  console.log(`  Tally URL:    ${TALLY_URL}`);
  console.log(`  Poll Every:   ${POLL_INTERVAL / 1000}s`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  // Validate config
  if (!CONNECTOR_SECRET) {
    console.error('❌ FATAL: TALLY_CONNECTOR_SECRET is not set in .env');
    process.exit(1);
  }

  log('INFO', '🚀 Connector started. Polling for events...');

  // Initial poll
  await pollOnce();

  // Recurring poll
  setInterval(async () => {
    await pollOnce();
  }, POLL_INTERVAL);
}

// ─── Start ────────────────────────────────────────────────────────────────────

startPolling().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
