const fs = require('fs');

function readXml(filePath) {
  const buf = fs.readFileSync(filePath);
  // Check encoding (UTF-16LE vs UTF-8)
  if (buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.toString('utf16le');
  }
  return buf.toString('utf8');
}

try {
  console.log('--- units.xml sample ---');
  const unitsContent = readXml('C:\\Users\\jprat\\Videos\\units.xml');
  console.log(unitsContent.substring(0, 1500));

  console.log('\n--- gosdswin.xml sample ---');
  const godownsContent = readXml('C:\\Users\\jprat\\Videos\\gosdswin.xml');
  console.log(godownsContent.substring(0, 1500));
} catch (e) {
  console.error(e);
}
