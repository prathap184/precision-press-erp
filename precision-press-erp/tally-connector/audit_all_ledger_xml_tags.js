const fs = require('fs');
const path = require('path');

const xmlPath = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');
const xml = fs.readFileSync(xmlPath, 'utf8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
let m;

const tagCounts = new Map();
const sampleTagValues = new Map();

while ((m = ledgerRegex.exec(xml)) !== null) {
  const body = m[2];
  const tagRegex = /<([A-Z0-9_.$]+)(?:\s+[^>]*)?>([^<]*)<\/\1>/gi;
  let tm;
  while ((tm = tagRegex.exec(body)) !== null) {
    const tag = tm[1];
    const val = tm[2].trim();
    if (val && val !== 'No' && val !== '0' && val !== 'Primary') {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      if (!sampleTagValues.has(tag) || sampleTagValues.get(tag).length < 3) {
        const arr = sampleTagValues.get(tag) || [];
        if (!arr.includes(val)) arr.push(val);
        sampleTagValues.set(tag, arr);
      }
    }
  }
}

console.log('═══════════════════════════════════════════════════════════════════════════════════');
console.log('🔍 FULL XML TAG AUDIT ACROSS ALL 1,532 TALLY LEDGERS');
console.log('═══════════════════════════════════════════════════════════════════════════════════');
console.log(`Total Unique Meaningful XML Tags Found: ${tagCounts.size}\n`);

// Sort by frequency
const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);

sortedTags.forEach(([tag, count]) => {
  const samples = sampleTagValues.get(tag)?.slice(0, 2).join(' | ');
  console.log(`• <${tag}> (${count} ledgers) ➔ Sample: "${samples}"`);
});
