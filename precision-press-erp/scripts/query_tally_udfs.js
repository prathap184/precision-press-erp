const http = require('http');
const fs = require('fs');

const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>CustomStockItems</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVCURRENTCOMPANY>Website Testing Hindustan</SVCURRENTCOMPANY>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="CustomStockItems" ISMODIFY="No">
            <TYPE>StockItem</TYPE>
            <FETCH>Name,Parent,BaseUnits,UDF:*</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

const req = http.request({
  hostname: '127.0.0.1',
  port: 9000,
  method: 'POST',
  headers: {
    'Content-Type': 'application/xml',
    'Content-Length': Buffer.byteLength(xml)
  }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    fs.writeFileSync('all_stock_items_udf.xml', body);
    console.log('Saved all_stock_items_udf.xml. Length:', body.length);
  });
});
req.on('error', e => console.error(e.message));
req.write(xml);
req.end();
