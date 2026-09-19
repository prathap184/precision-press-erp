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

const negatives = [];
const nonZeroValZeroRate = [];

while ((m = itemRegex.exec(xml)) !== null) {
  const name = clean(m[1]);
  const body = m[2];

  const obM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
  const ovM = body.match(/<OPENINGVALUE>([^<]*)<\/OPENINGVALUE>/i);
  const orM = body.match(/<OPENINGRATE>([^<]*)<\/OPENINGRATE>/i);

  const rawOb = obM ? clean(obM[1]) : '';
  const rawOv = ovM ? clean(ovM[1]) : '';
  const rawOr = orM ? clean(orM[1]) : '';

  if (rawOb.includes('-')) {
    negatives.push({ name, rawOb, rawOv, rawOr });
  }
}

console.log('Items with negative opening balance in Tally:', negatives.length);
console.table(negatives);
