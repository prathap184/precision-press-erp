const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

function readXmlFile(p) {
  const b = fs.readFileSync(p);
  if (b[0] === 0xFF && b[1] === 0xFE) return b.toString('utf16le');
  return b.toString('utf8');
}

function clean(str) {
  if (!str) return '';
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#4;/g, '').trim();
}

async function run() {
  console.log('========================================================================');
  console.log('   TARGETED RE-SYNC: ONLY SIZING FIELDS (has_multiple_sizes & sizes)   ');
  console.log('   Preserving ALL balances, GL links, categories, godowns, and names   ');
  console.log('========================================================================\n');

  // 1. Read items.xml
  const fileXml = readXmlFile('C:\\Users\\jprat\\Videos\\items.xml');
  const fileRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
  let fm;

  const sizingMap = new Map();

  while ((fm = fileRegex.exec(fileXml)) !== null) {
    const name = clean(fm[1]);
    const body = fm[2];
    const guidM = body.match(/<GUID[^>]*>([^<]*)<\/GUID>/i);
    const widthM = body.match(/<UDF:ITEMWIDTHUDF[^>]*>([^<]*)<\/UDF:ITEMWIDTHUDF>/i) || body.match(/<ITEMWIDTH[^>]*>([^<]*)<\/ITEMWIDTH>/i);
    const lengthM = body.match(/<UDF:ITEMLENGTHUDF[^>]*>([^<]*)<\/UDF:ITEMLENGTHUDF>/i) || body.match(/<ITEMLENGTH[^>]*>([^<]*)<\/ITEMLENGTH>/i);
    const sizeNameM = body.match(/<UDF:ITEMSIZENAMEUDF[^>]*>([^<]*)<\/UDF:ITEMSIZENAMEUDF>/i) || body.match(/<ITEMSIZENAME[^>]*>([^<]*)<\/ITEMSIZENAME>/i);

    const guid = guidM ? clean(guidM[1]) : '';
    const rawWidth = widthM && clean(widthM[1]) ? parseFloat(clean(widthM[1])) : null;
    const rawLength = lengthM && clean(lengthM[1]) ? parseFloat(clean(lengthM[1])) : null;
    const rawSizeName = sizeNameM ? clean(sizeNameM[1]) : null;

    // RULE: If Tally has Predefined Size (Width & Length & SizeName) -> Rule 1 (has_multiple_sizes = true)
    // If Tally has Predefined Size = None -> Rule 3 (has_multiple_sizes = false, sizes = null)
    const hasPredefinedSize = Boolean(rawWidth && rawLength && rawWidth > 0 && rawLength > 0 && rawSizeName);

    const hasMultipleSizes = hasPredefinedSize ? true : false;
    const defaultWidth = hasPredefinedSize ? rawWidth : null;
    const defaultLength = hasPredefinedSize ? rawLength : null;
    const defaultWidthUnit = hasPredefinedSize ? 'FT' : null;
    const defaultLengthUnit = hasPredefinedSize ? 'FT' : null;
    const defaultSizeName = hasPredefinedSize ? rawSizeName : null;

    sizingMap.set(guid || name, {
      name,
      guid,
      hasMultipleSizes,
      defaultWidth,
      defaultLength,
      defaultWidthUnit,
      defaultLengthUnit,
      defaultSizeName
    });
  }

  console.log(`Parsed ${sizingMap.size} items from items.xml.`);

  let trueCount = 0;
  let falseCount = 0;
  for (const v of sizingMap.values()) {
    if (v.hasMultipleSizes) trueCount++;
    else falseCount++;
  }
  console.log(`- Rule 1 (Predefined Size in Tally -> has_multiple_sizes = true) : ${trueCount} items`);
  console.log(`- Rule 3 (Size is None in Tally     -> has_multiple_sizes = false): ${falseCount} items`);

  // 2. Connect to DB and update ONLY sizing fields
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('\nStarting ACID Transaction (BEGIN)...');
  await client.query('BEGIN');

  let updatedCount = 0;
  for (const item of sizingMap.values()) {
    const updateRes = await client.query(`
      UPDATE public.inventory_item
      SET
        has_multiple_sizes = $1,
        default_width = $2,
        default_length = $3,
        default_width_unit = $4,
        default_length_unit = $5,
        default_size_name = $6,
        metadata = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        COALESCE(metadata, '{}'::jsonb),
                        '{hasMultipleSizes}', to_jsonb($1::boolean)
                      ),
                      '{has_multiple_sizes}', to_jsonb($1::boolean)
                    ),
                    '{defaultWidth}', to_jsonb($2::numeric)
                  ),
                  '{default_width}', to_jsonb($2::numeric)
                ),
                '{defaultLength}', to_jsonb($3::numeric)
              ),
              '{default_length}', to_jsonb($3::numeric)
            ),
            '{defaultSizeName}', to_jsonb($6::text)
          ),
          '{defaultSize}', to_jsonb($7::boolean)
        ),
        updated_at = now()
      WHERE organization_id = '00000000-0000-0000-0000-000000000002'
        AND (tally_guid = $8 OR name = $9)
      RETURNING id;
    `, [
      item.hasMultipleSizes,
      item.defaultWidth,
      item.defaultLength,
      item.defaultWidthUnit,
      item.defaultLengthUnit,
      item.defaultSizeName,
      Boolean(item.defaultWidth && item.defaultLength),
      item.guid,
      item.name
    ]);

    if (updateRes.rows.length > 0) {
      updatedCount++;
    }
  }

  await client.query('COMMIT');
  console.log(`\n🎉 TRANSACTION COMMITTED! Successfully updated ONLY sizing fields on ${updatedCount} / 335 items.`);

  // 3. Post-update verification
  const auditRes = await client.query(`
    SELECT 
      has_multiple_sizes, 
      count(*) 
    FROM public.inventory_item 
    WHERE organization_id = '00000000-0000-0000-0000-000000000002'
    GROUP BY has_multiple_sizes
  `);
  console.log('\n--- Post-Sync has_multiple_sizes Distribution in DB ---');
  console.table(auditRes.rows);

  // Check the 10 None items in DB
  const noneSamples = [
    '3m Black Back Vinyl ( Mu )',
    '3m black back vinyl ( Plain )',
    '3m Black Back Vinyl ( Re )',
    'FROSTED MACAL CRYSTAL (PL)',
    'M S Cutting',
    'P C Sheet',
    'A4 Lamination',
    '3M Glossy Lamination ( Plain )'
  ];

  const verifyRes = await client.query(`
    SELECT 
      name, 
      has_multiple_sizes, 
      default_size_name, 
      default_width, 
      default_length,
      tally_billing_mode,
      tally_godown
    FROM public.inventory_item
    WHERE organization_id = '00000000-0000-0000-0000-000000000002'
      AND name = ANY($1)
    ORDER BY name ASC
  `, [noneSamples]);

  console.log('\n--- Specific Sample Items Post-Sync Check ---');
  console.table(verifyRes.rows);

  await client.end();
}

run().catch(console.error);