const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

function processFile(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // 1. Inputs & Buttons (h-9, h-10, h-[36px] -> h-11)
  // Usually classes like px-4 py-2 or h-10 inside a button or input
  content = content.replace(/className="([^"]*?)\b(h-9|h-10|h-\[36px\]|py-2|py-2\.5)\b([^"]*?)(input|button|select)/gi, 'className="$1h-11$3$4');
  content = content.replace(/<(button|input|select)([^>]*)className="([^"]*?)\b(h-9|h-10|h-\[36px\]|py-2|py-2\.5)\b([^"]*?)"/gi, '<$1$2className="$3h-11$5"');
  
  // Update button rounding
  content = content.replace(/<(button)([^>]*)className="([^"]*?)\b(rounded-md|rounded-xl|rounded-full)\b([^"]*?)"/gi, '<$1$2className="$3rounded-lg$5"');
  
  // Update input rounding
  content = content.replace(/<(input|select)([^>]*)className="([^"]*?)\b(rounded-md|rounded-xl|rounded-full)\b([^"]*?)"/gi, '<$1$2className="$3rounded-lg$5"');

  // 2. Cards (rounded-xl -> rounded-2xl)
  // Look for common card patterns
  content = content.replace(/className="([^"]*?bg-white[^"]*?border[^"]*?)\brounded-xl\b([^"]*?)"/gi, 'className="$1rounded-2xl$2"');

  // 3. Modals (rounded-2xl -> rounded-[20px])
  content = content.replace(/className="([^"]*?bg-white[^"]*?(?:fixed|absolute)[^"]*?)\b(rounded-2xl|rounded-xl)\b([^"]*?)"/gi, 'className="$1rounded-[20px]$3"');

  // 4. Role specific - let's handle this in specific files manually for safety, 
  // but we can apply standard tabular-nums to table cells
  content = content.replace(/<(td)([^>]*)className="([^"]*?)"/gi, (match, p1, p2, p3) => {
      if (!p3.includes('tabular-nums')) {
          return `<${p1}${p2}className="${p3} tabular-nums"`;
      }
      return match;
  });

  // 5. Page titles (text-xl, text-2xl -> text-[28px])
  content = content.replace(/<h1([^>]*)className="([^"]*?)\b(text-xl|text-2xl)\b([^"]*?)"/gi, '<h1$1className="$2text-[28px] font-bold$4"');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

walk(srcDir, processFile);
console.log('Done typography update script.');
