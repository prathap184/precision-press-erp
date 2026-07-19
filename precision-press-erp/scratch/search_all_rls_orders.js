const fs = require('fs');
const path = require('path');

const dir = path.resolve('supabase', 'migrations');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));

console.log('Searching for RLS enablement on orders table...');
files.forEach(file => {
  const content = fs.readFileSync(path.join(dir, file), 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (line.toLowerCase().includes('orders') && (line.toLowerCase().includes('row level security') || line.toLowerCase().includes('rls'))) {
      console.log(`${file}:${index + 1}: ${line.trim()}`);
    }
  });
});
