const http = require('http');

function queryTally(payload) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 9000,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 30000
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  const payload = `<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>StockItemCollection</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVCURRENTCOMPANY>New Web Testing</SVCURRENTCOMPANY>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
   </STATICVARIABLES>
   <TDL>
    <TDLMESSAGE>
     <COLLECTION NAME="StockItemCollection" ISMODIFY="No">
      <TYPE>StockItem</TYPE>
      <FETCH>Name,Parent,Guid,AlterId,BaseUnits,GstHsnName,HsnCode,OpeningRate,OpeningValue,ClosingRate,ClosingValue,OpeningBalance,ClosingBalance,IsItemSizeDetailsMandatory,StkItemSizesBillingType,HSNDETAILS.*,GSTDETAILS.*,GSTITEMDETAILS.*</FETCH>
     </COLLECTION>
    </TDLMESSAGE>
   </TDL>
  </DESC>
 </BODY>
</ENVELOPE>`;

  console.log('Sending live Collection request to Tally Port 9000...');
  const buf = await queryTally(payload);
  console.log(`Received ${buf.length} bytes from Tally Port 9000!`);
  const xml = buf.toString('utf8');

  // Check 3m black back vinyl in the response
  const match = xml.match(/<STOCKITEM\b[\s\S]*?NAME="3m black back vinyl \( Plain \)"[\s\S]*?<\/STOCKITEM>/i) 
             || xml.match(/<STOCKITEM\b[\s\S]*?<\/STOCKITEM>/i);
  if (match) {
    console.log('\n--- Sample Stock Item from Live TDL Collection ---');
    console.log(match[0].substring(0, 1500));
  }
}

run().catch(console.error);
