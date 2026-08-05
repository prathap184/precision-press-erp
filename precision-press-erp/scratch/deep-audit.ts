import fs from 'fs';
import path from 'path';

const dubblDir = "C:\\Users\\jprat\\OneDrive\\Desktop\\Dubbl";
const erpDir = "C:\\Users\\jprat\\OneDrive\\Desktop\\Hindustan Enterprices\\precision-press-erp";

function getAllFiles(dir: string, baseDir: string = dir): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    const rel = path.relative(baseDir, filePath);
    
    if (rel.startsWith('node_modules') || rel.startsWith('.git') || rel.startsWith('.next') || rel === 'pnpm-lock.yaml' || rel.startsWith('.env')) {
      continue;
    }
    
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(filePath, baseDir));
    } else {
      results.push(rel);
    }
  }
  return results;
}

const dubblFiles = getAllFiles(dubblDir);
const missingFiles: string[] = [];

for (const file of dubblFiles) {
  const norm = file.replace(/\\/g, '/');
  
  if (norm.startsWith('app/')) {
    const subApp = norm.substring(4); // e.g. (dashboard)/reports/page.tsx
    const cleanSubApp = subApp.replace(/^\(dashboard\)\//, '').replace(/^\(onboarding\)\//, '').replace(/^\(landing\)\//, '');
    
    const t1 = path.join(erpDir, 'src', 'app', subApp);
    const t2 = path.join(erpDir, 'src', 'app', '(dashboard)', 'accounting', cleanSubApp);
    const t3 = path.join(erpDir, 'src', 'app', '(onboarding)', cleanSubApp);
    const t4 = path.join(erpDir, 'src', 'app', cleanSubApp);
    
    if (!fs.existsSync(t1) && !fs.existsSync(t2) && !fs.existsSync(t3) && !fs.existsSync(t4)) {
      missingFiles.push(file);
    }
  } else if (norm.startsWith('components/') || norm.startsWith('lib/') || norm.startsWith('hooks/') || norm.startsWith('types/') || norm.startsWith('styles/')) {
    const targetPath = path.join(erpDir, 'src', norm);
    if (!fs.existsSync(targetPath)) {
      missingFiles.push(file);
    }
  } else {
    const targetPath = path.join(erpDir, norm);
    if (!fs.existsSync(targetPath)) {
      missingFiles.push(file);
    }
  }
}

console.log(`Deep Recursive Audit Results:`);
console.log(`Total Dubbl Files Scanned: ${dubblFiles.length}`);
console.log(`Total Missing Files in ERP: ${missingFiles.length}`);
if (missingFiles.length > 0) {
  missingFiles.forEach(f => console.log(` - MISSING: ${f}`));
}
