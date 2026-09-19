const fs = require('fs');

function readXml(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.toString('utf16le');
  }
  return buf.toString('utf8');
}

const xml = readXml('C:\\Users\\jprat\\Videos\\units.xml');
const unitMatches = [...xml.matchAll(/<UNIT\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/UNIT>/gi)];

console.log('Total Units in units.xml:', unitMatches.length);
const units = unitMatches.map(m => {
  const name = m[1];
  const body = m[2];
  const originalNameM = body.match(/<ORIGINALNAME>([^<]*)<\/ORIGINALNAME>/i);
  const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
  const decimalM = body.match(/<DECIMALPLACES>\s*(\d+)\s*<\/DECIMALPLACES>/i);
  return {
    name,
    originalName: originalNameM ? originalNameM[1] : '',
    guid: guidM ? guidM[1] : '',
    decimals: decimalM ? parseInt(decimalM[1], 10) : 0
  };
});
console.table(units);
