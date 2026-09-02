const axios = require('axios');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000';
const COMPANY_NAME = process.env.TALLY_COMPANY_NAME || 'Website Testing Hindustan';

async function sendToTally(envelopeXml) {
  try {
    const res = await axios.post(TALLY_URL, envelopeXml, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Accept': 'text/xml'
      },
      timeout: 30000,
      responseType: 'text'
    });

    const responseText = String(res.data);
    const createdMatch = responseText.match(/<CREATED>(\d+)<\/CREATED>/i);
    const alteredMatch = responseText.match(/<ALTERED>(\d+)<\/ALTERED>/i);
    const errorsMatch = responseText.match(/<ERRORS>(\d+)<\/ERRORS>/i);

    return {
      success: true,
      created: createdMatch ? parseInt(createdMatch[1], 10) : 0,
      altered: alteredMatch ? parseInt(alteredMatch[1], 10) : 0,
      errors: errorsMatch ? parseInt(errorsMatch[1], 10) : 0,
      raw: responseText
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`🚀 Pushing Targeted Masters to Tally: ${COMPANY_NAME}`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // 1. GODOWNS
  const godownsXml = `<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY></STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <GODOWN NAME="B1" ACTION="Create"><NAME>B1</NAME><PARENT/></GODOWN>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <GODOWN NAME="B2" ACTION="Create"><NAME>B2</NAME><PARENT/></GODOWN>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <GODOWN NAME="B9" ACTION="Create"><NAME>B9</NAME><PARENT/></GODOWN>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
  const rGodowns = await sendToTally(godownsXml);
  console.log(`1. Godowns (B1, B2, B9): Created=${rGodowns.created}, Altered=${rGodowns.altered}, Errors=${rGodowns.errors}`);

  // 2. CORE ACCOUNTING LEDGERS & BANKS & CUSTOMERS
  const ledgersXml = `<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY></STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    <!-- Sales Revenue -->
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="GST SALES" ACTION="Create">
      <NAME>GST SALES</NAME>
      <PARENT>Sales Accounts</PARENT>
      <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
      <ISREVENUE>Yes</ISREVENUE>
      <AFFECTSGROSSPROFIT>Yes</AFFECTSGROSSPROFIT>
      <GSTAPPLICABLE>&#4; Applicable</GSTAPPLICABLE>
     </LEDGER>
    </TALLYMESSAGE>

    <!-- GST Taxes -->
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="CGST" ACTION="Create">
      <NAME>CGST</NAME>
      <PARENT>Duties &amp; Taxes</PARENT>
      <TAXTYPE>GST</TAXTYPE>
      <GSTDUTYHEAD>CGST</GSTDUTYHEAD>
      <RATEOFTAXCALCULATION>9</RATEOFTAXCALCULATION>
     </LEDGER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="SGST" ACTION="Create">
      <NAME>SGST</NAME>
      <PARENT>Duties &amp; Taxes</PARENT>
      <TAXTYPE>GST</TAXTYPE>
      <GSTDUTYHEAD>SGST/UTGST</GSTDUTYHEAD>
      <RATEOFTAXCALCULATION>9</RATEOFTAXCALCULATION>
     </LEDGER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="IGST" ACTION="Create">
      <NAME>IGST</NAME>
      <PARENT>Duties &amp; Taxes</PARENT>
      <TAXTYPE>GST</TAXTYPE>
      <GSTDUTYHEAD>IGST</GSTDUTYHEAD>
      <RATEOFTAXCALCULATION>18</RATEOFTAXCALCULATION>
     </LEDGER>
    </TALLYMESSAGE>

    <!-- Logistics / Freight -->
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="zForwarding Charge- Sale" ACTION="Create">
      <NAME>zForwarding Charge- Sale</NAME>
      <PARENT>Indirect Incomes</PARENT>
      <ISREVENUE>Yes</ISREVENUE>
      <AFFECTSGROSSPROFIT>No</AFFECTSGROSSPROFIT>
     </LEDGER>
    </TALLYMESSAGE>

    <!-- Rounding -->
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Round Off" ACTION="Create">
      <NAME>Round Off</NAME>
      <PARENT>Indirect Expenses</PARENT>
      <ISREVENUE>Yes</ISREVENUE>
      <AFFECTSGROSSPROFIT>No</AFFECTSGROSSPROFIT>
     </LEDGER>
    </TALLYMESSAGE>

    <!-- 3 Bank Accounts -->
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="HDFC Bank" ACTION="Create">
      <NAME>HDFC Bank</NAME>
      <PARENT>Bank Accounts</PARENT>
      <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
     </LEDGER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="ICICI Bank" ACTION="Create">
      <NAME>ICICI Bank</NAME>
      <PARENT>Bank Accounts</PARENT>
      <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
     </LEDGER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Canara Bank" ACTION="Create">
      <NAME>Canara Bank</NAME>
      <PARENT>Bank Accounts</PARENT>
      <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
     </LEDGER>
    </TALLYMESSAGE>

    <!-- Customers -->
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="5C Shimoga Hidayath" ACTION="Create">
      <NAME>5C Shimoga Hidayath</NAME>
      <PARENT>Sundry Debtors</PARENT>
      <ISBILLWISEON>Yes</ISBILLWISEON>
      <STATENAME>Karnataka</STATENAME>
      <COUNTRYNAME>India</COUNTRYNAME>
      <GSTREGISTRATIONTYPE>Unregistered</GSTREGISTRATIONTYPE>
     </LEDGER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Image Media Solutions- HO- IMX" ACTION="Create">
      <NAME>Image Media Solutions- HO- IMX</NAME>
      <PARENT>Sundry Debtors</PARENT>
      <ISBILLWISEON>Yes</ISBILLWISEON>
      <PARTYGSTIN>29AADFI9241C1ZG</PARTYGSTIN>
      <STATENAME>Karnataka</STATENAME>
      <COUNTRYNAME>India</COUNTRYNAME>
      <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>
     </LEDGER>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
  const rLedgers = await sendToTally(ledgersXml);
  console.log(`2. Ledgers, Banks & Customers: Created=${rLedgers.created}, Altered=${rLedgers.altered}, Errors=${rLedgers.errors}`);

  // 3. 5 STOCK ITEMS
  const itemsXml = `<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY></STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <STOCKITEM NAME="01 Acrylic Premium 1.0mm (5 FT x 5 FT)" ACTION="Create">
      <NAME>01 Acrylic Premium 1.0mm (5 FT x 5 FT)</NAME>
      <PARENT>Acrylic</PARENT>
      <BASEUNITS>N</BASEUNITS>
      <GSTAPPLICABLE>&#4; Applicable</GSTAPPLICABLE>
      <GSTTYPEOFSUPPLY>Goods</GSTTYPEOFSUPPLY>
      <GSTHSNNAME>32141000</GSTHSNNAME>
     </STOCKITEM>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <STOCKITEM NAME="CP 25 Medium Yellow" ACTION="Create">
      <NAME>CP 25 Medium Yellow</NAME>
      <PARENT>Spray</PARENT>
      <BASEUNITS>N</BASEUNITS>
      <GSTAPPLICABLE>&#4; Applicable</GSTAPPLICABLE>
      <GSTTYPEOFSUPPLY>Goods</GSTTYPEOFSUPPLY>
      <GSTHSNNAME>32089090</GSTHSNNAME>
     </STOCKITEM>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <STOCKITEM NAME="Dow 789= Clear/24" ACTION="Create">
      <NAME>Dow 789= Clear/24</NAME>
      <PARENT>Primary</PARENT>
      <BASEUNITS>N</BASEUNITS>
      <GSTAPPLICABLE>&#4; Applicable</GSTAPPLICABLE>
      <GSTTYPEOFSUPPLY>Goods</GSTTYPEOFSUPPLY>
      <GSTHSNNAME>32141000</GSTHSNNAME>
     </STOCKITEM>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <STOCKITEM NAME="CP 48 Haier Grey" ACTION="Create">
      <NAME>CP 48 Haier Grey</NAME>
      <PARENT>Spray</PARENT>
      <BASEUNITS>N</BASEUNITS>
      <GSTAPPLICABLE>&#4; Applicable</GSTAPPLICABLE>
      <GSTTYPEOFSUPPLY>Goods</GSTTYPEOFSUPPLY>
      <GSTHSNNAME>32089090</GSTHSNNAME>
     </STOCKITEM>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <STOCKITEM NAME="CP 141 Deepbrown" ACTION="Create">
      <NAME>CP 141 Deepbrown</NAME>
      <PARENT>Spray</PARENT>
      <BASEUNITS>N</BASEUNITS>
      <GSTAPPLICABLE>&#4; Applicable</GSTAPPLICABLE>
      <GSTTYPEOFSUPPLY>Goods</GSTTYPEOFSUPPLY>
      <GSTHSNNAME>32089090</GSTHSNNAME>
     </STOCKITEM>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
  const rItems = await sendToTally(itemsXml);
  console.log(`3. 5 Stock Items: Created=${rItems.created}, Altered=${rItems.altered}, Errors=${rItems.errors}`);

  console.log('\n🎉 Targeted masters push complete!');
}

run().catch(console.error);
