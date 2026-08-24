const fs = require('fs');
const path = require('path');

const ITEMS_XML_PATH = path.resolve(__dirname, '../tally_sync/all ledgers/stockitems.xml');
const xml = fs.readFileSync(ITEMS_XML_PATH, 'utf8');

const regex = /<STOCKITEM NAME="[^"]*94059900[^"]*"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
let m;
while ((m = regex.exec(xml)) !== null) {
  console.log(m[0]);
}
