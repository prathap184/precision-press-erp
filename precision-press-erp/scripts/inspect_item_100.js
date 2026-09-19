const fs = require('fs');

function readXmlFile(p) {
  const b = fs.readFileSync(p);
  if (b[0] === 0xFF && b[1] === 0xFE) return b.toString('utf16le');
  return b.toString('utf8');
}

const xml = readXmlFile('C:\\Users\\jprat\\Videos\\items.xml');
const itemRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
let m;
let idx = 0;

while ((m = itemRegex.exec(xml)) !== null) {
  if (idx === 100) {
    console.log('Item index 100:', m[1]);
    console.log('OPENINGBALANCE:', m[2].match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i)?.[1]);
    console.log('OPENINGRATE   :', m[2].match(/<OPENINGRATE>([^<]*)<\/OPENINGRATE>/i)?.[1]);
    console.log('OPENINGVALUE  :', m[2].match(/<OPENINGVALUE>([^<]*)<\/OPENINGVALUE>/i)?.[1]);
    break;
  }
  idx++;
}
