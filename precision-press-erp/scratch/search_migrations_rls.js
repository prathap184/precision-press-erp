const fs = require('fs');
const path = require('path');

const dir = path.resolve('supabase', 'migrations');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));

files.forEach(file => {
  const content = fs.readFileSync(path.join(dir, file), 'utf8');
  if (content.toLowerCase().includes('row level security') || content.toLowerCase().includes('enable rls')) {
    console.log(`\n=== RLS enabled/altered in ${file} ===`);
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes('row level security') || line.toLowerCase().includes('rls') || line.toLowerCase().includes('orders') || line.toLowerCase().includes('policy')) {
        console.log(`${index + 1}: ${line.trim()}`);
      }
    });
  }
});
