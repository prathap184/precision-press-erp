const fs = require('fs');

function readXml(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.toString('utf16le');
  }
  return buf.toString('utf8');
}

console.log('Reading items.xml...');
const xml = readXml('C:\\Users\\jprat\\Videos\\items.xml');
console.log('Total characters:', xml.length);

const stockItemMatches = xml.match(/<STOCKITEM\b[^>]*>/gi);
console.log('Total <STOCKITEM> tags found:', stockItemMatches ? stockItemMatches.length : 0);

// Inspect first 2 items
const firstItemStart = xml.indexOf('<STOCKITEM');
const firstItemEnd = xml.indexOf('</STOCKITEM>', firstItemStart);
console.log('\n--- First Stock Item XML snippet ---');
console.log(xml.substring(firstItemStart, firstItemEnd + 12));

const secondItemStart = xml.indexOf('<STOCKITEM', firstItemEnd);
const secondItemEnd = xml.indexOf('</STOCKITEM>', secondItemStart);
console.log('\n--- Second Stock Item XML snippet ---');
console.log(xml.substring(secondItemStart, secondItemEnd + 12));
