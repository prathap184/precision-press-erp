const fs = require('fs');
const path = require('path');
const xml = fs.readFileSync(path.resolve(__dirname, '../tally_sync/all ledgers/stockitems.xml'), 'utf8');

const regex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
let m;
const uomCounts = {};
const categoryUoms = {};

while ((m = regex.exec(xml)) !== null) {
  const body = m[2];
  const uom = (body.match(/<BASEUNITS>([^<]*)<\/BASEUNITS>/i) || [])[1] || 'Unknown';
  const parent = (body.match(/<PARENT>([^<]*)<\/PARENT>/i) || [])[1] || 'Uncategorized';
  
  uomCounts[uom] = (uomCounts[uom] || 0) + 1;
  
  if (!categoryUoms[uom]) categoryUoms[uom] = [];
  if (categoryUoms[uom].length < 3) {
    categoryUoms[uom].push(`${m[1]} (${parent})`);
  }
}

console.log('=== BREAKDOWN OF STOCK ITEMS BY UNIT OF MEASURE (DIRECT VS NON-DIRECT) ===');
console.log(JSON.stringify(uomCounts, null, 2));
console.log('\nSample items per unit:');
console.log(JSON.stringify(categoryUoms, null, 2));
