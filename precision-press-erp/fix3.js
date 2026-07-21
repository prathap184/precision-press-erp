const fs = require('fs');
const path = 'src/lib/actions/registers.ts';
let code = fs.readFileSync(path, 'utf8');

const regex = /\/\/ 5\. Merge and sort newest first/;
const replacement = `// 4.5 Fetch contra entries
  const { data: contraEntries } = await supabaseServer
    .from('contra_entries')
    .select('*')
    .order('created_at', { ascending: false });

  const contraRows = (contraEntries || []).map(c => ({
    id: \`ce-\${c.id}\`,
    date: c.contra_date || c.created_at,
    voucherType: 'CONTRA',
    voucherNo: c.contra_number || String(c.id),
    party: c.remarks || \`\${c.source_ledger} -> \${c.target_ledger}\`,
    paymentMode: null,
    amount: Number(c.amount) || 0,
    debit: Number(c.amount) || 0,
    credit: Number(c.amount) || 0,
    status: c.status || 'Submitted',
    refId: c.contra_number,
    invoiceId: undefined,
  }));

  // 5. Merge and sort newest first`;

if (regex.test(code)) {
  code = code.replace(regex, replacement);
  code = code.replace('const allRows = [...rows, ...payRows].sort(', 'const allRows = [...rows, ...payRows, ...contraRows].sort(');
  fs.writeFileSync(path, code);
  console.log('SUCCESS');
} else {
  console.log('NOT FOUND');
}
