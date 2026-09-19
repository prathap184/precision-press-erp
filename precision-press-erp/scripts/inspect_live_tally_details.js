const http = require('http');

function queryTally(xml) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 9000,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(xml)
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(xml);
    req.end();
  });
}

async function run() {
  const reqXml = `
<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Export Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <EXPORTDATA>
   <REQUESTDESC>
    <STATICVARIABLES>
     <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    </STATICVARIABLES>
    <TDL>
     <TDLMESSAGE>
      <REPORT NAME="CompanyInfo">
       <FORMS>CompanyInfoForm</FORMS>
      </REPORT>
      <FORM NAME="CompanyInfoForm">
       <PARTS>CompanyInfoPart</PARTS>
      </FORM>
      <PART NAME="CompanyInfoPart">
       <LINES>CompanyInfoLine</LINES>
      </PART>
      <LINE NAME="CompanyInfoLine">
       <FIELDS>CurrentCompField, CompGuidField, FromDateField, ToDateField</FIELDS>
      </LINE>
      <FIELD NAME="CurrentCompField">
       <SET>$$CurrentCompany</SET>
      </FIELD>
      <FIELD NAME="CompGuidField">
       <SET>##SVCurrentCompany</SET>
      </FIELD>
      <FIELD NAME="FromDateField">
       <SET>$$String:##SVFromDate</SET>
      </FIELD>
      <FIELD NAME="ToDateField">
       <SET>$$String:##SVToDate</SET>
      </FIELD>
     </TDLMESSAGE>
    </TDL>
   </REQUESTDESC>
  </EXPORTDATA>
 </BODY>
</ENVELOPE>`;

  const resp = await queryTally(reqXml);
  console.log('--- Current Company Info from Port 9000 ---');
  console.log(resp);
}

run().catch(console.error);
