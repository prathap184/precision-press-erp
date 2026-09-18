require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const http = require('http');

const TALLY_HOST = '127.0.0.1';
const TALLY_PORT = 9000;
const TARGET_COMPANY = 'Website Testing Hindustan';

function queryTally(payload) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: TALLY_HOST,
      port: TALLY_PORT,
      path: '',
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 120000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function cleanStr(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function normalizeUnit(unit) {
  if (!unit) return 'FT';
  const u = unit.trim().toUpperCase();
  if (u === 'F' || u === 'FT' || u === 'FEET' || u === 'FOOT') return 'FT';
  if (u === 'I' || u === 'IN' || u === 'INCH' || u === 'INCHES') return 'IN';
  if (u === 'M' || u === 'MTR' || u === 'METER' || u === 'METERS') return 'M';
  if (u === 'MM') return 'MM';
  if (u === 'CM') return 'CM';
  return u;
}

async function verify() {
  console.log('=== 100% DATABASE SYNC VERIFICATION ===\n');

  const res = await pool.query(`
    SELECT 
      has_multiple_sizes,
      (metadata->>'has_single_default_size')::boolean as has_single_default_size,
      COUNT(*)::int as item_count
    FROM inventory_item
    GROUP BY has_multiple_sizes, (metadata->>'has_single_default_size')::boolean
    ORDER BY has_multiple_sizes DESC, has_single_default_size DESC;
  `);

  console.table(res.rows);

  const sampleSingleDefault = await pool.query(`
    SELECT name, category, default_width, default_length, default_width_unit, default_length_unit, default_size_name
    FROM inventory_item
    WHERE (metadata->>'has_single_default_size')::boolean = true
    LIMIT 10;
  `);

  console.log('\n--- Sample 10 Items with Set Multiple Size = NO BUT Single Default Size (Width & Length Active) ---');
  console.table(sampleSingleDefault.rows);

  const sampleFixed = await pool.query(`
    SELECT name, category, has_multiple_sizes, default_width, default_length
    FROM inventory_item
    WHERE has_multiple_sizes = false 
      AND (metadata->>'has_single_default_size')::boolean IS NOT TRUE
    LIMIT 10;
  `);

  console.log('\n--- Sample 10 Fixed Items (Set Multiple Size = NO & No Default Size, Width & Length Disabled) ---');
  console.table(sampleFixed.rows);
}

verify().catch(console.error).finally(() => pool.end());




