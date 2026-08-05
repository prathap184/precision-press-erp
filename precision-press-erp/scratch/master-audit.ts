import fs from 'fs';
import path from 'path';

const dubblDir = "C:\\Users\\jprat\\OneDrive\\Desktop\\Dubbl";
const erpDir = "C:\\Users\\jprat\\OneDrive\\Desktop\\Hindustan Enterprices\\precision-press-erp";

function getFilesRecursively(dir: string, baseDir: string = dir): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const fullPath = path.join(dir, item);
    const relPath = path.relative(baseDir, fullPath);
    
    // Ignore node_modules, .git, .next, pnpm-lock, build artifacts
    if (
      relPath.startsWith('node_modules') ||
      relPath.startsWith('.git') ||
      relPath.startsWith('.next') ||
      relPath.startsWith('.env') ||
      relPath === 'pnpm-lock.yaml'
    ) {
      continue;
    }
    
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath, baseDir));
    } else {
      results.push(relPath);
    }
  }
  return results;
}

const dubblFiles = getFilesRecursively(dubblDir);
const missingFiles: string[] = [];
const presentFiles: string[] = [];

for (const rel of dubblFiles) {
  const norm = rel.replace(/\\/g, '/');
  
  let candidates: string[] = [];

  if (norm.startsWith('app/')) {
    const subApp = norm.substring(4);
    const cleanSubApp = subApp
      .replace(/^\(dashboard\)\//, '')
      .replace(/^\(onboarding\)\//, '')
      .replace(/^\(landing\)\//, '')
      .replace(/^\(admin\)\//, '')
      .replace(/^\(auth\)\//, '');

    candidates.push(path.join(erpDir, 'src', 'app', subApp));
    candidates.push(path.join(erpDir, 'src', 'app', '(dashboard)', 'accounting', cleanSubApp));
    candidates.push(path.join(erpDir, 'src', 'app', '(onboarding)', cleanSubApp));
    candidates.push(path.join(erpDir, 'src', 'app', '(landing)', cleanSubApp));
    candidates.push(path.join(erpDir, 'src', 'app', cleanSubApp));
  } else if (
    norm.startsWith('components/') ||
    norm.startsWith('lib/') ||
    norm.startsWith('hooks/') ||
    norm.startsWith('types/') ||
    norm.startsWith('styles/') ||
    norm.startsWith('trigger/') ||
    norm.startsWith('tests/')
  ) {
    candidates.push(path.join(erpDir, 'src', norm));
    candidates.push(path.join(erpDir, norm));
  } else {
    candidates.push(path.join(erpDir, norm));
  }

  const exists = candidates.some(c => fs.existsSync(c));
  if (exists) {
    presentFiles.push(rel);
  } else {
    missingFiles.push(rel);
  }
}

console.log("=============================================");
console.log("     MASTER DUBBL VS ERP COMPREHENSIVE AUDIT ");
console.log("=============================================");
console.log(`Total Dubbl Files Audited : ${dubblFiles.length}`);
console.log(`Present in ERP Codebase   : ${presentFiles.length}`);
console.log(`Missing Files in ERP      : ${missingFiles.length}`);
console.log("---------------------------------------------");

if (missingFiles.length > 0) {
  console.log("Detailed List of Missing Files:");
  missingFiles.forEach(f => console.log(` [MISSING] -> ${f}`));
} else {
  console.log("🎉 100% PERFECT MATCH! Every single Dubbl file exists in ERP.");
}
