const fs = require('fs');

function readXml(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.toString('utf16le');
  }
  return buf.toString('utf8');
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

const xml = readXml('C:\\Users\\jprat\\Videos\\items.xml');
const itemRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
let m;

let negValCount = 0;
let posValCount = 0;
let zeroValCount = 0;
let sumNeg = 0;
let sumPos = 0;

while ((m = itemRegex.exec(xml)) !== null) {
  const name = clean(m[1]);
  const body = m[2];
  const ovM = body.match(/<OPENINGVALUE>([^<]*)<\/OPENINGVALUE>/i);
  const rawOv = ovM ? parseFloat(ovM[1].trim()) || 0 : 0;

  if (rawOv < 0) {
    negValCount++;
    sumNeg += rawOv;
  } else if (rawOv > 0) {
    posValCount++;
    sumPos += rawOv;
  } else {
    zeroValCount++;
  }
}

console.log('--- Opening Value Distribution in Tally XML ---');
console.log(`Negative Values (Dr / Asset Stock): ${negValCount} items, Total: ?${Math.abs(sumNeg).toLocaleString('en-IN')}`);
console.log(`Positive Values (Cr / Negative Stock): ${posValCount} items, Total: ?${sumPos.toLocaleString('en-IN')}`);
console.log(`Zero Values: ${zeroValCount} items`);
console.log(`Net Inventory Balance: ?${(sumNeg + sumPos).toLocaleString('en-IN')}`);
