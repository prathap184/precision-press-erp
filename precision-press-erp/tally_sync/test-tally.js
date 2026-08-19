const axios = require('axios');

async function testTally() {
  const xml = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>LedgerMaster</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="LedgerMaster">
            <FORMS>LedgerMaster</FORMS>
          </REPORT>
          <FORM NAME="LedgerMaster">
            <PARTS>LedgerMaster</PARTS>
          </FORM>
          <PART NAME="LedgerMaster">
            <LINES>LedgerMaster</LINES>
            <REPEAT>LedgerMaster : AllLedgers</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </PART>
          <LINE NAME="LedgerMaster">
            <XMLTAG>"LEDGER"</XMLTAG>
            <FIELDS>LName, LParent, LOpBal, LClBal, LGSTIN</FIELDS>
          </LINE>
          <FIELD NAME="LName">
            <SET>$Name</SET>
            <XMLTAG>"NAME"</XMLTAG>
            <XMLATTR>Yes</XMLATTR>
          </FIELD>
          <FIELD NAME="LParent">
            <SET>$Parent</SET>
            <XMLTAG>"PARENT"</XMLTAG>
          </FIELD>
          <FIELD NAME="LOpBal">
            <SET>$OpeningBalance</SET>
            <XMLTAG>"OPENINGBALANCE"</XMLTAG>
          </FIELD>
          <FIELD NAME="LClBal">
            <SET>$ClosingBalance</SET>
            <XMLTAG>"CLOSINGBALANCE"</XMLTAG>
          </FIELD>
          <FIELD NAME="LGSTIN">
            <SET>$PartyGSTIN</SET>
            <XMLTAG>"PARTYGSTIN"</XMLTAG>
          </FIELD>
          <COLLECTION NAME="AllLedgers">
            <TYPE>Ledger</TYPE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  try {
    const res = await axios.post('http://localhost:9000', xml);
    console.log("Response:", res.data.substring(0, 1000));
  } catch (e) {
    console.error("Error:", e.message);
  }
}
testTally();
