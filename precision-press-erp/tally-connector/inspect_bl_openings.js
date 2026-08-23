const fs = require('fs');
const path = require('path');

const ITEMS_XML_PATH = path.resolve(__dirname, '../tally_sync/all ledgers/stockitems.xml');
const xml = fs.readFileSync(ITEMS_XML_PATH, 'utf8');

const regex = /<STOCKITEM NAME="[^"]*BL Delux[^"]*"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
let m;
while ((m = regex.exec(xml)) !== null) {
  const body = m[1];
  const balM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
  const rateM = body.match(/<OPENINGRATE>([^<]*)<\/OPENINGRATE>/i);
  const valM = body.match(/<OPENINGVALUE>([^<]*)<\/OPENINGVALUE>/i);
  const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
  const unitsM = body.match(/<BASEUNITS>([^<]*)<\/BASEUNITS>/i);
  console.log({
    parent: parentM ? parentM[1] : null,
    units: unitsM ? unitsM[1] : null,
    openingBal: balM ? balM[1] : null,
    openingRate: rateM ? rateM[1] : null,
    openingVal: valM ? valM[1] : null
  });
}
