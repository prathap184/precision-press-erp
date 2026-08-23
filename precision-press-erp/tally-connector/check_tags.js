const fs = require('fs');
const path = require('path');
const xml = fs.readFileSync(path.resolve(__dirname, '../tally_sync/all ledgers/stockitems.xml'), 'utf8');

function checkOpenTags(name) {
  const re = new RegExp('<STOCKITEM\\s+NAME="' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>([\\s\\S]*?)<\\/STOCKITEM>', 'i');
  const m = xml.match(re);
  if (m) {
    const hasOpeningBalanceTag = m[1].includes('<OPENINGBALANCE>');
    const hasOpeningValueTag = m[1].includes('<OPENINGVALUE>');
    console.log(`\nItem: "${name}"`);
    console.log(`  -> Has <OPENINGBALANCE> tag in Tally XML: ${hasOpeningBalanceTag}`);
    console.log(`  -> Has <OPENINGVALUE> tag in Tally XML:   ${hasOpeningValueTag}`);
    if (hasOpeningBalanceTag) {
      console.log(`  -> Balance Value in Tally: ${m[1].match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/)[1]}`);
      console.log(`  -> Opening Rate in Tally:   ${m[1].match(/<OPENINGRATE>([^<]*)<\/OPENINGRATE>/)[1]}`);
      console.log(`  -> Opening Value in Tally:  ${m[1].match(/<OPENINGVALUE>([^<]*)<\/OPENINGVALUE>/)[1]}`);
    }
  }
}

checkOpenTags('CP 48 Haier Grey');
checkOpenTags('CP 141 DeepBrown');
checkOpenTags('CP 37 Light Green');
checkOpenTags('CP 22 Medium Grey');
checkOpenTags('CP 43 Cream White');
