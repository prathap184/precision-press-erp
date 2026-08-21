const axios = require('axios');

async function createCompany() {
  const xml = `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES>
     <SVCURRENTCOMPANY>Hindustan Enterprises 25-26</SVCURRENTCOMPANY>
    </STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <COMPANY NAME="Hindustan Enterprises 25-26" ACTION="Create">
      <NAME>Hindustan Enterprises 25-26</NAME>
      <MAILINGNAME>Hindustan Enterprises</MAILINGNAME>
      <STATENAME>Karnataka</STATENAME>
      <PINCODE>570001</PINCODE>
      <COUNTRYNAME>India</COUNTRYNAME>
      <STARTINGFROM>20260401</STARTINGFROM>
      <BOOKSFROM>20260401</BOOKSFROM>
      <CURRENCYNAME>INR</CURRENCYNAME>
     </COMPANY>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;

  try {
    const res = await axios.post('http://localhost:9000', xml, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      timeout: 10000
    });
    console.log('Response from Tally:\n', res.data);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

createCompany();
