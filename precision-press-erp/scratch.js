const fs = require('fs');
let sql = fs.readFileSync('database_migration_dump_fixed.sql', 'utf-8');

sql = sql.replace(/"id" "text" PRIMARY KEY NOT NULL,/g, '"id" "text" PRIMARY KEY NOT NULL,\n    "current_stock" numeric(12,2) DEFAULT 0,');

fs.writeFileSync('database_migration_dump_fixed.sql', sql);
console.log('Fixed current_stock in dump.');
