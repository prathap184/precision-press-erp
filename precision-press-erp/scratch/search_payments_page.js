const fs = require('fs');
const file = 'src/app/(dashboard)/accountant/payments/page.tsx';

if (fs.existsSync(file)) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('orderId') || line.includes('searchParams') || line.includes('selected') || line.includes('useEffect')) {
      console.log(`Line ${idx+1}: ${line.trim()}`);
    }
  });
} else {
  console.log('File not found:', file);
}
