const fs = require('fs');

async function generateSchema() {
  const url = "https://arffwmwpimdmhgmylpzi.supabase.co/rest/v1/";
  const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyZmZ3bXdwaW1kbWhnbXlscHppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDI2NDcsImV4cCI6MjA5NTcxODY0N30.bp4kO4AElTX8k3b5lF5slkaLMN4kOluVQ7TzSrj6oEg";
  
  try {
    const response = await fetch(url, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    const data = await response.json();
    
    const schemas = data.definitions || (data.components && data.components.schemas);
    if (!schemas) {
        console.error("Could not find schemas in data. Keys are:", Object.keys(data));
        console.error("Data:", data);
        process.exit(1);
    }

    let md = '# Database Schema\n\n';
    for (const [tableName, definition] of Object.entries(schemas)) {
      md += `## Table: \`${tableName}\`\n\n`;
      if (definition.description) md += `*${definition.description}*\n\n`;
      md += '| Column | Type | Format | Default | Description |\n';
      md += '|---|---|---|---|---|\n';
      for (const [colName, colDef] of Object.entries(definition.properties || {})) {
        const type = colDef.type || 'any';
        const format = colDef.format || '';
        const desc = (colDef.description || '').replace(/\n/g, ' ');
        const def = colDef.default || '';
        md += `| \`${colName}\` | ${type} | ${format} | ${def} | ${desc} |\n`;
      }
      md += '\n';
    }
    fs.writeFileSync('database_schema.md', md);
    console.log('Schema generated successfully!');
  } catch (e) {
    console.error("Failed to generate schema", e);
    process.exit(1);
  }
}

generateSchema();
