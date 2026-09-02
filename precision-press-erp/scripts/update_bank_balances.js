const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const COMPANY_NAME = process.env.TALLY_COMPANY_NAME || 'Website Testing Hindustan';

async function setBankOpeningBalances() {
  console.log('Updating Opening Balances for Federal 2091, Cash, and Cash B2 in Tally...');

  const xml = `<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY></STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    <!-- Federal 2091: -915 (Credit Balance) -->
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Federal 2091" ACTION="Alter">
      <NAME>Federal 2091</NAME>
      <PARENT>Bank Accounts</PARENT>
      <OPENINGBALANCE>915.00</OPENINGBALANCE>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
     </LEDGER>
    </TALLYMESSAGE>

    <!-- Cash B2: 74,042 (Debit Balance) -->
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Cash B2" ACTION="Alter">
      <NAME>Cash B2</NAME>
      <PARENT>Cash-in-hand</PARENT>
      <OPENINGBALANCE>-74042.00</OPENINGBALANCE>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
     </LEDGER>
    </TALLYMESSAGE>

    <!-- Main Cash: 31,73,956.41 (Debit Balance) -->
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Cash" ACTION="Alter">
      <NAME>Cash</NAME>
      <PARENT>Cash-in-hand</PARENT>
      <OPENINGBALANCE>-3173956.41</OPENINGBALANCE>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
     </LEDGER>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;

  const res = await axios.post('http://localhost:9000', xml, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    timeout: 30000,
    responseType: 'text'
  });

  console.log('Tally Response:\n', res.data);
}

setBankOpeningBalances().catch(console.error);
