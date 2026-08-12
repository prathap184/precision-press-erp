const fs = require('fs');
let content = fs.readFileSync('restore_tables_final.sql', 'utf8');

// Ensure all CREATE TABLE statements use IF NOT EXISTS
content = content.replace(/CREATE TABLE /g, 'CREATE TABLE IF NOT EXISTS ');
// Clean up any double IF NOT EXISTS that might have been created
content = content.replace(/IF NOT EXISTS IF NOT EXISTS /g, 'IF NOT EXISTS ');

fs.writeFileSync('restore_tables_idempotent.sql', content);
console.log('Fixed file created as restore_tables_idempotent.sql');
