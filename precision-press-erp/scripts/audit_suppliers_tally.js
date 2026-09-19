const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const http = require('http');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

async function fetchTallyCreditorSummary() {
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
          <GROUPNAME>Sundry Creditors</GROUPNAME>
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

async function auditSuppliers() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('        🔍 STEP 1: AUDIT ALL SUPPLIERS (SUNDRY CREDITORS)');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // 1. Check live Tally Port 9000
  console.log('📡 1. Querying Live Tally Port 9000 for Sundry Creditors Group Summary...');
  const liveTallyClosing = new Map();
  try {
    const creditorSummaryXml = await fetchTallyCreditorSummary();
    console.log(`   ✅ Connected to Live Tally! Received Creditor Group Summary (${Math.round(creditorSummaryXml.length / 1024)} KB).`);

    const liveRegex = /<DSPDISPNAME>([^<]+)<\/DSPDISPNAME>[\s\S]*?<DSPACCINFO>[\s\S]*?<DSPCLDRAMTA>([^<]*)<\/DSPCLDRAMTA>[\s\S]*?<DSPCLCRAMTA>([^<]*)<\/DSPCLCRAMTA>/gi;
    let lMatch;
    while ((lMatch = liveRegex.exec(creditorSummaryXml)) !== null) {
      const pName = clean(lMatch[1]).toLowerCase();
      const dr = parseFloat(lMatch[2]) || 0;
      const cr = parseFloat(lMatch[3]) || 0;
      const net = dr !== 0 ? Math.abs(dr) : (cr !== 0 ? Math.abs(cr) : 0);
      const bType = cr !== 0 ? 'Cr' : (dr !== 0 ? 'Dr' : 'Cr');
      liveTallyClosing.set(pName, { bal: net, type: bType, dr, cr });
    }
    console.log(`   📊 Live Tally Closing Balances mapped for: ${liveTallyClosing.size} creditor ledgers.`);
  } catch (err) {
    console.log(`   ⚠️ Port 9000 notice: ${err.message}`);
  }

  // 2. Read Master.xml for all ledgers under Sundry Creditors or its subgroups
  console.log('\n📂 2. Reading Master.xml for all ledgers under Sundry Creditors & Subgroups...');
  const masterXml = fs.readFileSync('C:\\tally\\Master.xml', 'utf16le');

  // First check what groups exist in Master.xml under Sundry Creditors
  const groupRegex = /<GROUP NAME="([^"]*)"[^>]*>([\s\S]*?)<\/GROUP>/gi;
  let gm;
  const creditorGroups = new Set(['sundry creditors']);
  while ((gm = groupRegex.exec(masterXml)) !== null) {
    const gName = clean(gm[1]);
    const gBody = gm[2];
    const parentM = gBody.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const parent = parentM ? clean(parentM[1]).toLowerCase() : '';
    if (parent === 'sundry creditors' || creditorGroups.has(parent)) {
      creditorGroups.add(gName.toLowerCase());
    }
  }
  console.log(`   📂 Creditor Groups / Subgroups found in Tally:`, Array.from(creditorGroups));

  // Now parse ledgers
  const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  let lm;
  const supplierLedgers = [];
  const subgroupCount = {};

  while ((lm = ledgerRegex.exec(masterXml)) !== null) {
    const rawName = lm[1];
    const name = clean(rawName);
    const body = lm[2];

    const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const parentGroup = parentM ? clean(parentM[1]) : '';
    const parentLower = parentGroup.toLowerCase();

    const isCreditor = creditorGroups.has(parentLower) || parentLower.includes('creditor') || parentLower.includes('supplier');
    if (!isCreditor) continue;

    subgroupCount[parentGroup] = (subgroupCount[parentGroup] || 0) + 1;

    const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
    const alterM = body.match(/<ALTERID>([^<]*)<\/ALTERID>/i);
    const gstinM = body.match(/<PARTYGSTIN>([^<]*)<\/PARTYGSTIN>/i) || body.match(/<GSTIN>([^<]*)<\/GSTIN>/i);
    const gstTypeM = body.match(/<GSTREGISTRATIONTYPE>([^<]*)<\/GSTREGISTRATIONTYPE>/i);
    const balM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
    const stateM = body.match(/<STATE>([^<]*)<\/STATE>/i) || body.match(/<OLDLEDSTATENAME>([^<]*)<\/OLDLEDSTATENAME>/i);
    const pinM = body.match(/<PINCODE>([^<]*)<\/PINCODE>/i);
    const phoneM = body.match(/<LEDGERPHONE>([^<]*)<\/LEDGERPHONE>/i);
    const mobileM = body.match(/<LEDGERMOBILE>([^<]*)<\/LEDGERMOBILE>/i);
    const contactM = body.match(/<LEDGERCONTACT>([^<]*)<\/LEDGERCONTACT>/i);
    const emailM = body.match(/<EMAIL>([^<]*)<\/EMAIL>/i);
    const termsM = body.match(/<BILLCREDITPERIOD>([^<]*)<\/BILLCREDITPERIOD>/i);

    let opBalNum = 0;
    let opBalType = 'Cr';
    if (balM) {
      const raw = clean(balM[1]);
      const cleanNum = parseFloat(raw.replace(/[^\d.-]/g, '')) || 0;
      opBalNum = Math.abs(cleanNum);
      // For liability/creditor: positive is Cr (we owe them), negative is Dr (advance paid)
      opBalType = raw.startsWith('-') ? 'Dr' : 'Cr';
    }

    // Check Live Port 9000 closing balance
    const live = liveTallyClosing.get(name.toLowerCase());
    const closingBal = live ? live.bal : opBalNum;
    const closingType = live ? live.type : opBalType;

    // Address extraction
    const addressLines = [];
    const addrRegex = /<ADDRESS>([^<]*)<\/ADDRESS>/gi;
    let am;
    let extractedPhone = '';
    while ((am = addrRegex.exec(body)) !== null) {
      let line = clean(am[1]);
      const phoneOnlyMatch = line.match(/(?:mob(?:ile)?|ph(?:one)?|tel)?\s*[:\-\s]*([6-9]\d{9}|\d{5}\s*\d{5})/i);
      const isShortPhoneLine = phoneOnlyMatch && line.replace(/[^a-zA-Z]/g, '').length <= 6;
      if (isShortPhoneLine || /^\d{10}$/.test(line.replace(/\s+/g, ''))) {
        if (!extractedPhone) extractedPhone = (phoneOnlyMatch ? phoneOnlyMatch[1] : line).replace(/\s+/g, '');
        continue;
      }
      line = line.replace(/,+$/, '').trim();
      if (line && line !== '.') addressLines.push(line);
    }
    const fullAddress = addressLines.length > 0 ? addressLines.join(', ') : null;

    // Contact person extraction from parentheses
    let contactPerson = contactM ? clean(contactM[1]) : '';
    if (!contactPerson) {
      const parenMatch = name.match(/\(([^)]+)\)/);
      if (parenMatch) {
        const inside = parenMatch[1]
          .replace(/\b[6-9]\d{9}\b|\b\d{5}\s*\d{5}\b|\b0\d{2,4}[-\s]?\d{6,8}\b/g, '')
          .replace(/^(mr|mrs|ms|shri)\.?\s*/i, '')
          .replace(/[-:]+/g, '')
          .trim();
        if (inside.length >= 2 && inside.length <= 35 && !/^\d+$/.test(inside)) {
          contactPerson = inside;
        }
      }
    }

    // Phone extraction
    let finalPhone = mobileM ? clean(mobileM[1]).replace(/^PH\s*/i, '').trim() : '';
    if (!finalPhone && phoneM) finalPhone = clean(phoneM[1]);
    if (!finalPhone && extractedPhone) finalPhone = extractedPhone;
    if (!finalPhone) {
      const pMatch = name.match(/\b([6-9]\d{9})\b|\b([6-9]\d{4}\s*\d{5})\b|\b(0\d{2,4}[-\s]?\d{6,8})\b/);
      if (pMatch) finalPhone = (pMatch[1] || pMatch[2] || pMatch[3]).replace(/[\s-]/g, '');
    }

    const gstin = gstinM ? clean(gstinM[1]).toUpperCase() : null;
    const pan = (gstin && gstin.length === 15) ? gstin.slice(2, 12) : null;

    supplierLedgers.push({
      name,
      parentGroup,
      guid: guidM ? clean(guidM[1]) : null,
      alterId: alterM ? parseInt(alterM[1].trim(), 10) : null,
      gstin,
      pan,
      gstRegistrationType: gstTypeM ? clean(gstTypeM[1]) : (gstin ? 'Regular' : 'Unregistered'),
      phone: finalPhone || null,
      contactPerson: contactPerson || null,
      email: emailM ? clean(emailM[1]) : null,
      state: stateM ? clean(stateM[1]) : 'Karnataka',
      pincode: pinM ? clean(pinM[1]) : null,
      fullAddress,
      opBal: opBalNum,
      opBalType,
      closingBal,
      closingType,
      creditDays: termsM ? parseInt(clean(termsM[1]).replace(/[^\d]/g, ''), 10) || 30 : 30
    });
  }

  console.log(`\n📊 Total Verified Supplier Ledgers Found: ${supplierLedgers.length}`);
  console.log('   Subgroup breakdown:', subgroupCount);

  // Calculate balance totals
  let totalClosing = 0;
  let totalClosingCr = 0;
  let totalClosingDr = 0;
  let activeCount = 0;
  let zeroCount = 0;

  for (const s of supplierLedgers) {
    if (s.closingBal > 0) {
      activeCount++;
      if (s.closingType === 'Cr') totalClosingCr += s.closingBal;
      else totalClosingDr += s.closingBal;
    } else {
      zeroCount++;
    }
    totalClosing += s.closingBal;
  }

  console.log(`\n💰 Financial Overview of Suppliers:`);
  console.log(`   • Total Supplier Payables (Cr - You owe suppliers): ₹${totalClosingCr.toLocaleString('en-IN')}`);
  console.log(`   • Total Supplier Advances (Dr - Suppliers owe you): ₹${totalClosingDr.toLocaleString('en-IN')}`);
  console.log(`   • Net Total Balance: ₹${(totalClosingCr - totalClosingDr).toLocaleString('en-IN')}`);
  console.log(`   • Active Balance Accounts: ${activeCount} / ${supplierLedgers.length}`);
  console.log(`   • Zero Balance Accounts: ${zeroCount} / ${supplierLedgers.length}`);

  // 3. Inspect ERP database for current supplier state
  console.log('\n📥 3. Checking existing records in public.contact where type = \'supplier\'...');
  const erpExisting = await pool.query(`
    SELECT count(*) as total, count(tally_guid) as with_guid
    FROM public.contact
    WHERE type = 'supplier'
  `);
  console.log(`   📊 Existing suppliers in public.contact: ${erpExisting.rows[0].total} (with tally_guid: ${erpExisting.rows[0].with_guid})`);

  // Check if any existing customer names collide with supplier names
  const custCollisions = await pool.query(`
    SELECT name, tally_guid
    FROM public.contact
    WHERE type = 'customer' AND name = ANY($1::text[])
  `, [supplierLedgers.map(s => s.name)]);
  console.log(`   ⚠️ Name overlap between Customer & Supplier: ${custCollisions.rows.length}`);
  if (custCollisions.rows.length > 0) {
    console.log('   Colliding records:', custCollisions.rows);
  }

  // Print Sample Suppliers
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('                 📑 SAMPLE SUPPLIERS FOR AUDIT');
  console.log('═══════════════════════════════════════════════════════════════════════');
  supplierLedgers.slice(0, 10).forEach((s, i) => {
    console.log(`\n[${i + 1}] "${s.name}"`);
    console.log(`    Parent Group   : ${s.parentGroup}`);
    console.log(`    Tally GUID     : ${s.guid}`);
    console.log(`    Live Closing   : ₹${s.closingBal.toLocaleString('en-IN')} (${s.closingType})`);
    console.log(`    Phone          : ${s.phone || 'None'}`);
    console.log(`    Contact Person : ${s.contactPerson || 'None'}`);
    console.log(`    GSTIN          : ${s.gstin || 'None'}`);
    console.log(`    Address        : ${s.fullAddress || 'None'}`);
    console.log(`    State          : ${s.state}`);
  });

  await pool.end();
}

auditSuppliers().catch(console.error);
