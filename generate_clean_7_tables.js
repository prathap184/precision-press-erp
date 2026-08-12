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

let sqlOutput = `-- ========================================================\n`;
sqlOutput += `-- CLEAN RESTORE SCRIPT FOR 7 TABLES WITH PRIMARY KEYS\n`;
sqlOutput += `-- ========================================================\n\n`;

// Set default UUID generator for tables so missing IDs automatically get generated
sqlOutput += `-- 1. ENSURE DEFAULT UUID FOR MISSING IDs\n`;
sqlOutput += `ALTER TABLE public.workflow_department_settings ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;\n`;
sqlOutput += `UPDATE public.workflow_department_settings SET id = department_id WHERE id IS NULL;\n`;
sqlOutput += `\n`;

// Step 1: Cleanup NULL ids & duplicates
sqlOutput += `-- 2. CLEANUP NULL IDs AND EXISTING DUPLICATES\n`;
for (const t of targetTables) {
  sqlOutput += `DELETE FROM public.${t} WHERE id IS NULL;\n`;
  sqlOutput += `DELETE FROM public.${t} a USING public.${t} b WHERE a.ctid < b.ctid AND a.id = b.id;\n`;
}
sqlOutput += `\n`;

// Step 2: Add PRIMARY KEY constraints if not already set
sqlOutput += `-- 3. ENSURE PRIMARY KEYS EXIST\n`;
for (const t of targetTables) {
  sqlOutput += `DO $$ BEGIN\n`;
  sqlOutput += `  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${t}_pkey') THEN\n`;
  sqlOutput += `    ALTER TABLE public.${t} ADD PRIMARY KEY (id);\n`;
  sqlOutput += `  END IF;\n`;
  sqlOutput += `END $$;\n`;
}
sqlOutput += `\n`;

// Step 3: Insert unique data
sqlOutput += `-- 4. INSERT CLEAN DEDUPLICATED DATA\n`;
for (const table of targetTables) {
  const tableInserts = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('INSERT INTO') && (trimmed.includes(`"public"."${table}"`) || trimmed.includes(`public.${table} `) || trimmed.includes(`"${table}"`))) {
      if (trimmed.includes('"public"."stats"')) continue;
      
      let cleanLine = trimmed;
      // Fix missing ID for workflow_department_settings in INSERT if needed
      if (table === 'workflow_department_settings' && cleanLine.includes('"department_id"') && !cleanLine.includes('"id"')) {
        cleanLine = cleanLine.replace('("department_id"', '("id", "department_id"');
        cleanLine = cleanLine.replace("VALUES ('", "VALUES ('");
        // Insert department_id value as id as well
        const match = cleanLine.match(/VALUES \('([^']+)'/);
        if (match) {
          const deptId = match[1];
          cleanLine = cleanLine.replace(`VALUES ('${deptId}'`, `VALUES ('${deptId}', '${deptId}'`);
        }
      }

      if (!cleanLine.includes('ON CONFLICT')) {
        cleanLine = cleanLine.replace(/;$/, '') + ' ON CONFLICT DO NOTHING;';
      }
      tableInserts.add(cleanLine);
    }
  }
  
  sqlOutput += `-- ------------------------------------\n`;
  sqlOutput += `-- Data for ${table} (${tableInserts.size} unique rows)\n`;
  sqlOutput += `-- ------------------------------------\n`;
  tableInserts.forEach(ins => {
    sqlOutput += ins + '\n';
  });
  sqlOutput += '\n';
}

const outPath = 'C:\\Users\\jprat\\OneDrive\\Desktop\\Hindustan Enterprices\\restore_7_tables_clean.sql';
fs.writeFileSync(outPath, sqlOutput);
console.log(`Successfully updated ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(2)} KB)`);
