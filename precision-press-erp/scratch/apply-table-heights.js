const fs = require('fs');
const ledger = 'src/components/ledger/LedgerDetailView.tsx';
if (fs.existsSync(ledger)) {
  let content = fs.readFileSync(ledger, 'utf8');
  content = content.replace(/<tr([^>]*)className="([^"]*?)"/g, (m, p1, p2) => {
    if (!p2.includes('h-') && !p2.includes('bg-slate-50 text-')) return `<tr${p1}className="${p2} h-9"`;
    return m;
  });
  fs.writeFileSync(ledger, content);
}
const printer = 'src/components/orders/PrinterOrderWorkspace.tsx';
if (fs.existsSync(printer)) {
  let content = fs.readFileSync(printer, 'utf8');
  content = content.replace(/<tr([^>]*)className="([^"]*?)"/g, (m, p1, p2) => {
    if (!p2.includes('h-') && !p2.includes('bg-slate-50 text-')) return `<tr${p1}className="${p2} h-12"`;
    return m;
  });
  fs.writeFileSync(printer, content);
}
const manager = 'src/components/orders/ManagerOrderWorkspace.tsx';
if (fs.existsSync(manager)) {
  let content = fs.readFileSync(manager, 'utf8');
  content = content.replace(/<tr([^>]*)className="([^"]*?)"/g, (m, p1, p2) => {
    if (!p2.includes('h-') && !p2.includes('bg-slate-50 text-')) return `<tr${p1}className="${p2} h-12"`;
    return m;
  });
  fs.writeFileSync(manager, content);
}
console.log('Updated table heights');
