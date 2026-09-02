const axios = require('axios');
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
  console.log(`🚀 Pushing Additional Categories, Groups & COA to Tally: ${COMPANY_NAME}`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // 1. STOCK CATEGORIES
  const stockCategoriesXml = `<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY></STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKCATEGORY NAME="Acrylic" ACTION="Create"><NAME>Acrylic</NAME><PARENT/></STOCKCATEGORY></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKCATEGORY NAME="ACP" ACTION="Create"><NAME>ACP</NAME><PARENT/></STOCKCATEGORY></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKCATEGORY NAME="Flex &amp; Banner" ACTION="Create"><NAME>Flex &amp; Banner</NAME><PARENT/></STOCKCATEGORY></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKCATEGORY NAME="Vinyl &amp; Lamination" ACTION="Create"><NAME>Vinyl &amp; Lamination</NAME><PARENT/></STOCKCATEGORY></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKCATEGORY NAME="Spray &amp; Paints" ACTION="Create"><NAME>Spray &amp; Paints</NAME><PARENT/></STOCKCATEGORY></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKCATEGORY NAME="Foam Board &amp; Sunpack" ACTION="Create"><NAME>Foam Board &amp; Sunpack</NAME><PARENT/></STOCKCATEGORY></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKCATEGORY NAME="LED &amp; Power Supplies" ACTION="Create"><NAME>LED &amp; Power Supplies</NAME><PARENT/></STOCKCATEGORY></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKCATEGORY NAME="Polycarbonate &amp; Multiwall" ACTION="Create"><NAME>Polycarbonate &amp; Multiwall</NAME><PARENT/></STOCKCATEGORY></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKCATEGORY NAME="Adhesives &amp; Sealants" ACTION="Create"><NAME>Adhesives &amp; Sealants</NAME><PARENT/></STOCKCATEGORY></TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
  const rCats = await sendToTally(stockCategoriesXml);
  console.log(`1. Stock Categories: Created=${rCats.created}, Altered=${rCats.altered}, Errors=${rCats.errors}`);

  // 2. ADDITIONAL STOCK GROUPS
  const stockGroupsXml = `<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY></STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKGROUP NAME="ACP Sheets" ACTION="Create"><NAME>ACP Sheets</NAME><PARENT/><ISADDABLE>Yes</ISADDABLE></STOCKGROUP></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKGROUP NAME="Flex Material" ACTION="Create"><NAME>Flex Material</NAME><PARENT/><ISADDABLE>Yes</ISADDABLE></STOCKGROUP></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKGROUP NAME="Vinyl Rolls" ACTION="Create"><NAME>Vinyl Rolls</NAME><PARENT/><ISADDABLE>Yes</ISADDABLE></STOCKGROUP></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKGROUP NAME="Hardware &amp; Accessories" ACTION="Create"><NAME>Hardware &amp; Accessories</NAME><PARENT/><ISADDABLE>Yes</ISADDABLE></STOCKGROUP></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKGROUP NAME="Print Media" ACTION="Create"><NAME>Print Media</NAME><PARENT/><ISADDABLE>Yes</ISADDABLE></STOCKGROUP></TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
  const rSg = await sendToTally(stockGroupsXml);
  console.log(`2. Additional Stock Groups: Created=${rSg.created}, Altered=${rSg.altered}, Errors=${rSg.errors}`);

  // 3. ACCOUNT OPERATIONAL SUB-GROUPS
  const accountGroupsXml = `<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY></STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    <!-- Debtors Divisional Sub-Groups -->
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><GROUP NAME="Debtors HO" ACTION="Create"><NAME>Debtors HO</NAME><PARENT>Sundry Debtors</PARENT><ISADDABLE>Yes</ISADDABLE></GROUP></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><GROUP NAME="Debtors Warehouse BO" ACTION="Create"><NAME>Debtors Warehouse BO</NAME><PARENT>Sundry Debtors</PARENT><ISADDABLE>Yes</ISADDABLE></GROUP></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><GROUP NAME="Debtors Print PO" ACTION="Create"><NAME>Debtors Print PO</NAME><PARENT>Sundry Debtors</PARENT><ISADDABLE>Yes</ISADDABLE></GROUP></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><GROUP NAME="Debtors Fiber Laser SO" ACTION="Create"><NAME>Debtors Fiber Laser SO</NAME><PARENT>Sundry Debtors</PARENT><ISADDABLE>Yes</ISADDABLE></GROUP></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><GROUP NAME="Debtors Glass GO" ACTION="Create"><NAME>Debtors Glass GO</NAME><PARENT>Sundry Debtors</PARENT><ISADDABLE>Yes</ISADDABLE></GROUP></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><GROUP NAME="Debtors Aspire" ACTION="Create"><NAME>Debtors Aspire</NAME><PARENT>Sundry Debtors</PARENT><ISADDABLE>Yes</ISADDABLE></GROUP></TALLYMESSAGE>
    
    <!-- Expense Sub-Groups -->
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><GROUP NAME="Electricity Charges" ACTION="Create"><NAME>Electricity Charges</NAME><PARENT>Indirect Expenses</PARENT><ISADDABLE>Yes</ISADDABLE></GROUP></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><GROUP NAME="Bank Charges" ACTION="Create"><NAME>Bank Charges</NAME><PARENT>Indirect Expenses</PARENT><ISADDABLE>Yes</ISADDABLE></GROUP></TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
  const rAg = await sendToTally(accountGroupsXml);
  console.log(`3. Account Groups & Debtors Divisions: Created=${rAg.created}, Altered=${rAg.altered}, Errors=${rAg.errors}`);

  // 4. BANK & CASH & EXPENSE/INCOME LEDGERS
  const ledgersXml = `<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY></STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    <!-- Federal Bank (From your Banking Screen) -->
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Federal 2091" ACTION="Create">
      <NAME>Federal 2091</NAME>
      <PARENT>Bank Accounts</PARENT>
      <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
     </LEDGER>
    </TALLYMESSAGE>

    <!-- Cash B2 Drawer -->
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Cash B2" ACTION="Create">
      <NAME>Cash B2</NAME>
      <PARENT>Cash-in-hand</PARENT>
      <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
     </LEDGER>
    </TALLYMESSAGE>

    <!-- Main Cash Drawer -->
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Cash" ACTION="Create">
      <NAME>Cash</NAME>
      <PARENT>Cash-in-hand</PARENT>
      <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
     </LEDGER>
    </TALLYMESSAGE>

    <!-- Operational Incomes -->
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Cutting Charge 9997@18%" ACTION="Create">
      <NAME>Cutting Charge 9997@18%</NAME>
      <PARENT>Indirect Incomes</PARENT>
      <ISREVENUE>Yes</ISREVENUE>
      <AFFECTSGROSSPROFIT>No</AFFECTSGROSSPROFIT>
      <GSTAPPLICABLE>&#4; Applicable</GSTAPPLICABLE>
     </LEDGER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Discount Received" ACTION="Create">
      <NAME>Discount Received</NAME>
      <PARENT>Indirect Incomes</PARENT>
      <ISREVENUE>Yes</ISREVENUE>
     </LEDGER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Credit Interest" ACTION="Create">
      <NAME>Credit Interest</NAME>
      <PARENT>Indirect Incomes</PARENT>
      <ISREVENUE>Yes</ISREVENUE>
     </LEDGER>
    </TALLYMESSAGE>

    <!-- Operational Expenses -->
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Computer Maintenance" ACTION="Create">
      <NAME>Computer Maintenance</NAME>
      <PARENT>Indirect Expenses</PARENT>
      <ISREVENUE>Yes</ISREVENUE>
     </LEDGER>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
  const rLedgers = await sendToTally(ledgersXml);
  console.log(`4. Bank (Federal 2091), Cash B2, Incomes & Expenses: Created=${rLedgers.created}, Altered=${rLedgers.altered}, Errors=${rLedgers.errors}`);

  console.log('\n🎉 Additional masters push complete!');
}

run().catch(console.error);
