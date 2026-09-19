const fs = require('fs');

function readXmlFile(p) {
  const b = fs.readFileSync(p);
  if (b[0] === 0xFF && b[1] === 0xFE) return b.toString('utf16le');
  return b.toString('utf8');
}

const fileXml = readXmlFile('C:\\Users\\jprat\\Videos\\items.xml');
console.log('--- items.xml first 800 characters ---');
console.log(fileXml.substring(0, 800));
