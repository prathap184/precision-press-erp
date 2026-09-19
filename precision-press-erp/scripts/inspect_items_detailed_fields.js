const fs = require('fs');

function readXml(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.toString('utf16le');
  }
  return buf.toString('utf8');
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

const xml = readXml('C:\\Users\\jprat\\Videos\\items.xml');
const itemRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
let m;

let count = 0;
let hasOpening = 0;
let hasRate = 0;
let hasHsn = 0;
let hasGst = 0;
let hasSizes = 0;
let hasBillingMode = 0;
const names = new Set();
const duplicateNames = [];

const sampleItems = [];

while ((m = itemRegex.exec(xml)) !== null) {
  count++;
  const rawName = m[1];
  const name = clean(rawName);
  const body = m[2];

  if (names.has(name.toLowerCase())) {
    duplicateNames.push(name);
  }
  names.add(name.toLowerCase());

  const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
  const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
  const baseUnitsM = body.match(/<BASEUNITS>([^<]*)<\/BASEUNITS>/i);
  const openBalM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
  const openRateM = body.match(/<OPENINGRATE>([^<]*)<\/OPENINGRATE>/i);
  const openValM = body.match(/<OPENINGVALUE>([^<]*)<\/OPENINGVALUE>/i);
  const alterM = body.match(/<ALTERID>([^<]*)<\/ALTERID>/i);
  const hsnM = body.match(/<HSNCODE>([^<]*)<\/HSNCODE>/i);
  const gstM = body.match(/<GSTRATE>([^<]*)<\/GSTRATE>/i);
  const sizeMandatoryM = body.match(/<UDF:ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]+)<\/UDF:ISITEMSIZEDETAILSMANDATORY>/i);
  const billingModeM = body.match(/<UDF:STKITEMSIZESBILLINGTYPE[^>]*>([^<]+)<\/UDF:STKITEMSIZESBILLINGTYPE>/i);

  if (openBalM) hasOpening++;
  if (openRateM) hasRate++;
  if (hsnM) hasHsn++;
  if (gstM) hasGst++;
  if (sizeMandatoryM && clean(sizeMandatoryM[1]).toLowerCase() === 'yes') hasSizes++;
  if (billingModeM) hasBillingMode++;

  if (sampleItems.length < 10) {
    sampleItems.push({
      name,
      guid: guidM ? guidM[1] : null,
      parent: parentM ? clean(parentM[1]) : '(None)',
      unit: baseUnitsM ? clean(baseUnitsM[1]) : '',
      openBal: openBalM ? clean(openBalM[1]) : '0',
      openRate: openRateM ? clean(openRateM[1]) : '0',
      openVal: openValM ? clean(openValM[1]) : '0',
      billingMode: billingModeM ? clean(billingModeM[1]) : 'None',
      sizeMandatory: sizeMandatoryM ? clean(sizeMandatoryM[1]) : 'No',
    });
  }
}

console.log('Total items in items.xml:', count);
console.log('Unique names:', names.size);
console.log('Duplicate names:', duplicateNames);
console.log('Items with Opening Balance:', hasOpening);
console.log('Items with Opening Rate:', hasRate);
console.log('Items with HSN Code:', hasHsn);
console.log('Items with GST Rate:', hasGst);
console.log('Items with Size Details Mandatory (Yes):', hasSizes);
console.log('Items with STKItemSizesBillingType:', hasBillingMode);
console.log('\n--- First 10 Items Sample ---');
console.table(sampleItems);
