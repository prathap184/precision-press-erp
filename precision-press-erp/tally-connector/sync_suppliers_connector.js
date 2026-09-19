/**
 * sync_suppliers_connector.js
 *
 * Synchronizes all 88 Verified Supplier (Sundry Creditors) Ledgers from Tally Prime Gold into ERP (public.contact).
 *
 * Strict Rules:
 * 1. type = 'supplier'
 * 2. Tally Closing Balance = ERP Opening Balance & Current Tally Closing Balance (exact to paisa).
 * 3. Opening Balance Type: 'Cr' (Payable / You owe supplier) or 'Dr' (Advance paid to supplier).
 * 4. Credit Limit: 0.00 by default (customizable later).
 * 5. billing_address_line1: Full combined clean single-line address.
 * 6. billing_address_line2: strictly NULL (prevents duplicate invoice print lines).
 * 7. "printerCategory": 'Sundry Creditors'
 * 8. remarks: 'Current Liabilities ➔ Sundry Creditors'
 * 9. Keyed on tally_guid (ACID transaction).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000002';
const PRIMARY_XML_PATH = 'C:\\tally\\Master.xml';
const TALLY_HOST = '127.0.0.1';
const TALLY_PORT = 9000;

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

async function fetchLiveClosingBalances() {
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
      hostname: TALLY_HOST,
      port: TALLY_PORT,
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

function resolveSmartCity(name, address, state) {
  const combined = `${name || ''} ${address || ''} ${state || ''}`.toLowerCase();
  if (combined.includes('bangalore') || combined.includes('bengaluru')) return { city: 'Bengaluru', state: 'Karnataka' };
  if (combined.includes('mysore') || combined.includes('mysuru')) return { city: 'Mysuru', state: 'Karnataka' };
  if (combined.includes('mumbai') || combined.includes('bombay')) return { city: 'Mumbai', state: 'Maharashtra' };
  if (combined.includes('hyderabad') || combined.includes('telangana')) return { city: 'Hyderabad', state: 'Telangana' };
  if (combined.includes('chennai') || combined.includes('madras')) return { city: 'Chennai', state: 'Tamil Nadu' };
  if (combined.includes('delhi')) return { city: 'Delhi', state: 'Delhi' };
  if (combined.includes('pune')) return { city: 'Pune', state: 'Maharashtra' };
  return { city: 'Mysuru', state: state || 'Karnataka' };
}

async function parseSuppliersFromXml(xml) {
  const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  let lm;
  const suppliers = [];

  while ((lm = ledgerRegex.exec(xml)) !== null) {
    const rawName = lm[1];
    const name = clean(rawName);
    const body = lm[2];

    const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const parentGroup = parentM ? clean(parentM[1]) : '';
    const parentLower = parentGroup.toLowerCase();

    if (!parentLower.includes('creditor') && !parentLower.includes('supplier')) continue;

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
      opBalType = raw.startsWith('-') ? 'Dr' : 'Cr';
    }

    // Address lines
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

    // Contact person extraction
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
    const geo = resolveSmartCity(name, fullAddress, stateM ? clean(stateM[1]) : null);

    suppliers.push({
      tallyName: name,
      tallyGroup: parentGroup,
      tallyGuid: guidM ? clean(guidM[1]) : null,
      alterId: alterM ? parseInt(alterM[1].trim(), 10) : null,
      gstin,
      pan,
      gstRegistrationType: gstTypeM ? clean(gstTypeM[1]) : (gstin ? 'Regular' : 'Unregistered'),
      phone: finalPhone || null,
      contactPerson: contactPerson || null,
      email: emailM ? clean(emailM[1]) : null,
      city: geo.city,
      state: geo.state,
      pincode: pinM ? clean(pinM[1]) : null,
      fullAddress,
      openingBalance: opBalNum,
      closingBalance: opBalNum,
      openingBalanceType: opBalType,
      paymentTermsDays: termsM ? parseInt(clean(termsM[1]).replace(/[^\d]/g, ''), 10) || 30 : 30
    });
  }

  return suppliers;
}

async function syncSuppliers() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('      🚀 SYNC SUPPLIERS (SUNDRY CREDITORS): TALLY ➔ ERP DATABASE');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  try {
    // 1. Read Master XML
    console.log(`📂 Reading master XML from: ${PRIMARY_XML_PATH}...`);
    const masterXml = fs.readFileSync(PRIMARY_XML_PATH, 'utf16le');
    const suppliers = await parseSuppliersFromXml(masterXml);
    console.log(`📊 Extracted ${suppliers.length} Supplier records.`);

    // 2. Query Live Closing Balances from Port 9000
    try {
      console.log('📡 Fetching live closing balances from Tally HTTP Port 9000...');
      const liveXml = await fetchLiveClosingBalances();
      const liveRegex = /<DSPDISPNAME>([^<]+)<\/DSPDISPNAME>[\s\S]*?<DSPACCINFO>[\s\S]*?<DSPCLDRAMTA>([^<]*)<\/DSPCLDRAMTA>[\s\S]*?<DSPCLCRAMTA>([^<]*)<\/DSPCLCRAMTA>/gi;
      let lMatch;
      let liveCount = 0;
      while ((lMatch = liveRegex.exec(liveXml)) !== null) {
        const pName = clean(lMatch[1]).toLowerCase();
        const dr = parseFloat(lMatch[2]) || 0;
        const cr = parseFloat(lMatch[3]) || 0;
        const net = dr !== 0 ? Math.abs(dr) : (cr !== 0 ? Math.abs(cr) : 0);
        const bType = cr !== 0 ? 'Cr' : (dr !== 0 ? 'Dr' : 'Cr');

        const target = suppliers.find(s => s.tallyName.toLowerCase() === pName);
        if (target) {
          target.closingBalance = net;
          target.openingBalance = net;
          target.openingBalanceType = bType;
          liveCount++;
        }
      }
      console.log(`✅ Updated ${liveCount} live closing balances from Port 9000.`);
    } catch (liveErr) {
      console.log(`⚠️ Port 9000 notice: ${liveErr.message}. Using Master.xml balances.`);
    }

    // 3. Begin ACID Transaction
    await client.query('BEGIN');
    console.log('\n🔒 Begun ACID Transaction in PostgreSQL...');

    let insertedCount = 0;
    let updatedCount = 0;

    for (const s of suppliers) {
      // Check existing supplier by tally_guid or name
      const existingRes = await client.query(`
        SELECT id FROM public.contact
        WHERE organization_id = $1 AND type = 'supplier' AND (
          (tally_guid IS NOT NULL AND tally_guid = $2) OR
          LOWER(name) = LOWER($3)
        )
      `, [DEFAULT_ORG_ID, s.tallyGuid, s.tallyName]);

      if (existingRes.rows.length > 0) {
        // Update existing supplier
        await client.query(`
          UPDATE public.contact
          SET
            name = $1,
            tally_ledger_name = $2,
            tally_guid = $3,
            alter_id = $4,
            gstin = $5,
            gst_number = $6,
            pan_number = $7,
            gst_registered = $8,
            gst_registration_type = $9,
            phone = $10,
            contact_person = $11,
            email = $12,
            place_of_supply = $13,
            billing_address_line1 = $14,
            billing_address_line2 = NULL,
            billing_city = $15,
            billing_state = $16,
            billing_pincode = $17,
            billing_country = 'India',
            opening_balance = $18,
            tally_opening_balance = $19,
            tally_closing_balance = $20,
            opening_balance_type = $21,
            "printerCategory" = $22,
            remarks = $23,
            credit_limit = 0,
            payment_terms_days = $24,
            credit_days = $25,
            is_synced_to_erp = true,
            currency_code = 'INR',
            updated_at = NOW()
          WHERE id = $26
        `, [
          s.tallyName,
          s.tallyName,
          s.tallyGuid,
          s.alterId,
          s.gstin || null,
          s.gstin || null,
          s.pan || null,
          s.gstin ? 'true' : 'false',
          s.gstRegistrationType,
          s.phone || null,
          s.contactPerson || null,
          s.email || null,
          s.state || 'Karnataka',
          s.fullAddress || null,
          s.city,
          s.state,
          s.pincode || null,
          s.closingBalance,
          s.closingBalance,
          s.closingBalance,
          s.openingBalanceType,
          'Sundry Creditors',
          'Current Liabilities ➔ Sundry Creditors',
          s.paymentTermsDays || 30,
          s.paymentTermsDays || 30,
          existingRes.rows[0].id
        ]);
        updatedCount++;
      } else {
        // Insert new supplier
        await client.query(`
          INSERT INTO public.contact (
            id,
            organization_id,
            name,
            type,
            tally_ledger_name,
            tally_guid,
            alter_id,
            gstin,
            gst_number,
            pan_number,
            gst_registered,
            gst_registration_type,
            phone,
            contact_person,
            email,
            place_of_supply,
            billing_address_line1,
            billing_address_line2,
            billing_city,
            billing_state,
            billing_pincode,
            billing_country,
            opening_balance,
            tally_opening_balance,
            tally_closing_balance,
            opening_balance_type,
            "printerCategory",
            remarks,
            credit_limit,
            payment_terms_days,
            credit_days,
            is_synced_to_erp,
            currency_code,
            created_at,
            updated_at
          ) VALUES (
            gen_random_uuid(),
            $1, $2, 'supplier', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, NULL, $16, $17, $18, 'India', $19, $20, $21, $22,
            $23, $24, 0, $25, $26, true, 'INR', NOW(), NOW()
          )
        `, [
          DEFAULT_ORG_ID,
          s.tallyName,
          s.tallyName,
          s.tallyGuid,
          s.alterId,
          s.gstin || null,
          s.gstin || null,
          s.pan || null,
          s.gstin ? 'true' : 'false',
          s.gstRegistrationType,
          s.phone || null,
          s.contactPerson || null,
          s.email || null,
          s.state || 'Karnataka',
          s.fullAddress || null,
          s.city,
          s.state,
          s.pincode || null,
          s.closingBalance,
          s.closingBalance,
          s.closingBalance,
          s.openingBalanceType,
          'Sundry Creditors',
          'Current Liabilities ➔ Sundry Creditors',
          s.paymentTermsDays || 30,
          s.paymentTermsDays || 30
        ]);
        insertedCount++;
      }
    }

    await client.query('COMMIT');
    console.log(`\n🎉 TRANSACTION COMMITTED SUCCESSFULLY!`);
    console.log(`   • Suppliers Inserted : ${insertedCount}`);
    console.log(`   • Suppliers Updated  : ${updatedCount}`);
    console.log(`   • Total Processed    : ${suppliers.length}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Sync failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// If run directly with --execute
if (process.argv.includes('--execute')) {
  syncSuppliers().catch(console.error);
} else {
  console.log('ℹ️ Dry-run mode. Run with --execute to commit to database.');
}

module.exports = { syncSuppliers, parseSuppliersFromXml };
