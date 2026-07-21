const fs = require('fs');
const path = 'src/app/(dashboard)/admin/treasury/create/page.tsx';
let code = fs.readFileSync(path, 'utf8');

const regexImports = /import React, \{ useState \} from 'react';/;
code = code.replace(regexImports, "import React, { useState, useEffect } from 'react';\nimport { supabaseBrowser } from '@/lib/supabase-browser';");

const targetRegex = /  const \[fetchingBalances, setFetchingBalances\] = useState\(false\);[\s\S]*?const handleSubmit = async \(\) => \{/;

const replacement = `  const [fetchingBalances, setFetchingBalances] = useState(false);
  const [cashBalance, setCashBalance] = useState<number | null>(null);
  const [bankBalance, setBankBalance] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const fetchInternalBalances = async () => {
    setFetchingBalances(true);
    setSyncStatus('Fetching internal balances...');
    try {
      const { data: cashData } = await supabaseBrowser
        .from('company_cash_ledger')
        .select('balance_after')
        .order('created_at', { ascending: false })
        .limit(1);

      const { data: bankData } = await supabaseBrowser
        .from('company_bank_ledger')
        .select('balance_after')
        .order('created_at', { ascending: false })
        .limit(1);

      if (cashData && cashData.length > 0) {
        setCashBalance(cashData[0].balance_after);
      } else {
        setCashBalance(0);
      }
      
      if (bankData && bankData.length > 0) {
        setBankBalance(bankData[0].balance_after);
      } else {
        setBankBalance(0);
      }
      
      setSyncStatus('Internal balances loaded.');
    } catch (err: any) {
      setSyncStatus(\`Error: \${err.message}\`);
    } finally {
      setFetchingBalances(false);
    }
  };

  useEffect(() => {
    fetchInternalBalances();
  }, []);

  const handleSubmit = async () => {`;

if (targetRegex.test(code)) {
  fs.writeFileSync(path, code.replace(targetRegex, replacement));
  console.log('SUCCESS_REPLACEMENT');
} else {
  console.log('REGEX_NOT_FOUND');
}
