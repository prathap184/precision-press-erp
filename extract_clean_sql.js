const fs = require('fs');
const path = 'C:\\Users\\jprat\\Downloads\\schema_creates.sql';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

const targetTables = [
  'orders', 
  'order_items', 
  'profiles', 
  'tax_templates', 
  'workflow_departments', 
  'workflow_department_settings', 
  'workflow_stage_history'
];

let sqlOutput = '-- Clean restore for 7 tables with unique data only\n\n';

for (const table of targetTables) {
  const tableInserts = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('INSERT INTO') && (trimmed.includes(`"public"."${table}"`) || trimmed.includes(`public.${table} `) || trimmed.includes(`"${table}"`))) {
      let cleanLine = trimmed;
      if (!cleanLine.includes('ON CONFLICT')) {
        cleanLine = cleanLine.replace(/;$/, '') + ' ON CONFLICT DO NOTHING;';
      }
      tableInserts.add(cleanLine);
    }
  }
  
  sqlOutput += `-- ====================================\n`;
  sqlOutput += `-- TABLE: ${table} (${tableInserts.size} unique rows)\n`;
  sqlOutput += `-- ====================================\n`;
  tableInserts.forEach(ins => {
    sqlOutput += ins + '\n';
  });
  sqlOutput += '\n';
}

const outPath = 'C:\\Users\\jprat\\OneDrive\\Desktop\\Hindustan Enterprices\\clean_restore_tables.sql';
fs.writeFileSync(outPath, sqlOutput);
console.log(`Saved clean SQL to ${outPath}`);
