const fs = require('fs');
const path = require('path');
const xml = fs.readFileSync(path.resolve(__dirname, '../tally_sync/all ledgers/stockitems.xml'), 'utf8');

const re = /<STOCKITEM\s+NAME="CP 22 Medium Grey"[^>]*>([\s\S]*?)<\/STOCKITEM>/i;
const m = xml.match(re);

if (m) {
  const body = m[1];
  console.log('=== FULL DETAILS OF "CP 22 Medium Grey" IN TALLY XML ===');
  
  const extract = (tag) => {
    const r = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i');
    const match = body.match(r);
    return match ? match[1].trim() : 'N/A';
  };

  console.log('Item Name:         ', 'CP 22 Medium Grey');
  console.log('Stock Group/Parent:', extract('PARENT'));
  console.log('GUID:              ', extract('GUID'));
  console.log('Alter ID:          ', extract('ALTERID'));
  console.log('Base Unit (UOM):   ', extract('BASEUNITS'));
  console.log('HSN/SAC Code:      ', extract('HSNCODE'));
  console.log('GST Rate:          ', extract('GSTRATE'));
  console.log('Opening Balance:   ', extract('OPENINGBALANCE'));
  console.log('Opening Rate:      ', extract('OPENINGRATE'));
  console.log('Opening Value:     ', extract('OPENINGVALUE'));
}
