const fs = require('fs');
const path = require('path');
const xml = fs.readFileSync(path.resolve(__dirname, '../tally_sync/all ledgers/stockitems.xml'), 'utf8');

const regex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
let m;
const tagsSet = new Set();
const sampleItems = [];

while ((m = regex.exec(xml)) !== null) {
  const name = m[1];
  const body = m[2];
  const tags = body.match(/<([A-Z0-9_.]+)[^>]*>/gi) || [];
  tags.forEach(t => tagsSet.add(t.replace(/[<>\/]/g, '').split(' ')[0]));
  
  if (sampleItems.length < 8) {
    const parent = (body.match(/<PARENT>([^<]*)<\/PARENT>/i) || [])[1] || '';
    const guid = (body.match(/<GUID>([^<]*)<\/GUID>/i) || [])[1] || '';
    const alterId = (body.match(/<ALTERID>([^<]*)<\/ALTERID>/i) || [])[1] || '';
    const uom = (body.match(/<BASEUNITS>([^<]*)<\/BASEUNITS>/i) || [])[1] || '';
    const hsn = (body.match(/<HSNCODE>([^<]*)<\/HSNCODE>/i) || [])[1] || '';
    const rate = (body.match(/<GSTRATE>([^<]*)<\/GSTRATE>/i) || [])[1] || '';
    const openBal = (body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i) || [])[1] || '0';
    const openVal = (body.match(/<OPENINGVALUE>([^<]*)<\/OPENINGVALUE>/i) || [])[1] || '0';
    const openRate = (body.match(/<OPENINGRATE>([^<]*)<\/OPENINGRATE>/i) || [])[1] || '0';
    sampleItems.push({ name, parent, guid, alterId, uom, hsn, rate, openBal, openRate, openVal });
  }
}

console.log('Total Unique Stock Item XML Tags Found:', tagsSet.size);
console.log('Sample Items from Tally:');
console.log(JSON.stringify(sampleItems, null, 2));
