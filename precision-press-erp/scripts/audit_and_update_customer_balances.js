const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const http = require('http');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

async function fetchTallyGroupSummary() {
  const reqXml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Group Summary</REPORTNAME>
        <STATICVARIABLES>
          <EXPLODEFLAG>Yes</EXPLODEFLAG>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <GROUPNAME>Sundry Debtors</GROUPNAME>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 9000,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'Content-Length': Buffer.byteLength(reqXml)
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', err => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tally Port 9000 timeout'));
    });
    req.write(reqXml);
    req.end();
  });
}

function clean(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#4;/g, '')
    .replace(/&#10;/g, ' ')
    .replace(/&#13;/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,;]+$/, '')
    .trim();
}

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('   STEP 1: INSPECT CURRENT BALANCES & CREDIT LIMIT FOR ALL CUSTOMERS');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // Check Aarohi Events first
  const aarohiRes = await pool.query(`
    SELECT id, name, tally_guid, credit_limit, opening_balance, tally_opening_balance, tally_closing_balance, opening_balance_type
    FROM public.contact
    WHERE name ILIKE '%Aarohi%'
  `);
  console.log('🔍 Current DB Aarohi Events record:', aarohiRes.rows);

  // Check live Tally closing balances via Port 9000
  console.log('\n📡 Fetching Live Tally Closing Balances from Port 9000...');
  const liveTallyClosing = new Map();
  try {
    const summaryXml = await fetchTallyGroupSummary();
    const liveRegex = /<DSPDISPNAME>([^<]+)<\/DSPDISPNAME>[\s\S]*?<DSPACCINFO>[\s\S]*?<DSPCLDRAMTA>([^<]*)<\/DSPCLDRAMTA>[\s\S]*?<DSPCLCRAMTA>([^<]*)<\/DSPCLCRAMTA>/gi;
    let lMatch;
    while ((lMatch = liveRegex.exec(summaryXml)) !== null) {
      const pName = clean(lMatch[1]).toLowerCase();
      const dr = parseFloat(lMatch[2]) || 0;
      const cr = parseFloat(lMatch[3]) || 0;
      const net = dr !== 0 ? Math.abs(dr) : (cr !== 0 ? Math.abs(cr) : 0);
      const bType = dr !== 0 ? 'Dr' : (cr !== 0 ? 'Cr' : 'Dr');
      liveTallyClosing.set(pName, { bal: net, type: bType });
    }
    console.log(`✅ Live Tally Closing Balances mapped for ${liveTallyClosing.size} parties.`);
  } catch (e) {
    console.log('⚠️ Port 9000 error:', e.message);
  }

  // Check Master.xml for original Tally Opening Balance
  console.log('\n📂 Reading Tally Master.xml for Tally Opening Balances...');
  const masterXml = fs.readFileSync('C:\\tally\\Master.xml', 'utf16le');
  const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  let m;
  const tallyMasterMap = new Map(); // guid -> { opBal, opType, closingBal, closingType }

  while ((m = ledgerRegex.exec(masterXml)) !== null) {
    const rawName = m[1];
    const name = clean(rawName);
    const body = m[2];
    const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const parent = parentM ? parentM[1].toLowerCase() : '';
    if (!parent.includes('debtor') && !['main', 'px1', 'stf', 'debt', 'brnh'].includes(parent)) continue;

    const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
    if (!guidM) continue;
    const guid = guidM[1].trim().toLowerCase();

    const balM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
    let opBalNum = 0;
    let opBalType = 'Dr';
    if (balM) {
      const raw = clean(balM[1]);
      const cleanNum = parseFloat(raw.replace(/[^\d.-]/g, '')) || 0;
      opBalNum = Math.abs(cleanNum);
      opBalType = raw.startsWith('-') || cleanNum > 0 ? 'Dr' : 'Cr';
    }

    const live = liveTallyClosing.get(name.toLowerCase());
    const closingBal = live ? live.bal : opBalNum;
    const closingType = live ? live.type : opBalType;

    tallyMasterMap.set(guid, {
      name,
      opBal: opBalNum,
      opBalType,
      closingBal,
      closingType
    });
  }
  console.log(`✅ Tally Masters loaded: ${tallyMasterMap.size} customer ledgers.`);

  // Verify Aarohi in Tally
  for (const [g, rec] of tallyMasterMap.entries()) {
    if (rec.name.toLowerCase().includes('aarohi')) {
      console.log('🔍 Aarohi Events in Tally:', rec);
    }
  }

  // STEP 2: SET CREDIT LIMIT TO 0 FOR ALL CUSTOMERS
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('   STEP 2: SET CREDIT LIMIT TO 0 FOR ALL 1,754 CUSTOMERS');
  console.log('═══════════════════════════════════════════════════════════════════════');
  const updateCreditRes = await pool.query(`
    UPDATE public.contact
    SET credit_limit = 0
    WHERE type = 'customer'
  `);
  console.log(`✅ Updated credit_limit = 0 for ${updateCreditRes.rowCount} customers.`);

  // STEP 3: ENSURE TALLY OPENING, TALLY CLOSING & ERP OPENING BALANCE PARITY
  // User Rule:
  // 1. opening_balance = Tally Closing Balance (so day 1 starting statement baseline matches live Tally closing)
  // 2. tally_closing_balance = Tally Closing Balance
  // 3. tally_opening_balance = Tally Opening Balance (actual original opening balance in Tally)
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('   STEP 3: SYNCHRONIZE & VERIFY BALANCES');
  console.log('═══════════════════════════════════════════════════════════════════════');

  const allCustomersRes = await pool.query(`
    SELECT id, name, tally_guid, credit_limit, opening_balance, tally_opening_balance, tally_closing_balance, opening_balance_type
    FROM public.contact
    WHERE type = 'customer'
  `);

  let opBalUpdated = 0;
  let tallyOpBalUpdated = 0;

  for (const cust of allCustomersRes.rows) {
    const guid = (cust.tally_guid || '').toLowerCase();
    const tRec = tallyMasterMap.get(guid);
    if (!tRec) continue;

    // We want:
    // cust.opening_balance = tRec.closingBal
    // cust.tally_closing_balance = tRec.closingBal
    // cust.tally_opening_balance = tRec.opBal
    // cust.opening_balance_type = tRec.closingType

    const needsOpUpdate = Math.abs(parseFloat(cust.opening_balance || 0) - tRec.closingBal) >= 0.01 ||
                          Math.abs(parseFloat(cust.tally_closing_balance || 0) - tRec.closingBal) >= 0.01 ||
                          cust.opening_balance_type !== tRec.closingType;

    const needsTallyOpUpdate = Math.abs(parseFloat(cust.tally_opening_balance || 0) - tRec.opBal) >= 0.01;

    if (needsOpUpdate || needsTallyOpUpdate) {
      await pool.query(`
        UPDATE public.contact
        SET
          opening_balance = $1,
          tally_closing_balance = $1,
          opening_balance_type = $2,
          tally_opening_balance = $3
        WHERE id = $4
      `, [tRec.closingBal, tRec.closingType, tRec.opBal, cust.id]);

      if (needsOpUpdate) opBalUpdated++;
      if (needsTallyOpUpdate) tallyOpBalUpdated++;
    }
  }

  console.log(`✅ Balance adjustments: ${opBalUpdated} records updated for closing/opening parity.`);
  console.log(`✅ Tally Original Opening Balances set: ${tallyOpBalUpdated} records.`);

  // Check Aarohi again after update
  const aarohiAfter = await pool.query(`
    SELECT id, name, credit_limit, opening_balance, tally_opening_balance, tally_closing_balance, opening_balance_type
    FROM public.contact
    WHERE name ILIKE '%Aarohi%'
  `);
  console.log('\n🔍 Post-update Aarohi Events record:', aarohiAfter.rows[0]);

  // Overall Verification Check
  const verifyRes = await pool.query(`
    SELECT
      count(*) as total_customers,
      count(CASE WHEN credit_limit = 0 THEN 1 END) as zero_credit_limit,
      count(CASE WHEN opening_balance = tally_closing_balance THEN 1 END) as erp_op_equals_tally_closing,
      sum(opening_balance) as total_erp_opening_balance,
      sum(tally_closing_balance) as total_tally_closing_balance,
      sum(tally_opening_balance) as total_tally_opening_balance
    FROM public.contact
    WHERE type = 'customer'
  `);
  console.log('\n📊 FINAL VERIFICATION METRICS:');
  console.table(verifyRes.rows);

  const samples = await pool.query(`
    SELECT name, credit_limit, opening_balance, tally_closing_balance, opening_balance_type, "printerCategory"
    FROM public.contact
    WHERE type = 'customer' AND opening_balance > 0
    ORDER BY opening_balance DESC
    LIMIT 10
  `);
  console.log('\n📋 TOP 10 ACTIVE CUSTOMER BALANCES (ERP Opening = Tally Closing):');
  console.table(samples.rows);

  await pool.end();
}

run().catch(console.error);
