const http = require('http');
const fs = require('fs');
const path = require('path');

const TARGET_COMPANY = 'New Web Testing';

function clean(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#4;/g, '')
    .trim();
}

function postToTally(xml) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      'http://127.0.0.1:9000',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(xml),
        },
        timeout: 30000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tally request timed out on port 9000'));
    });

    req.write(xml);
    req.end();
  });
}

async function inspectTally() {
  console.log(`Connecting to Tally on port 9000 for company "${TARGET_COMPANY}"...`);

  // Query: List of Accounts
  const xmlQuery = `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${TARGET_COMPANY}</SVCURRENTCOMPANY>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const resXml = await postToTally(xmlQuery);
    
    if (resXml.includes('<LINEERROR>')) {
      console.log('Tally returned error:', resXml);
      return;
    }

    // Save full raw response for reference
    const outPath = path.resolve(__dirname, '../scratch/new_web_testing_accounts.xml');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, resXml, 'utf8');
    console.log(`Saved raw Tally XML (${(resXml.length / 1024).toFixed(1)} KB) to scratch/new_web_testing_accounts.xml`);

    // Parse all ledgers
    const ledgerRegex = /<LEDGER\s+NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
    let m;

    const bankAccounts = [];
    const cashAccounts = [];
    const chartAccounts = [];
    const partyAccounts = [];

    const CONTACT_GROUPS = [
      'sundry debtors', 'debtors', 'sundry creditors', 'creditors', 'debtor', 'creditor'
    ];

    while ((m = ledgerRegex.exec(resXml)) !== null) {
      const rawName = m[1];
      const name = clean(rawName);
      const body = m[2];

      const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
      const parent = parentM ? clean(parentM[1]) : 'Primary';

      const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
      const guid = guidM ? clean(guidM[1]) : null;

      const alterM = body.match(/<ALTERID>([^<]*)<\/ALTERID>/i);
      const alterId = alterM ? parseInt(alterM[1].trim(), 10) || null : null;

      const balM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
      let balNum = 0;
      let balType = 'Dr';
      if (balM) {
        const raw = clean(balM[1]);
        const cleanNum = parseFloat(raw.replace(/[^\d.-]/g, '')) || 0;
        balNum = Math.abs(cleanNum);
        balType = raw.startsWith('-') || cleanNum < 0 ? 'Dr' : 'Cr';
      }

      const accNoM = body.match(/<BANKACCOUNTNUMBER>([^<]*)<\/BANKACCOUNTNUMBER>/i) || body.match(/<ACCOUNTNUMBER>([^<]*)<\/ACCOUNTNUMBER>/i);
      const ifscM = body.match(/<IFSCODE>([^<]*)<\/IFSCODE>/i);

      const pLower = parent.toLowerCase();

      // Check if Bank
      if (pLower.includes('bank account') || pLower.includes('bank occ') || pLower.includes('bank od')) {
        bankAccounts.push({
          name,
          parent,
          guid,
          alterId,
          openingBalance: balNum,
          openingBalanceType: balType,
          accountNumber: accNoM ? clean(accNoM[1]) : null,
          ifsc: ifscM ? clean(ifscM[1]) : null
        });
      } else if (pLower.includes('cash-in-hand') || pLower.includes('cash in hand') || pLower === 'cash') {
        cashAccounts.push({
          name,
          parent,
          guid,
          alterId,
          openingBalance: balNum,
          openingBalanceType: balType
        });
      } else if (CONTACT_GROUPS.some(cg => pLower.includes(cg))) {
        partyAccounts.push({
          name,
          parent,
          guid,
          alterId,
          openingBalance: balNum,
          openingBalanceType: balType
        });
      } else {
        chartAccounts.push({
          name,
          parent,
          guid,
          alterId,
          openingBalance: balNum,
          openingBalanceType: balType
        });
      }
    }

    console.log('\n======================================================');
    console.log(`🏦 BANK ACCOUNTS IN TALLY (${bankAccounts.length})`);
    console.log('======================================================');
    bankAccounts.forEach((b, idx) => {
      console.log(`[${idx + 1}] ${b.name}`);
      console.log(`    Parent Group   : ${b.parent}`);
      console.log(`    GUID           : ${b.guid}`);
      console.log(`    Alter ID       : ${b.alterId}`);
      console.log(`    Opening Balance: ₹${b.openingBalance.toLocaleString('en-IN')} (${b.openingBalanceType})`);
      if (b.accountNumber) console.log(`    Account No     : ${b.accountNumber}`);
      if (b.ifsc) console.log(`    IFSC           : ${b.ifsc}`);
    });

    console.log('\n======================================================');
    console.log(`💵 CASH ACCOUNTS IN TALLY (${cashAccounts.length})`);
    console.log('======================================================');
    cashAccounts.forEach((c, idx) => {
      console.log(`[${idx + 1}] ${c.name}`);
      console.log(`    Parent Group   : ${c.parent}`);
      console.log(`    GUID           : ${c.guid}`);
      console.log(`    Opening Balance: ₹${c.openingBalance.toLocaleString('en-IN')} (${c.openingBalanceType})`);
    });

    console.log('\n======================================================');
    console.log(`📊 GENERAL CHART OF ACCOUNTS (GL) IN TALLY (${chartAccounts.length})`);
    console.log('======================================================');
    chartAccounts.forEach((g, idx) => {
      console.log(`[${idx + 1}] ${g.name} | Parent: ${g.parent} | GUID: ${g.guid} | Bal: ₹${g.openingBalance} (${g.openingBalanceType})`);
    });

    console.log('\n======================================================');
    console.log(`👥 PARTIES / CONTACTS (Excluded from COA): ${partyAccounts.length}`);
    console.log('======================================================');

  } catch (err) {
    console.error('Error connecting to Tally on port 9000:', err.message);
  }
}

inspectTally();
