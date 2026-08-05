const fs = require('fs');
const path = require('path');

const dubblApp = 'C:\\Users\\jprat\\OneDrive\\Desktop\\Dubbl\\app';
const erpApp = 'C:\\Users\\jprat\\OneDrive\\Desktop\\Hindustan Enterprices\\precision-press-erp\\src\\app';

function getAllFiles(dirPath, arrayOfFiles = [], baseDir = dirPath) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles, baseDir);
    } else {
      arrayOfFiles.push(path.relative(baseDir, fullPath));
    }
  });

  return arrayOfFiles;
}

const topFolders = [
  '(admin)',
  '(auth)',
  '(dashboard)',
  '(landing)',
  '(onboarding)',
  '.well-known',
  'api',
  'docs',
  'pay',
  'portal',
  'sign'
];

console.log('====================================================');
console.log('DUBBL APP vs ERP SRC/APP COMPREHENSIVE FOLDER AUDIT');
console.log('====================================================\n');

topFolders.forEach(folder => {
  const dubblFolder = path.join(dubblApp, folder);
  const dubblFiles = getAllFiles(dubblFolder);

  console.log(`--- Folder: ${folder} (${dubblFiles.length} files in Dubbl) ---`);

  if (folder === '(dashboard)') {
    // Check how many dashboard files are present under src/app/(dashboard)/accounting or elsewhere
    let copiedToAccounting = 0;
    let missing = [];
    dubblFiles.forEach(f => {
      // Dubbl dashboard route -> ERP accounting route or ERP (dashboard) route
      const erpPath1 = path.join(erpApp, '(dashboard)', 'accounting', f);
      const erpPath2 = path.join(erpApp, '(dashboard)', f);
      const erpPath3 = path.join(erpApp, f);

      if (fs.existsSync(erpPath1) || fs.existsSync(erpPath2) || fs.existsSync(erpPath3)) {
        copiedToAccounting++;
      } else {
        missing.push(f);
      }
    });
    console.log(`  ✅ Existing in ERP: ${copiedToAccounting} files`);
    console.log(`  ❌ Missing in ERP: ${missing.length} files`);
    if (missing.length > 0) {
      console.log('  Missing samples:', missing.slice(0, 10));
    }
  } else {
    // Check direct location under src/app/
    let existsCount = 0;
    let missing = [];
    dubblFiles.forEach(f => {
      const erpPathDirect = path.join(erpApp, folder, f);
      const erpPathAccounting = path.join(erpApp, '(dashboard)', 'accounting', folder, f);
      const erpPathDash = path.join(erpApp, '(dashboard)', folder, f);

      if (fs.existsSync(erpPathDirect) || fs.existsSync(erpPathAccounting) || fs.existsSync(erpPathDash)) {
        existsCount++;
      } else {
        missing.push(f);
      }
    });
    console.log(`  ✅ Existing in ERP: ${existsCount} files`);
    console.log(`  ❌ Missing in ERP: ${missing.length} files`);
    if (missing.length > 0) {
      console.log('  Missing list:', missing);
    }
  }
  console.log('');
});
