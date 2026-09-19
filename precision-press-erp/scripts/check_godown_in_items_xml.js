const fs = require('fs');

function readXmlFile(p) {
  const b = fs.readFileSync(p);
  if (b[0] === 0xFF && b[1] === 0xFE) return b.toString('utf16le');
  return b.toString('utf8');
}

const xml = readXmlFile('C:\\Users\\jprat\\Videos\\items.xml');

const godowns = new Set();
const godownMatches = [...xml.matchAll(/<GODOWNNAME>([^<]+)<\/GODOWNNAME>/gi)];
godownMatches.forEach(m => godowns.add(m[1].trim()));

console.log('All unique <GODOWNNAME> values in items.xml:', Array.from(godowns));
console.log('Total <GODOWNNAME> occurrences:', godownMatches.length);

// Check if "B1" appears anywhere as godown
const hasB1 = godownMatches.filter(m => m[1].trim().toLowerCase() === 'b1' || m[1].trim().toLowerCase().includes('godown b1'));
console.log('Occurrences of B1 in <GODOWNNAME>:', hasB1.length);
