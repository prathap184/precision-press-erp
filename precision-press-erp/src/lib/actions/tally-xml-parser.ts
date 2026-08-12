'use server';

import * as fs from 'fs';
import * as path from 'path';

/**
 * Parses Tally-exported XML files from the local Tally folder.
 *
 * Files used:
 *   - Master.xml   → all ledger names, parents, opening balances, GSTIN, state
 *   - GrpSum*.xml  → closing balances for each ledger
 *
 * Tally export folder: C:\Users\jprat\OneDrive\Pictures\ta;lly
 */

const TALLY_EXPORT_DIR = 'C:\\Users\\jprat\\OneDrive\\Pictures\\ta;lly';

export interface TallyLedger {
  name: string;
  parent: string;
  openingBalance: string;
  closingBalance: string;
  gstin: string;
  state: string;
}

export interface TallyMastersResult {
  contacts: TallyLedger[];
  banks: TallyLedger[];
  accounts: TallyLedger[];
  error?: string;
}

export async function getTallyMastersFromFiles(): Promise<TallyMastersResult> {
  try {
    // ─── Step 1: Parse Master.xml ──────────────────────────────────────────
    const masterPath = path.join(TALLY_EXPORT_DIR, 'Master.xml');

    if (!fs.existsSync(masterPath)) {
      return {
        contacts: [],
        banks: [],
        accounts: [],
        error: `Master.xml not found at ${TALLY_EXPORT_DIR}. Please export it from Tally first.`,
      };
    }

    const masterXml = fs.readFileSync(masterPath, 'utf16le');
    const ledgersMap = new Map<string, TallyLedger>();

    // Match each <LEDGER NAME="...">...</LEDGER> block
    const ledgerRegex = /LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER/gi;
    let match: RegExpExecArray | null;

    while ((match = ledgerRegex.exec(masterXml)) !== null) {
      const name = match[1].trim();
      const body = match[2];

      const parentM = body.match(/PARENT>([^<]*)<\/PARENT/i);
      const gstinM  = body.match(/PARTYGSTIN>([^<]*)<\/PARTYGSTIN/i);
      const stateM  = body.match(/LEDSTATENAME>([^<]*)<\/LEDSTATENAME/i);
      const balM    = body.match(/OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE/i);

      ledgersMap.set(name, {
        name,
        parent:         parentM ? parentM[1].trim() : '',
        openingBalance: balM    ? balM[1].trim()    : '0',
        closingBalance: '0',
        gstin:          gstinM  ? gstinM[1].trim()  : '',
        state:          stateM  ? stateM[1].trim()  : '',
      });
    }

    // ─── Step 2: Parse all GrpSum*.xml for closing balances ───────────────
    const grpFiles = fs.readdirSync(TALLY_EXPORT_DIR)
      .filter(f => f.toLowerCase().startsWith('grpsum'));

    for (const file of grpFiles) {
      const grpXml = fs.readFileSync(path.join(TALLY_EXPORT_DIR, file), 'utf16le');

      // Extract names, DR amounts, and CR amounts in order
      const nameRx = /DSPDISPNAME>([^<]+)<\/DSPDISPNAME/g;
      const drRx   = /DSPCLDRAMTA>([^<]*)<\/DSPCLDRAMTA/g;
      const crRx   = /DSPCLCRAMTA>([^<]*)<\/DSPCLCRAMTA/g;

      const names: string[] = [];
      const drs: string[]   = [];
      const crs: string[]   = [];

      let m: RegExpExecArray | null;
      while ((m = nameRx.exec(grpXml)) !== null) names.push(m[1].trim());
      while ((m = drRx.exec(grpXml))   !== null) drs.push(m[1].trim());
      while ((m = crRx.exec(grpXml))   !== null) crs.push(m[1].trim());

      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        // In Tally GrpSum XML:
        //   DSPCLDRAMTA = Debit side closing balance (stored as negative)
        //   DSPCLCRAMTA = Credit side closing balance (stored as positive)
        // For Sundry Debtors (assets): amount appears in CR column as positive
        // For Sundry Creditors (liabilities): amount appears in CR column as positive
        // For Bank accounts: net balance appears in appropriate column
        const dr = drs[i] ? Math.abs(parseFloat(drs[i])) : 0;
        const cr = crs[i] ? Math.abs(parseFloat(crs[i])) : 0;

        // Use CR if present, else DR (absolute)
        const finalBal = cr > 0 ? cr : dr;

        if (ledgersMap.has(name)) {
          ledgersMap.get(name)!.closingBalance = finalBal.toString();
        }
      }
    }

    // ─── Step 3: Classify ledgers ──────────────────────────────────────────
    // Using exact Tally parent group names:
    //   "Bank Accounts"  → actual bank accounts
    //   "Cash-in-Hand"   → cash / UPI / wallet accounts
    //   "Sundry Debtors" → customers
    //   "Sundry Creditors" → suppliers
    //   everything else  → chart of accounts
    const contacts: TallyLedger[] = [];
    const banks: TallyLedger[]    = [];
    const cashAccounts: TallyLedger[] = [];
    const accounts: TallyLedger[] = [];

    // Known exact bank / cash group names in Tally
    const BANK_GROUPS = ['bank accounts', 'bank o/d accounts', 'bank od accounts'];
    const CASH_GROUPS = ['cash-in-hand', 'cash in hand'];

    for (const ledger of ledgersMap.values()) {
      const parentLower = ledger.parent.toLowerCase();
      const isBank    = BANK_GROUPS.some(g => parentLower === g);
      const isCash    = CASH_GROUPS.some(g => parentLower === g);
      const isContact = ledger.parent === 'Sundry Debtors' || ledger.parent === 'Sundry Creditors';

      if (isBank)         banks.push({ ...ledger, type: 'bank' } as any);
      else if (isCash)    cashAccounts.push({ ...ledger, type: 'cash' } as any);
      else if (isContact) contacts.push(ledger);
      else                accounts.push(ledger);
    }

    // Merge cash into banks array but tagged so UI can differentiate
    const allBanks = [
      ...banks,
      ...cashAccounts,
    ];

    // Sort by closing balance desc
    contacts.sort((a, b) => Math.abs(parseFloat(b.closingBalance)) - Math.abs(parseFloat(a.closingBalance)));
    allBanks.sort((a, b) => Math.abs(parseFloat(b.closingBalance)) - Math.abs(parseFloat(a.closingBalance)));

    return { contacts, banks: allBanks, accounts };

  } catch (err: any) {
    console.error('[getTallyMastersFromFiles] Error:', err);
    return { contacts: [], banks: [], accounts: [], error: err.message };
  }
}
