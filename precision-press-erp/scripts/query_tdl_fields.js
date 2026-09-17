const http = require('http');
const fs = require('fs');

const requestXml = `
<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>FullStockItem</ID></HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVCURRENTCOMPANY>Website Testing Hindustan</SVCURRENTCOMPANY>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="FullStockItem">
            <FORMS>FullStockItemForm</FORMS>
          </REPORT>
          <FORM NAME="FullStockItemForm">
            <PARTS>FullStockItemPart</PARTS>
          </FORM>
          <PART NAME="FullStockItemPart">
            <LINES>FullStockItemLine</LINES>
            <REPEAT>FullStockItemLine : StkColl</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </PART>
          <LINE NAME="FullStockItemLine">
            <FIELDS>FldItemName, FldParent, FldUom, FldBillingType, FldSqftGroup, FldMandatory, FldPredefined</FIELDS>
          </LINE>
          <FIELD NAME="FldItemName"><SET>$Name</SET></FIELD>
          <FIELD NAME="FldParent"><SET>$Parent</SET></FIELD>
          <FIELD NAME="FldUom"><SET>$BaseUnits</SET></FIELD>
          <FIELD NAME="FldBillingType"><SET>$$String:$STKITEMSIZESBILLINGTYPE</SET></FIELD>
          <FIELD NAME="FldSqftGroup"><SET>$$String:$STKITEMSQFTQTYLINKEDGROUP</SET></FIELD>
          <FIELD NAME="FldMandatory"><SET>$$String:$ISITEMSIZEDETAILSMANDATORY</SET></FIELD>
          <FIELD NAME="FldPredefined"><SET>$$String:$ISITEMPREDEFINEDSIZEDETAILSSKIPPED</SET></FIELD>
          <COLLECTION NAME="StkColl">
            <TYPE>StockItem</TYPE>
            <FILTER>FilterItems</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="FilterItems">
            $Name = "900 SPR - FL Royal" or $Name = "3750 Sunpack 3mm White- 325"
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
`;

const req = http.request({
  hostname: '127.0.0.1',
  port: 9000,
  method: 'POST',
  headers: {
    'Content-Type': 'text/xml',
    'Content-Length': Buffer.byteLength(requestXml)
  }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log('Result:\n', body);
  });
});
req.on('error', e => console.error(e.message));
req.write(requestXml);
req.end();
