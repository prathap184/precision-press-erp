import { NextRequest, NextResponse } from 'next/server';

// ─── Tally parent group classifiers ───────────────────────────────────────────
const BANK_GROUPS  = ['bank accounts', 'bank od a/c', 'bank od accounts'];
const CASH_GROUPS  = ['cash-in-hand', 'cash in hand'];
const CONTACT_GROUPS = ['sundry debtors', 'sundry creditors'];

function classify(parent: string): 'contact' | 'bank' | 'cash' | 'account' {
  const p = parent.toLowerCase().trim();
  if (CONTACT_GROUPS.includes(p)) return 'contact';
  if (BANK_GROUPS.includes(p))    return 'bank';
  if (CASH_GROUPS.includes(p))    return 'cash';
  return 'account';
}

function parseAmount(raw: string): number {
  if (!raw) return 0;
  // Tally uses negative = Dr (we owe), positive = Cr (they owe)
  const n = parseFloat(raw.replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? 0 : Math.abs(n);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('master') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded. Please upload Master.xml' }, { status: 400 });
    }

    // Read file content as text — try UTF-16 LE first (Tally default), fallback to UTF-8
    const buffer  = await file.arrayBuffer();
    let xmlText: string;

    try {
      xmlText = new TextDecoder('utf-16le').decode(buffer);
      // sanity check — if no LEDGER tag, try utf-8
      if (!xmlText.includes('LEDGER')) {
        xmlText = new TextDecoder('utf-8').decode(buffer);
      }
    } catch {
      xmlText = new TextDecoder('utf-8').decode(buffer);
    }

    // ─── Parse each <LEDGER NAME="...">…</LEDGER> block ───────────────────────
    const ledgerRegex = /LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER/gi;
    const contacts: any[] = [];
    const banks:    any[] = [];
    const accounts: any[] = [];

    let match: RegExpExecArray | null;

    while ((match = ledgerRegex.exec(xmlText)) !== null) {
      const name = match[1].trim();
      const body = match[2];

      const parentM  = body.match(/PARENT>(.*?)<\/PARENT/i);
      const gstinM   = body.match(/PARTYGSTIN>(.*?)<\/PARTYGSTIN/i);
      const stateM   = body.match(/LEDSTATENAME>(.*?)<\/LEDSTATENAME/i);
      const openBalM = body.match(/OPENINGBALANCE>(.*?)<\/OPENINGBALANCE/i);

      const parent         = parentM  ? parentM[1].trim()  : '';
      const gstin          = gstinM   ? gstinM[1].trim()   : '';
      const state          = stateM   ? stateM[1].trim()   : '';
      const openingBalance = openBalM ? parseAmount(openBalM[1]) : 0;

      const ledger = {
        name,
        parent,
        gstin,
        state,
        openingBalance: String(openingBalance),
        closingBalance: String(openingBalance), // opening = closing for master import
      };

      const kind = classify(parent);

      if (kind === 'contact') {
        contacts.push(ledger);
      } else if (kind === 'bank' || kind === 'cash') {
        banks.push({ ...ledger, type: kind });
      } else {
        accounts.push(ledger);
      }
    }

    if (contacts.length === 0 && banks.length === 0 && accounts.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No ledgers found in the file. Make sure you uploaded Master.xml exported from Tally (Gateway → Export → Masters → XML).',
      }, { status: 422 });
    }

    return NextResponse.json({ success: true, contacts, banks, accounts });

  } catch (err: any) {
    console.error('parse-xml error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
