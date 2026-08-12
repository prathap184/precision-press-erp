const fs = require('fs');
let content = fs.readFileSync('generate_perfect_restore.js', 'utf8');
content = content.replace("alterStmt = alterStmt.replace(/ NOT NULL/g, ''); // strip NOT NULL from alters too", "");
fs.writeFileSync('generate_perfect_restore.js', content);

console.log('Fixed generator script');
