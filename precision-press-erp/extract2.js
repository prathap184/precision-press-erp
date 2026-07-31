const fs = require('fs');
const sql = fs.readFileSync('supabase/migrations/00000_init.sql', 'utf8');

function extractFunction(name) {
  const regex = new RegExp(`CREATE OR REPLACE FUNCTION [^;]+?"${name}"[\\s\\S]*?\\$function\\$[\\s\\S]*?\\$function\\$;`);
  const match = sql.match(regex);
  if (match) return match[0];

  const regex2 = new RegExp(`CREATE OR REPLACE FUNCTION [^;]+?"${name}"\\([^)]*\\)[\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$;`);
  const match2 = sql.match(regex2);
  return match2 ? match2[0] : null;
}

let out = fs.readFileSync('.gemini/antigravity/brain/20022f92-278a-4cf2-9fa6-bc59048774b7/supabase_missing_rpcs.sql', 'utf8');

const gen = extractFunction('generate_order_id');
if (gen && !out.includes('generate_order_id')) {
    out += '\n\n-- 5. Create generate_order_id (for the trigger)\n' + gen + '\n';
    fs.writeFileSync('.gemini/antigravity/brain/20022f92-278a-4cf2-9fa6-bc59048774b7/supabase_missing_rpcs.sql', out);
}
