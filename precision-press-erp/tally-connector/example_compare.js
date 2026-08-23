const fs = require('fs');
const path = require('path');
const xml = fs.readFileSync(path.resolve(__dirname, '../tally_sync/all ledgers/stockitems.xml'), 'utf8');

function getDetails(name) {
  const re = new RegExp('<STOCKITEM\\s+NAME="' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>([\\s\\S]*?)<\\/STOCKITEM>', 'i');
  const m = xml.match(re);
  if (m) {
    const body = m[1];
    const extract = (t) => (body.match(new RegExp(`<${t}[^>]*>([^<]*)<\\/${t}>`, 'i')) || [])[1] || '';
    console.log(`\n=== TALLY DETAILS: ${name} ===`);
    console.log('Group:   ', extract('PARENT'));
    console.log('UOM:     ', extract('BASEUNITS'));
    console.log('HSN:     ', extract('HSNCODE'));
    console.log('Balance: ', extract('OPENINGBALANCE'));
    console.log('Rate:    ', extract('OPENINGRATE'));
    console.log('Value:   ', extract('OPENINGVALUE'));
  }
}

getDetails('CP 22 Medium Grey');
getDetails('03 Acrylic Sheet 3mm ~2.5mm- A3');
