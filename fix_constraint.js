const fs = require('fs');
let content = fs.readFileSync('generate_perfect_restore.js', 'utf8');
content = content.replace("if (!alterStmt.endsWith(';')) alterStmt += ';';", "if (alterStmt.includes('ADD CONSTRAINT')) continue;\n      if (!alterStmt.endsWith(';')) alterStmt += ';';");
fs.writeFileSync('generate_perfect_restore.js', content);
console.log('Fixed ADD CONSTRAINT issue');
