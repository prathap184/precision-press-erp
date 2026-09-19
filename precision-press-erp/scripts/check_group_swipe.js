const fs = require('fs');
const xml = fs.readFileSync('C:\\tally\\Master.xml', 'utf16le');
const groupRegex = /<GROUP\s+NAME="([^"]*)"[^>]*>([\s\S]*?)<\/GROUP>/gi;
let m;
while ((m = groupRegex.exec(xml)) !== null) {
  const name = m[1];
  const pMatch = m[2].match(/<PARENT>([^<]*)<\/PARENT>/i);
  const parent = pMatch ? pMatch[1].trim() : '';
  if (parent.toLowerCase().includes('bank') || name.toLowerCase().includes('swipe') || name.toLowerCase().includes('sbi')) {
    console.log('Group match:', name, '| Parent:', parent);
  }
}
