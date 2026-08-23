const fs = require('fs');
const path = require('path');
const xml = fs.readFileSync(path.resolve(__dirname, '../tally_sync/all ledgers/stockitems.xml'), 'utf8');

function printItemXml(name) {
  const re = new RegExp('<STOCKITEM\\s+NAME="' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>([\\s\\S]*?)<\\/STOCKITEM>', 'i');
  const m = xml.match(re);
  if (m) {
    console.log(`\n================== RAW TALLY XML FOR: "${name}" ==================`);
    console.log(m[0].slice(0, 900));
  }
}

printItemXml('CP 48 Haier Grey');
printItemXml('CP 22 Medium Grey');
