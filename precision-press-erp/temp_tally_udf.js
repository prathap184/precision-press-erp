const http = require('http');

const requestXml = \<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>StockItemUdfReport</ID></HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES><SVCURRENTCOMPANY>Website Testing Hindustan</SVCURRENTCOMPANY></STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME=" StockItemUdfReport\><FORMS>StockItemUdfForm</FORMS></REPORT>
 <FORM NAME=\StockItemUdfForm\><PARTS>StockItemUdfPart</PARTS></FORM>
 <PART NAME=\StockItemUdfPart\><LINES>StockItemUdfLine</LINES><REPEAT>StockItemUdfLine : CollItems</REPEAT><SCROLLED>Vertical</SCROLLED></PART>
 <LINE NAME=\StockItemUdfLine\>
 <FIELDS>FldName, FldMode, FldMult</FIELDS>
 </LINE>
 <FIELD NAME=\FldName\><SET>\</SET></FIELD>
 <FIELD NAME=\FldMode\><SET>\</SET></FIELD>
 <FIELD NAME=\FldMult\><SET>\</SET></FIELD>
 <COLLECTION NAME=\CollItems\>
 <TYPE>StockItem</TYPE>
 </COLLECTION>
 </TDLMESSAGE>
 </TDL>
 </DESC>
 </BODY>
</ENVELOPE>\;

const req = http.request({
 hostname: '127.0.0.1', port: 9000, method: 'POST',
 headers: { 'Content-Type': 'text/xml', 'Content-Length': Buffer.byteLength(requestXml) }
}, res => {
 let body = '';
 res.on('data', d => body += d);
 res.on('end', () => console.log('Response sample:', body.slice(0, 1500)));
});
req.on('error', e => console.error(e.message));
req.write(requestXml);
req.end();
