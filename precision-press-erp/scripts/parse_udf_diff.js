const fs = require('fs');
const xml = fs.readFileSync('all_stock_items_udf.xml', 'utf8');

function dumpFullItem(name) {
  const idx = xml.indexOf(`NAME="${name}"`);
  if (idx !== -1) {
    const endIdx = xml.indexOf('</STOCKITEM>', idx);
    console.log(`\n================== FULL ${name} ==================`);
    console.log(xml.slice(idx, endIdx + 12));
  }
}

dumpFullItem('900 SPR - FL Royal');
dumpFullItem('3750 Sunpack 3mm White- 325');
