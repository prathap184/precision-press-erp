const fs = require('fs');
const path = require('path');

const typesDir = 'src/types';
const files = fs.readdirSync(typesDir).filter(f => f.endsWith('.ts'));

let md = '# Database Schema (from TypeScript Interfaces)\n\n';

for (const file of files) {
  const content = fs.readFileSync(path.join(typesDir, file), 'utf8');
  
  // Regex to match interfaces
  const interfaceRegex = /export\s+interface\s+(\w+)(?:\s+extends\s+[^{]+)?\s*\{([\s\S]*?)\n\}/g;
  
  let match;
  while ((match = interfaceRegex.exec(content)) !== null) {
    const interfaceName = match[1];
    const body = match[2];
    
    md += `## Table / Interface: \`${interfaceName}\`\n\n`;
    md += '| Field | Type | Description |\n';
    md += '|---|---|---|\n';
    
    // Naive parsing of properties
    const lines = body.split('\n');
    let inComment = false;
    
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('//')) continue;
      if (line.startsWith('/*')) {
        inComment = true;
      }
      if (inComment) {
        if (line.includes('*/')) inComment = false;
        continue;
      }
      
      // Stop if we hit a nested object definition (very naive)
      // Actually we'll just try to match basic properties
      // e.g. `id: string; // comment`
      const propMatch = line.match(/^(\w+\??)\s*:\s*(.+?)(?:;|,)?\s*(?:\/\/(.*))?$/);
      if (propMatch) {
        let fieldName = propMatch[1];
        let type = propMatch[2];
        let description = (propMatch[3] || '').trim();
        md += `| \`${fieldName}\` | \`${type}\` | ${description} |\n`;
      }
    }
    md += '\n';
  }
}

fs.writeFileSync('database_schema_ts.md', md);
console.log('Done!');
