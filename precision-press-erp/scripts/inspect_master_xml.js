const fs = require('fs');

const srcPath = 'C:\\tally\\Master.xml';

try {
  const stats = fs.statSync(srcPath);
  console.log(`File size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);

  // Read as utf16le
  const rawUtf16 = fs.readFileSync(srcPath, 'utf16le');
  console.log('Read successfully! String length:', rawUtf16.length);
  console.log('First 400 chars:\n', rawUtf16.slice(0, 400));

  // Count groups, ledgers, stock items
  const groups = rawUtf16.match(/<GROUP\s+NAME="([^"]*)"/gi) || [];
  const ledgers = rawUtf16.match(/<LEDGER\s+NAME="([^"]*)"/gi) || [];
  const stockItems = rawUtf16.match(/<STOCKITEM\s+NAME="([^"]*)"/gi) || [];
  const units = rawUtf16.match(/<UNIT\s+NAME="([^"]*)"/gi) || [];

  console.log('\n--- 📊 CONTENTS OF C:\\tally\\Master.xml ---');
  console.log(` • Groups     : ${groups.length}`);
  console.log(` • Ledgers    : ${ledgers.length}`);
  console.log(` • Stock Items: ${stockItems.length}`);
  console.log(` • Units      : ${units.length}`);

} catch (err) {
  console.error('Error reading C:\\tally\\Master.xml:', err.message);
}
