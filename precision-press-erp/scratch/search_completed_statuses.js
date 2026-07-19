const fs = require('fs');
const path = require('path');

const srcDir = path.resolve('src');

function walk(dir, callback) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, callback);
    } else if (full.endsWith('.ts') || full.endsWith('.tsx') || full.endsWith('.js') || full.endsWith('.jsx')) {
      callback(full);
    }
  });
}

console.log('Searching for completed status arrays/lists...');
walk(srcDir, filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (
      (line.includes('COMPLETED') && line.includes('DISPATCHED')) ||
      (line.includes('status') && line.includes('in') && line.includes('COMPLETED')) ||
      line.includes("status === 'COMPLETED'") ||
      line.includes('status === "COMPLETED"')
    ) {
      // Print context
      console.log(`${filePath}:${idx + 1}: ${line.trim()}`);
    }
  });
});
