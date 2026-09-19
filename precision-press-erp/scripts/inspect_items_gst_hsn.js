const fs = require('fs');

function readXml(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.toString('utf16le');
  }
  return buf.toString('utf8');
}

const xml = readXml('C:\\Users\\jprat\\Videos\\items.xml');

const gstListMatches = xml.match(/<GSTDETAILS\.LIST>([\s\S]*?)<\/GSTDETAILS\.LIST>/gi) || [];
const nonEmptyGst = gstListMatches.filter(m => !m.includes('<GSTDETAILS.LIST>      </GSTDETAILS.LIST>') && m.trim() !== '<GSTDETAILS.LIST></GSTDETAILS.LIST>');
console.log('Non-empty GSTDETAILS.LIST count:', nonEmptyGst.length);
if (nonEmptyGst.length > 0) {
  console.log('Sample GST Details:', nonEmptyGst[0]);
}

const hsnListMatches = xml.match(/<HSNDETAILS\.LIST>([\s\S]*?)<\/HSNDETAILS\.LIST>/gi) || [];
const nonEmptyHsn = hsnListMatches.filter(m => !m.includes('<HSNDETAILS.LIST>      </HSNDETAILS.LIST>') && m.trim() !== '<HSNDETAILS.LIST></HSNDETAILS.LIST>');
console.log('Non-empty HSNDETAILS.LIST count:', nonEmptyHsn.length);
if (nonEmptyHsn.length > 0) {
  console.log('Sample HSN Details:', nonEmptyHsn[0]);
}

// Search for any HSN or GST rate in the file
const anyHsn = xml.match(/<HSN[^>]*>([^<]+)<\/HSN[^>]*>/gi);
console.log('Any <HSN...> tags found:', anyHsn ? anyHsn.slice(0, 5) : 'None');

const anyGst = xml.match(/<GST[^>]*>([^<]+)<\/GST[^>]*>/gi);
console.log('Any <GST...> tags found (first 5):', anyGst ? anyGst.slice(0, 5) : 'None');
