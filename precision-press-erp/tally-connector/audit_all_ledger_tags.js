const fs = require('fs');
const path = require('path');

const xml = fs.readFileSync(path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml'), 'utf8');
const regex = /<LEDGER NAME="([^"]+)"[^>]*>([\s\S]*?)<\/LEDGER>/g;

const allTags = new Set();
let match;
while ((match = regex.exec(xml)) !== null) {
  const body = match[2];
  const tagRegex = /<([A-Z0-9_\.]+)(?:\s+[^>]*)?>/g;
  let tagMatch;
  while ((tagMatch = tagRegex.exec(body)) !== null) {
    const tagName = tagMatch[1];
    if (!tagName.startsWith('/') && !tagName.endsWith('.LIST')) {
      allTags.add(tagName);
    }
  }
}

console.log('All Unique Tally Ledger XML Tags Found:');
console.log(Array.from(allTags).sort());
