const fs = require('fs');
let content = fs.readFileSync('generate_perfect_restore.js', 'utf8');

// We need to inject the IF NOT EXISTS logic for ADD COLUMN in the ALTER statements
// Let's just find the part where it adds the alterStmt
const replacement = `
      if (alterStmt.includes('ADD CONSTRAINT')) continue;
      alterStmt = alterStmt.replace(/ADD COLUMN /g, 'ADD COLUMN IF NOT EXISTS ');
      alterStmt = alterStmt.replace(/IF NOT EXISTS IF NOT EXISTS/g, 'IF NOT EXISTS');
      alterStmt = alterStmt.replace(/--> statement-breakpoint;/g, '');
      if (!alterStmt.endsWith(';')) alterStmt += ';';
`;
content = content.replace("if (alterStmt.includes('ADD CONSTRAINT')) continue;\n      if (!alterStmt.endsWith(';')) alterStmt += ';';", replacement);

fs.writeFileSync('generate_perfect_restore.js', content);
console.log('Fixed ADD COLUMN IF NOT EXISTS issue');
