const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk(path.join(__dirname, '../src'));
const broken = [];

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('<ArrowUpRight') || content.includes('ArrowUpRight')) {
    // Check if ArrowUpRight is imported
    const hasImport = content.includes("ArrowUpRight") && (
      content.includes("import") && content.indexOf("ArrowUpRight") < content.indexOf("return")
    );
    // Simple regex for import { ... ArrowUpRight ... } from
    const matchImport = /import\s+[\s\S]*?ArrowUpRight[\s\S]*?from\s+['"][^'"]+['"]/.test(content);
    if (!matchImport) {
      broken.push(file);
    }
  }
});

console.log("Broken files missing ArrowUpRight import:", broken);
