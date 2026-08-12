const fs = require('fs');
let content = fs.readFileSync('restore_tables_fixed.sql', 'utf8');

// Replace '{"__kind":"serverTimestamp"}' with NOW()
content = content.replace(/'\{\"__kind\":\"serverTimestamp\"\}'/g, 'NOW()');

fs.writeFileSync('restore_tables_final.sql', content);
console.log('Fixed file created as restore_tables_final.sql');
