const fs = require('fs');
const path = require('path');
const file = fs.readFileSync(path.resolve(__dirname, '../ALL_582_ITEMS_DIRECT_VS_NONDIRECT.md'), 'utf8');

console.log('File length:', file.length);
console.log('Sample direct lines:');
console.log(file.split('\n').slice(0, 30).join('\n'));
