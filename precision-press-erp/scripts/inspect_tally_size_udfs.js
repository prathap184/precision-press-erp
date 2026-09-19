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

let itemsWithWidth = 0;
let itemsWithLength = 0;
let itemsWithDefaultSizeName = 0;
let itemsWithSizeMandatory = 0;
let itemsWithSizeSkipped = 0;
let itemsWithBillingMode = 0;

const sampleSizes = [];

while ((m = itemRegex.exec(xml)) !== null) {
  const name = clean(m[1]);
  const body = m[2];

  const sizeMandM = body.match(/<UDF:ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]+)<\/UDF:ISITEMSIZEDETAILSMANDATORY>/i);
  const sizeSkipM = body.match(/<UDF:ISITEMPREDEFINEDSIZEDETAILSSKIPPED[^>]*>([^<]+)<\/UDF:ISITEMPREDEFINEDSIZEDETAILSSKIPPED>/i);
  const bTypeM = body.match(/<UDF:STKITEMSIZESBILLINGTYPE[^>]*>([^<]+)<\/UDF:STKITEMSIZESBILLINGTYPE>/i);

  const widthM = body.match(/<UDF:ITEMWIDTHUDF[^>]*>([^<]+)<\/UDF:ITEMWIDTHUDF>/i) || body.match(/<ITEMWIDTH[^>]*>([^<]+)<\/ITEMWIDTH>/i);
  const lengthM = body.match(/<UDF:ITEMLENGTHUDF[^>]*>([^<]+)<\/UDF:ITEMLENGTHUDF>/i) || body.match(/<ITEMLENGTH[^>]*>([^<]+)<\/ITEMLENGTH>/i);
  const sizeNameM = body.match(/<UDF:ITEMSIZENAMEUDF[^>]*>([^<]+)<\/UDF:ITEMSIZENAMEUDF>/i) || body.match(/<ITEMSIZENAME[^>]*>([^<]+)<\/ITEMSIZENAME>/i);

  const isMand = sizeMandM && clean(sizeMandM[1]).toLowerCase() === 'yes';
  const isSkip = sizeSkipM && clean(sizeSkipM[1]).toLowerCase() === 'yes';
  const bType = bTypeM ? clean(bTypeM[1]) : null;
  const width = widthM ? parseFloat(clean(widthM[1])) : null;
  const length = lengthM ? parseFloat(clean(lengthM[1])) : null;
  const sizeName = sizeNameM ? clean(sizeNameM[1]) : null;

  if (isMand) itemsWithSizeMandatory++;
  if (isSkip) itemsWithSizeSkipped++;
  if (bType) itemsWithBillingMode++;
  if (width !== null) itemsWithWidth++;
  if (length !== null) itemsWithLength++;
  if (sizeName) itemsWithDefaultSizeName++;

  if (sampleSizes.length < 15 && (isMand || width !== null || sizeName)) {
    sampleSizes.push({
      name,
      isMandatory: isMand,
      isSkipped: isSkip,
      billingType: bType,
      width,
      length,
      sizeName
    });
  }
}

console.log('--- Size Details Audit Across 335 Items ---');
console.log('Items with ISITEMSIZEDETAILSMANDATORY = Yes :', itemsWithSizeMandatory);
console.log('Items with ISITEMPREDEFINEDSIZEDETAILSSKIPPED = Yes:', itemsWithSizeSkipped);
console.log('Items with STKITEMSIZESBILLINGTYPE            :', itemsWithBillingMode);
console.log('Items with explicit ITEMWIDTHUDF              :', itemsWithWidth);
console.log('Items with explicit ITEMLENGTHUDF             :', itemsWithLength);
console.log('Items with explicit ITEMSIZENAMEUDF           :', itemsWithDefaultSizeName);
console.log('\n--- Sample 15 Items ---');
console.table(sampleSizes);
