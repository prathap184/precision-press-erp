const fs = require('fs');

function readXmlFile(p) {
  const b = fs.readFileSync(p);
  if (b[0] === 0xFF && b[1] === 0xFE) return b.toString('utf16le');
  return b.toString('utf8');
}

function clean(str) {
  if (!str) return '';
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#4;/g, '').trim();
}

const fileXml = readXmlFile('C:\\Users\\jprat\\Videos\\items.xml');
const fileRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
let fm;

const noWidthItems = [];
while ((fm = fileRegex.exec(fileXml)) !== null) {
  const name = clean(fm[1]);
  const body = fm[2];
  const isMandM = body.match(/<UDF:ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]*)<\/UDF:ISITEMSIZEDETAILSMANDATORY>/i);
  const widthM = body.match(/<UDF:ITEMWIDTHUDF[^>]*>([^<]*)<\/UDF:ITEMWIDTHUDF>/i);
  const lengthM = body.match(/<UDF:ITEMLENGTHUDF[^>]*>([^<]*)<\/UDF:ITEMLENGTHUDF>/i);
  const sizeNameM = body.match(/<UDF:ITEMSIZENAMEUDF[^>]*>([^<]*)<\/UDF:ITEMSIZENAMEUDF>/i);
  const bTypeM = body.match(/<UDF:STKITEMSIZESBILLINGTYPE[^>]*>([^<]*)<\/UDF:STKITEMSIZESBILLINGTYPE>/i);

  const isMand = isMandM && clean(isMandM[1]).toLowerCase() === 'yes';
  const width = widthM ? clean(widthM[1]) : null;

  if (isMand && !width) {
    noWidthItems.push({
      name,
      isMand: clean(isMandM[1]),
      billingType: bTypeM ? clean(bTypeM[1]) : null,
      width,
      sizeName: sizeNameM ? clean(sizeNameM[1]) : null
    });
  }

  if (name.toLowerCase() === 'acrylic') {
    console.log('Acrylic raw tags:');
    console.log({
      name,
      isMandM: isMandM ? clean(isMandM[1]) : null,
      bTypeM: bTypeM ? clean(bTypeM[1]) : null,
      widthM: widthM ? clean(widthM[1]) : null
    });
  }
}

console.log(`\nItems with ISITEMSIZEDETAILSMANDATORY = Yes but NO explicit ITEMWIDTHUDF in items.xml (${noWidthItems.length}):`);
console.table(noWidthItems);