const http = require('http');
const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000002';

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

function generateItemCode(index, name, group) {
  const prefix = (group || 'ITM').replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'ITM';
  const num = String(index + 1).padStart(4, '0');
  return `${prefix}-${num}`;
}

async function run() {
  console.log('-----------------------------------------------------------------------');
  console.log('     ?? DRY-RUN INGESTION TEST: ALL 335 STOCK ITEMS ? DATABASE        ');
  console.log('-----------------------------------------------------------------------\n');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // 1. Fetch categories
  const catRes = await client.query('SELECT id, name FROM public.inventory_category WHERE organization_id = $1', [DEFAULT_ORG_ID]);
  const catMap = new Map();
  catRes.rows.forEach(r => catMap.set(r.name.toLowerCase().trim(), r.id));
  console.log(`? Loaded ${catMap.size} inventory categories from DB.`);

  // 2. Fetch GL Accounts
  const glRes = await client.query('SELECT id, code FROM public.chart_account WHERE organization_id = $1 AND code IN ($2, $3, $4, $5)', [DEFAULT_ORG_ID, '1300', '4000', '4010', '5000']);
  const glMap = new Map();
  glRes.rows.forEach(r => glMap.set(r.code, r.id));
  const inventoryAccountId = glMap.get('1300');
  const revenueAccountId = glMap.get('4010') || glMap.get('4000');
  const costAccountId = glMap.get('5000');
  console.log(`? GL Accounts verified: Inv=${inventoryAccountId ? 'OK' : 'ERR'}, Rev=${revenueAccountId ? 'OK' : 'ERR'}, Cost=${costAccountId ? 'OK' : 'ERR'}`);

  // 3. Read items.xml
  const xml = readXmlFile('C:\\Users\\jprat\\Videos\\items.xml');
  const itemRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
  let m;
  const itemsToInsert = [];
  let idx = 0;

  while ((m = itemRegex.exec(xml)) !== null) {
    const rawName = m[1];
    const name = clean(rawName);
    const body = m[2];

    const guidM = body.match(/<GUID[^>]*>([^<]*)<\/GUID>/i);
    const parentM = body.match(/<PARENT[^>]*>([^<]*)<\/PARENT>/i);
    const uomM = body.match(/<BASEUNITS[^>]*>([^<]*)<\/BASEUNITS>/i);
    const altUomM = body.match(/<ADDITIONALUNITS[^>]*>([^<]*)<\/ADDITIONALUNITS>/i);
    const openBalM = body.match(/<OPENINGBALANCE[^>]*>([^<]*)<\/OPENINGBALANCE>/i);
    const openRateM = body.match(/<OPENINGRATE[^>]*>([^<]*)<\/OPENINGRATE>/i);
    const openValM = body.match(/<OPENINGVALUE[^>]*>([^<]*)<\/OPENINGVALUE>/i);
    const alterM = body.match(/<ALTERID[^>]*>([^<]*)<\/ALTERID>/i);
    const billingTypeM = body.match(/<(?:UDF:)?STKITEMSIZESBILLINGTYPE[^>]*>([^<]+)<\/(?:UDF:)?STKITEMSIZESBILLINGTYPE>/i);
    const sizeMandM = body.match(/<(?:UDF:)?ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]+)<\/(?:UDF:)?ISITEMSIZEDETAILSMANDATORY>/i);
    const widthM = body.match(/<(?:UDF:)?ITEMWIDTHUDF[^>]*>([^<]+)<\/(?:UDF:)?ITEMWIDTHUDF>/i) || body.match(/<ITEMWIDTH[^>]*>([^<]+)<\/ITEMWIDTH>/i);
    const lengthM = body.match(/<(?:UDF:)?ITEMLENGTHUDF[^>]*>([^<]+)<\/(?:UDF:)?ITEMLENGTHUDF>/i) || body.match(/<ITEMLENGTH[^>]*>([^<]+)<\/ITEMLENGTH>/i);
    const sizeNameM = body.match(/<(?:UDF:)?ITEMSIZENAMEUDF[^>]*>([^<]+)<\/(?:UDF:)?ITEMSIZENAMEUDF>/i) || body.match(/<ITEMSIZENAME[^>]*>([^<]+)<\/ITEMSIZENAME>/i);

    const guid = guidM ? clean(guidM[1]) : null;
    const parent = parentM ? clean(parentM[1]) : '';
    const uom = uomM ? clean(uomM[1]) : 'N';
    const rawAlt = altUomM ? clean(altUomM[1]) : '';
    const altUom = (rawAlt && !rawAlt.includes('Not Applicable')) ? rawAlt : null;

    const alterId = alterM ? parseInt(alterM[1].trim(), 10) : null;
    const isMandatory = sizeMandM && clean(sizeMandM[1]).toLowerCase() === 'yes';
    const billingMode = billingTypeM ? clean(billingTypeM[1]) : (isMandatory ? 'B' : null);

    const defaultWidth = widthM ? parseFloat(clean(widthM[1])) : (isMandatory ? 1 : null);
    const defaultLength = lengthM ? parseFloat(clean(lengthM[1])) : (isMandatory ? 1 : null);
    const defaultWidthUnit = 'FT';
    const defaultLengthUnit = 'FT';
    const defaultSizeName = sizeNameM ? clean(sizeNameM[1]) : (isMandatory ? '1 F x 1 F' : null);

    const isSqft = uom.toLowerCase().includes('sqft');

    // Parse opening balance numbers
    let openQty = 0;
    if (openBalM) {
      const raw = clean(openBalM[1]).replace(/[^\d.-]/g, '');
      openQty = parseFloat(raw) || 0;
    }
    let openRate = 0;
    if (openRateM) {
      const raw = clean(openRateM[1]).replace(/[^\d.-]/g, '');
      openRate = parseFloat(raw) || 0;
    }
    let openVal = 0;
    if (openValM) {
      const raw = clean(openValM[1]).replace(/[^\d.-]/g, '');
      openVal = Math.abs(parseFloat(raw) || 0);
    }
    if (openVal === 0 && openQty !== 0 && openRate !== 0) {
      openVal = Math.round(Math.abs(openQty * openRate) * 100) / 100;
    }

    const categoryId = parent ? (catMap.get(parent.toLowerCase()) || null) : null;
    const code = generateItemCode(idx, name, parent);
    const sku = code;

    const purchasePricePaise = Math.round(openRate * 100);
    const salePricePaise = Math.round(openRate * 1.25 * 100);
    const quantityOnHand = Math.round(openQty);
    const totalValuePaise = Math.round(openVal * 100);

    const payload = {
      organization_id: DEFAULT_ORG_ID,
      code,
      sku,
      name,
      description: `Stock Item: ${name}${parent ? ` (${parent})` : ''}`,
      category: parent || 'General',
      category_id: categoryId,
      tally_item_name: name,
      tally_guid: guid,
      alter_id: alterId,
      tally_stock_group: parent || null,
      tally_uom: uom,
      tally_alt_uom: altUom,
      tally_billing_mode: billingMode,
      unit_of_measure: uom,
      purchase_price: purchasePricePaise,
      sale_price: salePricePaise,
      average_cost: purchasePricePaise,
      standard_cost: purchasePricePaise,
      quantity_on_hand: quantityOnHand,
      opening_quantity: openQty,
      opening_rate: openRate,
      opening_value: openVal,
      total_value: totalValuePaise,
      inventory_account_id: inventoryAccountId,
      revenue_account_id: revenueAccountId,
      cost_account_id: costAccountId,
      cost_method: 'average',
      tracking_method: 'none',
      has_multiple_sizes: isMandatory,
      default_width: defaultWidth,
      default_length: defaultLength,
      default_width_unit: defaultWidthUnit,
      default_length_unit: defaultLengthUnit,
      default_size_name: defaultSizeName,
      metadata: {
        unit: uom,
        calcType: isSqft ? 'SQFT' : 'QTY',
        billingMode: billingMode,
        baseRate: openRate,
        hasMultipleSizes: isMandatory,
        has_multiple_sizes: isMandatory,
        defaultWidth: defaultWidth,
        default_width: defaultWidth,
        defaultLength: defaultLength,
        default_length: defaultLength,
        defaultSizeName: defaultSizeName,
        default_size_name: defaultSizeName,
      },
      is_active: true
    };

    itemsToInsert.push(payload);
    idx++;
  }

  console.log(`?? Prepared ${itemsToInsert.length} items for DB insertion test.`);

  // 4. Run Transaction with ROLLBACK
  console.log('\n?? Beginning dry-run SQL transaction (BEGIN)...');
  await client.query('BEGIN');

  let insertedCount = 0;
  try {
    for (const item of itemsToInsert) {
      const q = `
        INSERT INTO public.inventory_item (
          organization_id, code, sku, name, description,
          category, category_id, tally_item_name, tally_guid, alter_id,
          tally_stock_group, tally_uom, tally_alt_uom, tally_billing_mode,
          unit_of_measure, purchase_price, sale_price, average_cost, standard_cost,
          quantity_on_hand, opening_quantity, opening_rate, opening_value, total_value,
          inventory_account_id, revenue_account_id, cost_account_id,
          cost_method, tracking_method, has_multiple_sizes,
          default_width, default_length, default_width_unit, default_length_unit, default_size_name,
          metadata, is_active
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24,
          $25, $26, $27,
          $28, $29, $30,
          $31, $32, $33, $34, $35,
          $36, $37
        ) RETURNING id;
      `;
      const values = [
        item.organization_id, item.code, item.sku, item.name, item.description,
        item.category, item.category_id, item.tally_item_name, item.tally_guid, item.alter_id,
        item.tally_stock_group, item.tally_uom, item.tally_alt_uom, item.tally_billing_mode,
        item.unit_of_measure, item.purchase_price, item.sale_price, item.average_cost, item.standard_cost,
        item.quantity_on_hand, item.opening_quantity, item.opening_rate, item.opening_value, item.total_value,
        item.inventory_account_id, item.revenue_account_id, item.cost_account_id,
        item.cost_method, item.tracking_method, item.has_multiple_sizes,
        item.default_width, item.default_length, item.default_width_unit, item.default_length_unit, item.default_size_name,
        JSON.stringify(item.metadata), item.is_active
      ];

      await client.query(q, values);
      insertedCount++;
    }

    console.log(`? SUCCESS! Successfully inserted all ${insertedCount} / ${itemsToInsert.length} items without a single error!`);

    // Verify row count inside the transaction
    const countRes = await client.query('SELECT count(*) FROM public.inventory_item');
    console.log(`?? Transaction Row Count: ${countRes.rows[0].count}`);

  } catch (err) {
    console.error(`? DB Insertion Error at item index ${insertedCount}:`, err.message);
  } finally {
    console.log('?? Executing ROLLBACK (Zero changes persisted)...');
    await client.query('ROLLBACK');
    console.log('? ROLLBACK complete. Database remains untouched.');
  }

  // Verify final count after rollback
  const afterRes = await client.query('SELECT count(*) FROM public.inventory_item');
  console.log(`\n?? Verified Post-Rollback DB Row Count: ${afterRes.rows[0].count} (Pristine state preserved)`);

  await client.end();
}

run().catch(console.error);
