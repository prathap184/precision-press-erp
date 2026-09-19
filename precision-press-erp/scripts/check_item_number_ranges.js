const fs = require('fs');

function readXmlFile(p) {
  const b = fs.readFileSync(p);
  if (b[0] === 0xFF && b[1] === 0xFE) return b.toString('utf16le');
  return b.toString('utf8');
}

function clean(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#4;/g, '')
    .trim();
}

const xml = readXmlFile('C:\\Users\\jprat\\Videos\\items.xml');
const itemRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
let m;

let maxQty = -Infinity, minQty = Infinity;
let maxRate = -Infinity, minRate = Infinity;
let maxVal = -Infinity, minVal = Infinity;
let maxPaiseVal = -Infinity;
let maxQtyItem = '', maxRateItem = '', maxValItem = '';

while ((m = itemRegex.exec(xml)) !== null) {
  const name = clean(m[1]);
  const body = m[2];

  const obM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
  const orM = body.match(/<OPENINGRATE>([^<]*)<\/OPENINGRATE>/i);
  const ovM = body.match(/<OPENINGVALUE>([^<]*)<\/OPENINGVALUE>/i);

  const qty = obM ? parseFloat(clean(obM[1]).replace(/[^\d.-]/g, '')) || 0 : 0;
  const rate = orM ? parseFloat(clean(orM[1]).replace(/[^\d.-]/g, '')) || 0 : 0;
  const val = ovM ? Math.abs(parseFloat(clean(ovM[1]).replace(/[^\d.-]/g, '')) || 0) : 0;
  const paiseVal = Math.round(val * 100);

  if (qty > maxQty) { maxQty = qty; maxQtyItem = name; }
  if (qty < minQty) { minQty = qty; }
  if (rate > maxRate) { maxRate = rate; maxRateItem = name; }
  if (rate < minRate) { minRate = rate; }
  if (val > maxVal) { maxVal = val; maxValItem = name; }
  if (val < minVal) { minVal = val; }
  if (paiseVal > maxPaiseVal) { maxPaiseVal = paiseVal; }
}

console.log('--- Range of Numeric Values Across All 335 Items ---');
console.log(`Max Quantity : ${maxQty} (${maxQtyItem})`);
console.log(`Min Quantity : ${minQty}`);
console.log(`Max Rate     : ?${maxRate} (${maxRateItem})`);
console.log(`Min Rate     : ?${minRate}`);
console.log(`Max Value    : ?${maxVal.toLocaleString('en-IN')} (${maxValItem})`);
console.log(`Max Value in Paise: ${maxPaiseVal} (Integer limit: 2,147,483,647)`);
console.log(`Exceeds 32-bit Integer: ${maxPaiseVal > 2147483647 ? 'YES ?? (Requires BIGINT)' : 'NO'}`);
