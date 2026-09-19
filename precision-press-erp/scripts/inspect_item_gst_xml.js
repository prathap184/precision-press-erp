const fs = require('fs');

function readXmlFile(p) {
  const b = fs.readFileSync(p);
  if (b[0] === 0xFF && b[1] === 0xFE) return b.toString('utf16le');
  return b.toString('utf8');
}

const xml = readXmlFile('C:\\Users\\jprat\\Videos\\items.xml');
const itemRegex = /<STOCKITEM\s+NAME="GST"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
const m = itemRegex.exec(xml);
if (m) {
  console.log('--- GST Item XML ---');
  console.log(m[0]);
}
