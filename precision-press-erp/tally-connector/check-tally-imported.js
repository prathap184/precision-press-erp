const axios = require('axios');

async function checkTallyMasters() {
  const reqXml = `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Export Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <EXPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>List of Accounts</REPORTNAME>
    <STATICVARIABLES>
     <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
     <ACCOUNTTYPE>Ledgers</ACCOUNTTYPE>
    </STATICVARIABLES>
   </REQUESTDESC>
  </EXPORTDATA>
 </BODY>
</ENVELOPE>`;

  try {
    const res = await axios.post('http://localhost:9000', reqXml, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      timeout: 30000
    });

    const xml = String(res.data);
    const ledgerMatches = [...xml.matchAll(/<LEDGER NAME="([^"]*)"[^>]*>/gi)];
    console.log(`\n=======================================================`);
    console.log(`📊 TOTAL LEDGERS IN LOCAL TALLY PRIME: ${ledgerMatches.length}`);
    console.log(`=======================================================\n`);

    const sample = ledgerMatches.slice(0, 30).map(m => m[1]);
    console.log('Sample Ledgers Found in Tally:');
    sample.forEach((s, idx) => console.log(`  ${idx + 1}. ${s}`));

    if (ledgerMatches.length > 30) {
      console.log(`\n... and ${ledgerMatches.length - 30} more ledgers in Tally!`);
    }
  } catch (err) {
    console.error('❌ Error checking Tally:', err.message);
  }
}

checkTallyMasters();
