const fs = require('fs');

function readXml(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.toString('utf16le');
  }
  return buf.toString('utf8');
}

const xml = readXml('C:\\Users\\jprat\\Videos\\gosdswin.xml');
const godownMatches = [...xml.matchAll(/<GODOWN\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/GODOWN>/gi)];

console.log('Total Godowns in gosdswin.xml:', godownMatches.length);
const godowns = godownMatches.map(m => {
  const name = m[1];
  const body = m[2];
  const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
  const alterM = body.match(/<ALTERID>([^<]*)<\/ALTERID>/i);
  return {
    name,
    guid: guidM ? guidM[1] : '',
    alterId: alterM ? alterM[1].trim() : ''
  };
});
console.table(godowns);
