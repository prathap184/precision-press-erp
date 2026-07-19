import * as fs from 'fs';
import * as path from 'path';

const searchDir = path.resolve('src');

function walkDir(dir: string, callback: (filePath: string) => void) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, callback);
    } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      callback(filePath);
    }
  }
}

console.log('Searching for files with STATUS_CONFIG, PROGRESS or PLACED in src/...');
const matches: string[] = [];
walkDir(searchDir, (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('STATUS_CONFIG') || content.includes('PAYMENT_VERIFIED') || content.includes('PLACED: 10')) {
    matches.push(filePath);
  }
});

console.log('Found matches:');
matches.forEach(m => console.log('  ', m));
