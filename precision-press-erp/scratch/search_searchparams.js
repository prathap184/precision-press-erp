const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.next')) {
        results = results.concat(walk(file));
      }
    } else {
      results.push(file);
    }
  });
  return results;
}

const files = walk('src');
files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('useSearchParams')) {
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('orderId') || line.includes('get(')) {
        console.log(`${file}:${idx+1}: ${line.trim()}`);
      }
    });
  }
});
