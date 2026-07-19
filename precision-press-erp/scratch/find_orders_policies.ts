import * as fs from 'fs';
import * as path from 'path';

const migrationsDir = path.resolve('supabase', 'migrations');

const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

console.log('Searching migrations for policies on orders table...');
for (const file of files) {
  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  if (content.toLowerCase().includes('policy') && content.toLowerCase().includes('orders')) {
    console.log(`\n--- Found in ${file} ---`);
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes('policy') && line.toLowerCase().includes('orders')) {
        console.log(`${index + 1}: ${line.trim()}`);
      }
    });
  }
}
