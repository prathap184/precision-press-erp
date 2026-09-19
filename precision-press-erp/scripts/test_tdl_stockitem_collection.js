const http = require('http');

function fetchLiveTally(xmlPayload) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 9000,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(xmlPayload)
      },
      timeout: 30000
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', reject);
    req.write(xmlPayload);
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
    <REPORTNAME>Stock Item Collection</REPORTNAME>
    <STATICVARIABLES>
     <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
     <SVCURRENTCOMPANY>New Web Testing</SVCURRENTCOMPANY>
    </STATICVARIABLES>
    <TDL>
     <TDLMESSAGE>
      <REPORT NAME="Stock Item Collection">
       <FORMS>StockItemForm</FORMS>
      </REPORT>
      <FORM NAME="StockItemForm">
       <PARTS>StockItemPart</PARTS>
      </FORM>
      <PART NAME="StockItemPart">
       <LINES>StockItemLine</LINES>
       <REPEAT>StockItemLine : StockItemsCollection</REPEAT>
       <SCROLLED>Vertical</SCROLLED>
      </PART>
      <LINE NAME="StockItemLine">
       <FIELDS>FldName, FldGuid, FldParent, FldUom, FldOpenBal, FldOpenRate, FldOpenVal, FldAlterId</FIELDS>
      </LINE>
      <FIELD NAME="FldName"><SET>$Name</SET></FIELD>
      <FIELD NAME="FldGuid"><SET>$Guid</SET></FIELD>
      <FIELD NAME="FldParent"><SET>$Parent</SET></FIELD>
      <FIELD NAME="FldUom"><SET>$BaseUnits</SET></FIELD>
      <FIELD NAME="FldOpenBal"><SET>$OpeningBalance</SET></FIELD>
      <FIELD NAME="FldOpenRate"><SET>$OpeningRate</SET></FIELD>
      <FIELD NAME="FldOpenVal"><SET>$OpeningValue</SET></FIELD>
      <FIELD NAME="FldAlterId"><SET>$AlterId</SET></FIELD>
      <COLLECTION NAME="StockItemsCollection">
       <TYPE>StockItem</TYPE>
       <FETCH>Name, Guid, Parent, BaseUnits, OpeningBalance, OpeningRate, OpeningValue, AlterId</FETCH>
      </COLLECTION>
     </TDLMESSAGE>
    </TDL>
   </REQUESTDESC>
  </EXPORTDATA>
 </BODY>
</ENVELOPE>`;

  const buf = await fetchLiveTally(reqXml);
  console.log(`Received ${buf.length} bytes from TDL request.`);
  const xmlStr = buf.toString('utf8');
  console.log(xmlStr.substring(0, 1500));
}

run().catch(console.error);
