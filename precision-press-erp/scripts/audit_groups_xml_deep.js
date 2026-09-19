const fs = require('fs');
const path = require('path');

function clean(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#4;/g, '')
    .replace(/&#10;/g, ' ')
    .replace(/&#13;/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,;]+$/, '')
    .trim();
}

async function inspectDeep() {
  const xmlPath = 'C:\\Users\\jprat\\Videos\\groups.xml';
  const content = fs.readFileSync(xmlPath, 'utf16le');

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('         🔍 DEEP AUDIT OF STOCK GROUPS: groups.xml');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  let unitCount = 0;
  let stockGroupCount = 0;
  const units = [];
  const stockGroupsByGuid = new Map();
  const stockGroupsByName = new Map();
  const duplicateGuids = [];
  const duplicateNames = [];

  // Parse all UNIT tags directly
  const unitRegex = /<UNIT NAME="([^"]*)"[^>]*>([\s\S]*?)<\/UNIT>/gi;
  let um;
  while ((um = unitRegex.exec(content)) !== null) {
    unitCount++;
    const uName = clean(um[1]);
    const uBody = um[2];
    const gM = uBody.match(/<GUID>([^<]*)<\/GUID>/i);
    const oM = uBody.match(/<ORIGINALNAME>([^<]*)<\/ORIGINALNAME>/i);
    const dM = uBody.match(/<DECIMALPLACES>([^<]*)<\/DECIMALPLACES>/i);
    units.push({
      symbol: uName,
      formalName: oM ? clean(oM[1]) : '',
      decimals: dM ? parseInt(clean(dM[1]), 10) : 0,
      guid: gM ? clean(gM[1]) : ''
    });
  }

  // Parse all STOCKGROUP tags directly
  const sgRegex = /<STOCKGROUP NAME="([^"]*)"[^>]*>([\s\S]*?)<\/STOCKGROUP>/gi;
  let sgm;
  while ((sgm = sgRegex.exec(content)) !== null) {
    stockGroupCount++;
    const rawName = sgm[1];
    const name = clean(rawName);
    const sgBody = sgm[2];

    const guidM = sgBody.match(/<GUID>([^<]*)<\/GUID>/i);
    const parentM = sgBody.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const alterM = sgBody.match(/<ALTERID>([^<]*)<\/ALTERID>/i);
    const addableM = sgBody.match(/<ISADDABLE>([^<]*)<\/ISADDABLE>/i);
    const baseUnitsM = sgBody.match(/<BASEUNITS>([^<]*)<\/BASEUNITS>/i);
    const hsnM = sgBody.match(/<HSNCODE>([^<]*)<\/HSNCODE>/i) || sgBody.match(/<HSNDESCRIPTION>([^<]*)<\/HSNDESCRIPTION>/i);

    const guid = guidM ? clean(guidM[1]) : null;
    const parent = parentM ? clean(parentM[1]) : '';
    const alterId = alterM ? parseInt(clean(alterM[1]), 10) : null;
    const isAddable = addableM ? clean(addableM[1]) : 'No';

    const record = {
      name,
      parent: parent || '(Primary)',
      guid,
      alterId,
      isAddable,
      baseUnits: baseUnitsM ? clean(baseUnitsM[1]) : null,
      hsn: hsnM ? clean(hsnM[1]) : null
    };

    if (guid) {
      if (stockGroupsByGuid.has(guid.toLowerCase())) {
        duplicateGuids.push({ guid, name, previous: stockGroupsByGuid.get(guid.toLowerCase()) });
      } else {
        stockGroupsByGuid.set(guid.toLowerCase(), record);
      }
    }

    if (stockGroupsByName.has(name.toLowerCase())) {
      duplicateNames.push({ name, current: record, previous: stockGroupsByName.get(name.toLowerCase()) });
    } else {
      stockGroupsByName.set(name.toLowerCase(), record);
    }
  }

  console.log('📦 Tag Counts:');
  console.log(`   • Units of Measure (<UNIT>)         : ${unitCount}`);
  console.log(`   • Stock Groups (<STOCKGROUP>)       : ${stockGroupCount}`);

  console.log(`\n📊 Unique Stock Groups by GUID: ${stockGroupsByGuid.size}`);
  console.log(`📊 Unique Stock Groups by Name: ${stockGroupsByName.size}`);

  if (duplicateNames.length > 0) {
    console.log(`⚠️ Duplicate Name occurrences in XML (${duplicateNames.length}):`);
    duplicateNames.forEach(d => console.log(`   - "${d.name}" (GUID: ${d.current.guid}) vs previous (GUID: ${d.previous.guid})`));
  }

  // Hierarchy Tree Construction
  console.log('\n🌳 STOCK GROUP HIERARCHY TREE:');
  const allGroups = Array.from(stockGroupsByName.values());
  const primaryGroups = allGroups.filter(g => g.parent === '(Primary)');
  const childGroups = allGroups.filter(g => g.parent !== '(Primary)');

  console.log(`   • Primary / Top-Level Groups : ${primaryGroups.length}`);
  console.log(`   • Child / Sub-Groups         : ${childGroups.length}`);

  // Print hierarchy tree
  primaryGroups.forEach((p, idx) => {
    console.log(`\n📁 [${idx + 1}] ${p.name} (GUID: ${p.guid})`);
    const children = allGroups.filter(g => g.parent.toLowerCase() === p.name.toLowerCase());
    if (children.length === 0) {
      console.log(`      (No sub-groups)`);
    } else {
      children.forEach(c => {
        console.log(`      └── 📂 ${c.name} (GUID: ${c.guid})`);
        const grandChildren = allGroups.filter(g => g.parent.toLowerCase() === c.name.toLowerCase());
        grandChildren.forEach(gc => {
          console.log(`            └── 📂 ${gc.name} (GUID: ${gc.guid})`);
        });
      });
    }
  });

  // Check any orphan child groups (parent not in primary)
  const orphanChildren = childGroups.filter(c => !stockGroupsByName.has(c.parent.toLowerCase()));
  if (orphanChildren.length > 0) {
    console.log('\n⚠️ Child groups with missing parent:');
    orphanChildren.forEach(o => console.log(`   - "${o.name}" -> Parent "${o.parent}" not found!`));
  }

  // Units list
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('                 📏 UNITS OF MEASURE IN XML');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.table(units);
}

inspectDeep().catch(console.error);
