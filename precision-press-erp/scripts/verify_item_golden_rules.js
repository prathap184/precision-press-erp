const fs = require('fs');

function readXmlFile(p) {
  const b = fs.readFileSync(p);
  if (b[0] === 0xFF && b[1] === 0xFE) return b.toString('utf16le');
  return b.toString('utf8');
}

function clean(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#4;/g, '')
    .trim();
}

const xml = readXmlFile('C:\\Users\\jprat\\Videos\\items.xml');
const itemRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
let m;

let r1Count = 0; // hasMultipleSizes = true, defaultSize = true
let r1bCount = 0; // hasMultipleSizes = true, defaultSize = false
let r2Count = 0; // hasMultipleSizes = false, defaultSize = true
let r3Count = 0; // hasMultipleSizes = false, defaultSize = false (strictly qty/pcs)

while ((m = itemRegex.exec(xml)) !== null) {
  const body = m[2];

  const sizeMandM = body.match(/<UDF:ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]+)<\/UDF:ISITEMSIZEDETAILSMANDATORY>/i);
  const isMand = sizeMandM && clean(sizeMandM[1]).toLowerCase() === 'yes';

  const widthM = body.match(/<UDF:ITEMWIDTHUDF[^>]*>([^<]+)<\/UDF:ITEMWIDTHUDF>/i) || body.match(/<ITEMWIDTH[^>]*>([^<]+)<\/ITEMWIDTH>/i);
  const lengthM = body.match(/<UDF:ITEMLENGTHUDF[^>]*>([^<]+)<\/UDF:ITEMLENGTHUDF>/i) || body.match(/<ITEMLENGTH[^>]*>([^<]+)<\/ITEMLENGTH>/i);
  const hasDefSize = Boolean(widthM && lengthM && parseFloat(clean(widthM[1])) > 0 && parseFloat(clean(lengthM[1])) > 0);

  if (isMand && hasDefSize) r1Count++;
  else if (isMand && !hasDefSize) r1bCount++;
  else if (!isMand && hasDefSize) r2Count++;
  else r3Count++;
}

console.log('-----------------------------------------------------------------------');
console.log('        ?? 3 GOLDEN RULES COMPLIANCE AUDIT (335 ITEMS)                 ');
console.log('-----------------------------------------------------------------------');
console.log(`• Rule 1  (hasMultipleSizes=true, defaultSize=true)  : ${r1Count} items (ACTIVE, prefilled 1x1 Ft)`);
console.log(`• Rule 1B (hasMultipleSizes=true, defaultSize=false) : ${r1bCount} items (ACTIVE, custom size input)`);
console.log(`• Rule 2  (hasMultipleSizes=false, defaultSize=true) : ${r2Count} items (ACTIVE, fixed size)`);
console.log(`• Rule 3  (hasMultipleSizes=false, defaultSize=false): ${r3Count} items (INACTIVE, billed strictly by Qty/Pcs)`);
console.log(`• Total Items Verified                               : ${r1Count + r1bCount + r2Count + r3Count} / 335`);
console.log('-----------------------------------------------------------------------');
