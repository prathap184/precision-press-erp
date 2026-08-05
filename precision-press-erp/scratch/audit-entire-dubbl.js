const fs = require('fs');
const path = require('path');

const dubblRoot = 'C:\\Users\\jprat\\OneDrive\\Desktop\\Dubbl';
const erpRoot = 'C:\\Users\\jprat\\OneDrive\\Desktop\\Hindustan Enterprices\\precision-press-erp';

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

const dubblTopDirs = fs.readdirSync(dubblRoot).filter(item => {
  const full = path.join(dubblRoot, item);
  return fs.statSync(full).isDirectory() && !item.startsWith('.') && item !== 'node_modules' && item !== '.next';
});

console.log('===========================================================');
console.log('ENTIRE DUBBL REPOSITORY vs ERP FULL CODEBASE PAKKA AUDIT');
console.log('===========================================================\n');

let totalDubblFiles = 0;
let totalMissingFiles = 0;

dubblTopDirs.forEach(dir => {
  const dirPath = path.join(dubblRoot, dir);
  const files = getAllFiles(dirPath);
  totalDubblFiles += files.length;

  let missing = [];
  files.forEach(relFile => {
    // Search if this file exists anywhere in ERP src or root
    const target1 = path.join(erpRoot, 'src', dir, relFile);
    const target2 = path.join(erpRoot, 'src', 'app', '(dashboard)', 'accounting', dir, relFile);
    const target3 = path.join(erpRoot, dir, relFile);
    const target4 = path.join(erpRoot, 'src', relFile);

    const basename = path.basename(relFile);
    
    // Check direct match or existence by relative path
    let found = fs.existsSync(target1) || fs.existsSync(target2) || fs.existsSync(target3) || fs.existsSync(target4);
    
    if (!found) {
      missing.push(relFile);
    }
  });

  totalMissingFiles += missing.length;
  console.log(`📁 Directory: /${dir} (${files.length} files in Dubbl)`);
  console.log(`   ✅ Matched/Found: ${files.length - missing.length}`);
  console.log(`   ❌ Missing: ${missing.length}`);
  if (missing.length > 0 && missing.length <= 10) {
    console.log('   Missing files:', missing);
  } else if (missing.length > 10) {
    console.log('   Missing samples (first 10):', missing.slice(0, 10));
  }
  console.log('');
});

console.log(`TOTAL DUBBL FILES ANALYZED: ${totalDubblFiles}`);
console.log(`TOTAL MISSING FILES: ${totalMissingFiles}`);
