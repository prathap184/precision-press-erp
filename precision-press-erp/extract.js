const fs = require('fs');
const sql = fs.readFileSync('supabase/migrations/00000_init.sql', 'utf8');

function extractFunction(name) {
  const regex = new RegExp(`CREATE OR REPLACE FUNCTION [^;]+?"${name}"[\\s\\S]*?\\$function\\$[\\s\\S]*?\\$function\\$;`);
  const match = sql.match(regex);
  if (match) return match[0];

  const regex2 = new RegExp(`CREATE OR REPLACE FUNCTION [^;]+?"${name}"[\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$ LANGUAGE plpgsql;`);
  const match2 = sql.match(regex2);
  return match2 ? match2[0] : null;
}

let out = '';

const p = extractFunction('place_order_tx');
if (p) out += p + '\n\n';

const g = extractFunction('get_next_order_id');
if (g) out += g + '\n\n';

const i = extractFunction('increment_rate_limit');
if (i) out += i + '\n\n';

if (!p && !g && !i) {
    console.log("Could not find functions automatically, doing a simple split.");
    // Fallback: Just search for 'CREATE OR REPLACE FUNCTION "public"."place_order_tx"' and grab until the next CREATE or ALTER
    
    let parts = sql.split('CREATE OR REPLACE FUNCTION');
    parts.forEach(part => {
        if (part.includes('"place_order_tx"') || part.includes('"get_next_order_id"') || part.includes('"increment_rate_limit"')) {
            out += 'CREATE OR REPLACE FUNCTION' + part.split('ALTER FUNCTION')[0] + '\n\n';
        }
    });
}

fs.writeFileSync('missing_rpcs.sql', out);
console.log('Saved to missing_rpcs.sql');
