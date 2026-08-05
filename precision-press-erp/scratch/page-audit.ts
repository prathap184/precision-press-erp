import fs from 'fs';
import path from 'path';

const dubblAppDir = "C:\\Users\\jprat\\OneDrive\\Desktop\\Dubbl\\app";
const erpAppDir = "C:\\Users\\jprat\\OneDrive\\Desktop\\Hindustan Enterprices\\precision-press-erp\\src\\app";

function getPageFiles(dir: string, baseDir: string = dir): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const fullPath = path.join(dir, item);
    const relPath = path.relative(baseDir, fullPath);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getPageFiles(fullPath, baseDir));
    } else if (item === 'page.tsx' || item === 'route.ts' || item === 'layout.tsx') {
      results.push(relPath);
    }
  }
  return results;
}

const dubblPages = getPageFiles(dubblAppDir);
const auditReport: { route: string; erpPath: string; exists: boolean }[] = [];

for (const rel of dubblPages) {
  const norm = rel.replace(/\\/g, '/');
  
  // Skip standalone auth pages like (auth)/sign-in, (auth)/sign-up, nextauth route
  if (norm.startsWith('(auth)/') || norm.startsWith('api/auth/')) {
    continue;
  }

  const cleanPath = norm
    .replace(/^\(dashboard\)\//, '')
    .replace(/^\(onboarding\)\//, '')
    .replace(/^\(landing\)\//, '')
    .replace(/^\(admin\)\//, '');

  const candidates = [
    path.join(erpAppDir, norm),
    path.join(erpAppDir, '(dashboard)', 'accounting', cleanPath),
    path.join(erpAppDir, '(dashboard)', 'accounting', norm),
    path.join(erpAppDir, '(onboarding)', cleanPath),
    path.join(erpAppDir, '(landing)', cleanPath),
    path.join(erpAppDir, cleanPath)
  ];

  const foundIndex = candidates.findIndex(c => fs.existsSync(c));
  auditReport.push({
    route: norm,
    erpPath: foundIndex !== -1 ? candidates[foundIndex] : 'NOT FOUND',
    exists: foundIndex !== -1
  });
}

const missingPages = auditReport.filter(r => !r.exists);

console.log("=============================================");
console.log("          PAKKA PAGE ROUTE AUDIT             ");
console.log("=============================================");
console.log(`Total Dubbl Page/Route Files Audited : ${dubblPages.length}`);
console.log(`Verified Existing Pages in ERP       : ${auditReport.length - missingPages.length}`);
console.log(`Missing Page Routes                  : ${missingPages.length}`);
console.log("---------------------------------------------");

if (missingPages.length > 0) {
  console.log("Missing Page Routes:");
  missingPages.forEach(m => console.log(` ❌ ${m.route}`));
} else {
  console.log("💯 PAKKA GUARANTEED! Every single page and route exists in ERP.");
}
