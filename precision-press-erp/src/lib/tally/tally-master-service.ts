import { supabaseServer } from '@/lib/supabase-server';

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000002';
const TALLY_HOST = process.env.TALLY_HOST || '127.0.0.1';
const TALLY_PORT = parseInt(process.env.TALLY_PORT || '9000', 10);
const TARGET_COMPANY = process.env.TALLY_COMPANY_NAME || 'Website Testing Hindustan';

export type MasterType = 'customers' | 'suppliers' | 'items' | 'accounts';

// ─── Helpers & Normalization ──────────────────────────────────────────────────

export function cleanStr(str: any): string {
  if (!str) return '';
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#4;/g, '')
    .trim();
}

export function cleanDigits(val: any): string {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

export function resolveSmartCity(name: string, fullAddress: string, state?: string): { city: string; state: string } {
  const combined = `${name || ''} ${fullAddress || ''}`.toLowerCase();
  
  if (combined.includes('bangalore') || combined.includes('bengaluru') || combined.includes('bng') || combined.includes('rajajinagar') || combined.includes('peenya')) return { city: 'Bangalore', state: 'Karnataka' };
  if (combined.includes('mangalore') || combined.includes('mangaluru')) return { city: 'Mangalore', state: 'Karnataka' };
  if (combined.includes('madikeri') || combined.includes('coorg')) return { city: 'Madikeri', state: 'Karnataka' };
  if (combined.includes('mandya')) return { city: 'Mandya', state: 'Karnataka' };
  if (combined.includes('maddur')) return { city: 'Maddur', state: 'Karnataka' };
  if (combined.includes('chamarajanagar') || combined.includes('chamarajanagara')) return { city: 'Chamarajanagar', state: 'Karnataka' };
  if (combined.includes('nanjangud') || combined.includes('nanjangudu')) return { city: 'Nanjangud', state: 'Karnataka' };
  if (combined.includes('srirangapatna')) return { city: 'Srirangapatna', state: 'Karnataka' };
  if (combined.includes('davangere') || combined.includes('davanagere')) return { city: 'Davangere', state: 'Karnataka' };
  if (combined.includes('hosapete') || combined.includes('hospet')) return { city: 'Hosapete', state: 'Karnataka' };
  if (combined.includes('hubli') || combined.includes('dharwad')) return { city: 'Hubli', state: 'Karnataka' };
  if (combined.includes('belgaum') || combined.includes('belagavi')) return { city: 'Belgaum', state: 'Karnataka' };
  if (combined.includes('gulbarga') || combined.includes('kalaburagi')) return { city: 'Gulbarga', state: 'Karnataka' };
  if (combined.includes('shimoga') || combined.includes('shivamogga')) return { city: 'Shivamogga', state: 'Karnataka' };
  if (combined.includes('hassan')) return { city: 'Hassan', state: 'Karnataka' };
  if (combined.includes('tumkur') || combined.includes('tumakuru')) return { city: 'Tumkur', state: 'Karnataka' };
  if (combined.includes('chennai') || combined.includes('madras')) return { city: 'Chennai', state: 'Tamil Nadu' };
  if (combined.includes('coimbatore')) return { city: 'Coimbatore', state: 'Tamil Nadu' };
  if (combined.includes('mumbai') || combined.includes('bombay') || combined.includes('pune')) return { city: 'Mumbai', state: 'Maharashtra' };
  if (combined.includes('delhi') || combined.includes('noida') || combined.includes('gurugram')) return { city: 'New Delhi', state: 'Delhi' };
  if (combined.includes('vadodara') || combined.includes('ahmedabad') || combined.includes('surat')) return { city: 'Vadodara', state: 'Gujarat' };
  if (combined.includes('hyderabad') || combined.includes('nizamabad') || combined.includes('telangana')) return { city: 'Hyderabad', state: 'Telangana' };
  if (combined.includes('trivandrum') || combined.includes('thiruvananthapuram') || combined.includes('kerala')) return { city: 'Thiruvananthapuram', state: 'Kerala' };

  return { city: 'Mysore', state: state || 'Karnataka' };
}

export function resolvePrinterCategory(groupName: string): string {
  if (!groupName) return 'HO';
  const upper = groupName.toUpperCase();
  if (upper.includes('HO') || upper.includes('HEAD OFFICE')) return 'HO';
  if (upper.includes('BO') || upper.includes('BRANCH') || upper.includes('WAREHOUSE')) return 'BO';
  if (upper.includes('PO') || upper.includes('PRINT')) return 'PO';
  if (upper.includes('SO') || upper.includes('FIBER') || upper.includes('LASER')) return 'SO';
  return 'HO';
}

async function fetchLiveTally(type: MasterType): Promise<string> {
  let collectionName = 'LedgerCollection';
  let tdlXml = '';

  if (type === 'items') {
    collectionName = 'StockItemCollection';
    tdlXml = `<COLLECTION NAME="StockItemCollection" ISMODIFY="No">
      <TYPE>StockItem</TYPE>
      <FETCH>Name,Parent,Guid,AlterId,BaseUnits,GstHsnName,HsnCode,OpeningRate,OpeningValue,ClosingRate,ClosingValue,OpeningBalance,ClosingBalance</FETCH>
     </COLLECTION>`;
  } else if ((type as string) === 'groups') {
    collectionName = 'GroupCollection';
    tdlXml = `<COLLECTION NAME="GroupCollection" ISMODIFY="No">
      <TYPE>Group</TYPE>
      <FETCH>Name,Parent</FETCH>
     </COLLECTION>`;
  } else {
    collectionName = 'LedgerCollection';
    tdlXml = `<COLLECTION NAME="LedgerCollection" ISMODIFY="No">
      <TYPE>Ledger</TYPE>
      <FETCH>Name,Parent,Guid,AlterId,PartyGSTIN,LedgerMobile,LedgerPhone,OpeningBalance,ClosingBalance,Pincode,LedgerStateName,Address</FETCH>
     </COLLECTION>`;
  }

  const payload = `<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>${collectionName}</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVCURRENTCOMPANY>${TARGET_COMPANY}</SVCURRENTCOMPANY>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
   </STATICVARIABLES>
   <TDL>
    <TDLMESSAGE>
     ${tdlXml}
    </TDLMESSAGE>
   </TDL>
  </DESC>
 </BODY>
</ENVELOPE>`;

  try {
    const res = await fetch(`http://${TALLY_HOST}:${TALLY_PORT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      body: payload,
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } catch (err: any) {
    throw new Error(`Failed to query Tally Port 9000: ${err.message}. Ensure TallyPrime is open with ${TARGET_COMPANY} active.`);
  }
}

// ─── Tally Data Loaders (100% Port 9000 Live) ───────────────────────────────

const CUSTOMER_GROUPS = ['debtor', 'sundry debtor', 'customer', 'client', 'bo debtor', 'so debtor', 'uv debtor', 'psd debtor'];
const SUPPLIER_GROUPS = ['creditor', 'sundry creditor', 'supplier', 'vendor', 'raw material'];

let cachedGroupTree: Map<string, string> | null = null;

export async function getTallyGroupTree(): Promise<Map<string, string>> {
  if (cachedGroupTree) return cachedGroupTree;
  try {
    const xml = await fetchLiveTally('groups' as any);
    const map = new Map<string, string>();
    const regex = /<GROUP\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/GROUP>/gi;
    let m;
    while ((m = regex.exec(xml)) !== null) {
      const name = cleanStr(m[1]).toLowerCase();
      const body = m[2];
      const pM = body.match(/<PARENT[^>]*>([^<]*)<\/PARENT>/i);
      map.set(name, pM ? cleanStr(pM[1]) : '');
    }
    cachedGroupTree = map;
    return map;
  } catch {
    return new Map();
  }
}

export async function resolveRootGroupCategory(groupName: string): Promise<'CUSTOMER' | 'SUPPLIER' | 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE'> {
  const tree = await getTallyGroupTree();
  let curr = (groupName || '').trim();
  let depth = 0;
  while (curr && depth < 10) {
    const lower = curr.toLowerCase();
    if (lower.includes('debtor') || lower.includes('cyient') || lower.includes('medical dilip')) return 'CUSTOMER';
    if (lower.includes('creditor')) return 'SUPPLIER';
    if (lower.includes('loans & advances') || lower.includes('deposits (asset)') || lower.includes('bank') || lower.includes('cash') || lower.includes('deposit') || lower.includes('current asset') || lower.includes('fixed asset') || lower.includes('investment') || lower.includes('stock-in-hand')) return 'ASSET';
    if (lower.includes('duties') || lower.includes('tax') || lower.includes('liability') || lower.includes('loan') || lower.includes('provision') || lower.includes('capital') || lower.includes('reserves') || lower.includes('tds')) return 'LIABILITY';
    if (lower.includes('sales') || lower.includes('income') || lower.includes('revenue') || lower.includes('direct income')) return 'REVENUE';
    if (lower.includes('expense') || lower.includes('charges') || lower.includes('rent') || lower.includes('salary') || lower.includes('maintenance') || lower.includes('purchase')) return 'EXPENSE';
    
    const parent = tree.get(lower);
    if (!parent || parent.toLowerCase() === lower) break;
    curr = parent;
    depth++;
  }
  return 'EXPENSE';
}

export async function isCustomerGroup(group: string): Promise<boolean> {
  const cat = await resolveRootGroupCategory(group);
  return cat === 'CUSTOMER';
}

export async function isSupplierGroup(group: string): Promise<boolean> {
  const cat = await resolveRootGroupCategory(group);
  return cat === 'SUPPLIER';
}

export async function loadTallyCustomersOrSuppliers(type: 'customers' | 'suppliers'): Promise<any[]> {
  const xml = await fetchLiveTally(type);

  if (!xml || !xml.includes('<LEDGER')) {
    throw new Error(`Tally Port 9000 responded, but no ledgers were found for ${TARGET_COMPANY}.`);
  }

  if (!xml) return [];

  const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  const items: any[] = [];
  let m;

  while ((m = ledgerRegex.exec(xml)) !== null) {
    const name = cleanStr(m[1]);
    const body = m[2];
    const parentM = body.match(/<PARENT[^>]*>([^<]*)<\/PARENT>/i);
    const parentGroup = parentM ? cleanStr(parentM[1]) : '';

    const rootCat = await resolveRootGroupCategory(parentGroup);
    if (type === 'customers' && rootCat !== 'CUSTOMER') continue;
    if (type === 'suppliers' && rootCat !== 'SUPPLIER') continue;

    const guidM = body.match(/<GUID[^>]*>([^<]*)<\/GUID>/i);
    const alterM = body.match(/<ALTERID[^>]*>([^<]*)<\/ALTERID>/i);
    const gstinM = body.match(/<PARTYGSTIN[^>]*>([^<]*)<\/PARTYGSTIN>/i) || body.match(/<GSTIN[^>]*>([^<]*)<\/GSTIN>/i);
    const mobileM = body.match(/<LEDGERMOBILE[^>]*>([^<]*)<\/LEDGERMOBILE>/i) || body.match(/<LEDGERPHONE[^>]*>([^<]*)<\/LEDGERPHONE>/i);
    const pinM = body.match(/<PINCODE[^>]*>([^<]*)<\/PINCODE>/i);
    const stateM = body.match(/<LEDGERSTATENAME[^>]*>([^<]*)<\/LEDGERSTATENAME>/i) || body.match(/<STATE[^>]*>([^<]*)<\/STATE>/i) || body.match(/<OLDLEDSTATENAME[^>]*>([^<]*)<\/OLDLEDSTATENAME>/i);

    const guid = guidM ? cleanStr(guidM[1]) : null;
    const alterId = alterM ? parseInt(alterM[1].trim(), 10) || null : null;
    const gstin = gstinM ? cleanStr(gstinM[1]).toUpperCase() : '';
    let mobile = mobileM ? cleanStr(mobileM[1]).replace(/^PH\s*/i, '').trim() : '';
    const state = stateM ? cleanStr(stateM[1]) : 'Karnataka';
    const pincode = pinM ? cleanStr(pinM[1]) : '';

    if (!mobile) {
      const namePhoneM = name.match(/\b([6-9]\d{9})\b/);
      if (namePhoneM) mobile = namePhoneM[1];
    }

    const addressLines: string[] = [];
    const addrRegex = /<ADDRESS[^>]*>([^<]*)<\/ADDRESS>/gi;
    let aM;
    while ((aM = addrRegex.exec(body)) !== null) {
      const line = cleanStr(aM[1]);
      if (line) {
        if (!mobile && /^\d{10}$/.test(line)) mobile = line;
        else if (!addressLines.includes(line)) addressLines.push(line);
      }
    }

    const balM = body.match(/<OPENINGBALANCE[^>]*>([^<]*)<\/OPENINGBALANCE>/i);
    let balNum = 0;
    let opBalType = 'Dr';
    if (balM) {
      const rawBal = cleanStr(balM[1]);
      const cleanNum = parseFloat(rawBal.replace(/[^\d.-]/g, '')) || 0;
      balNum = Math.abs(cleanNum);
      opBalType = rawBal.includes('-') ? 'Dr' : 'Cr';
    }

    const closingM = body.match(/<CLOSINGBALANCE[^>]*>([^<]*)<\/CLOSINGBALANCE>/i);
    let closingBalNum = 0;
    let closingBalType = 'Dr';
    if (closingM) {
      const rawClosing = cleanStr(closingM[1]);
      const cleanNum = parseFloat(rawClosing.replace(/[^\d.-]/g, '')) || 0;
      closingBalNum = Math.abs(cleanNum);
      closingBalType = rawClosing.includes('-') ? 'Dr' : 'Cr';
    }

    const pan = (gstin && gstin.length === 15) ? gstin.slice(2, 12) : null;
    const fullAddr = addressLines.join(', ') || null;
    const geo = resolveSmartCity(name, fullAddr || '', state);
    const category = resolvePrinterCategory(parentGroup);

    items.push({
      tallyName: name,
      tallyGroup: parentGroup,
      tallyGuid: guid,
      alterId,
      gstin: gstin || null,
      pan: pan || null,
      phone: mobile || null,
      city: geo.city,
      state: geo.state,
      pincode: pincode || null,
      address: fullAddr,
      openingBalance: balNum,
      openingBalanceType: opBalType,
      closingBalance: closingBalNum,
      closingBalanceType: closingBalType,
      printerCategory: category,
      type: type === 'customers' ? 'customer' : 'supplier',
    });
  }

  return items;
}

export async function loadTallyStockItems(): Promise<any[]> {
  const xml = await fetchLiveTally('items');

  if (!xml || !xml.includes('<STOCKITEM')) {
    throw new Error(`Tally Port 9000 responded, but no stock items were found for ${TARGET_COMPANY}.`);
  }

  const itemRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
  const items: any[] = [];
  let m;

  while ((m = itemRegex.exec(xml)) !== null) {
    const name = cleanStr(m[1]);
    const body = m[2];

    const parentM = body.match(/<PARENT[^>]*>([^<]*)<\/PARENT>/i);
    const uomM = body.match(/<BASEUNITS[^>]*>([^<]*)<\/BASEUNITS>/i);
    const hsnM = body.match(/<GSTHSNNAME[^>]*>([^<]*)<\/GSTHSNNAME>/i) || body.match(/<HSNCODE[^>]*>([^<]*)<\/HSNCODE>/i);
    const rateM = body.match(/<OPENINGRATE[^>]*>([^<]*)<\/OPENINGRATE>/i) || body.match(/<CLOSINGRATE[^>]*>([^<]*)<\/CLOSINGRATE>/i) || body.match(/<RATE[^>]*>([^<]*)<\/RATE>/i);
    const valM = body.match(/<OPENINGVALUE[^>]*>([^<]*)<\/OPENINGVALUE>/i) || body.match(/<CLOSINGVALUE[^>]*>([^<]*)<\/CLOSINGVALUE>/i);
    const balM = body.match(/<OPENINGBALANCE[^>]*>([^<]*)<\/OPENINGBALANCE>/i) || body.match(/<CLOSINGBALANCE[^>]*>([^<]*)<\/CLOSINGBALANCE>/i);
    const guidM = body.match(/<GUID[^>]*>([^<]*)<\/GUID>/i);

    const group = parentM ? cleanStr(parentM[1]) : 'General';
    const rawUom = uomM ? cleanStr(uomM[1]) : 'N';
    const isSqft = rawUom.toLowerCase() === 'sqft' || rawUom.toLowerCase() === 'sq.ft' || rawUom.toLowerCase() === 'sqf';
    const normalizedUom = isSqft ? 'sqft' : rawUom;
    const hsn = hsnM ? cleanStr(hsnM[1]) : '';
    const guid = guidM ? cleanStr(guidM[1]) : null;

    let rate = 0;
    if (rateM) {
      const rateStr = cleanStr(rateM[1]).split('/')[0];
      rate = Math.abs(parseFloat(rateStr.replace(/[^\d.-]/g, '')) || 0);
    }

    let qty = 0;
    if (balM) {
      const qtyStr = cleanStr(balM[1]).split(' ')[0];
      qty = Math.abs(parseFloat(qtyStr.replace(/[^\d.-]/g, '')) || 0);
    }

    let totalVal = 0;
    if (valM) {
      totalVal = Math.abs(parseFloat(cleanStr(valM[1]).replace(/[^\d.-]/g, '')) || 0);
    }

    if (!rate && qty > 0 && totalVal > 0) {
      rate = Math.round((totalVal / qty) * 100) / 100;
    }

    items.push({
      name,
      tallyItemName: name,
      group,
      uom: normalizedUom,
      rawUom: rawUom,
      isSqft,
      billingMode: isSqft ? 'B' : 'A',
      hsnCode: hsn || '32141000',
      rate,
      openingQuantity: qty,
      tallyGuid: guid,
      godown: 'B1',
    });
  }

  return items;
}

export async function loadTallyAccounts(): Promise<any[]> {
  const xml = await fetchLiveTally('accounts');

  if (!xml || !xml.includes('<LEDGER')) {
    throw new Error(`Tally Port 9000 responded, but no accounts were found for ${TARGET_COMPANY}.`);
  }

  if (!xml) return [];

  const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  const accounts: any[] = [];
  let m;

  while ((m = ledgerRegex.exec(xml)) !== null) {
    const name = cleanStr(m[1]);
    const body = m[2];

    const parentM = body.match(/<PARENT[^>]*>([^<]*)<\/PARENT>/i);
    const parentGroup = parentM ? cleanStr(parentM[1]) : 'Primary';

    // Exclude customer and supplier debtors/creditors (including sub-groups)
    const rootCat = await resolveRootGroupCategory(parentGroup);
    if (rootCat === 'CUSTOMER' || rootCat === 'SUPPLIER') continue;

    const guidM = body.match(/<GUID[^>]*>([^<]*)<\/GUID>/i);
    const balM = body.match(/<OPENINGBALANCE[^>]*>([^<]*)<\/OPENINGBALANCE>/i);

    let balNum = 0;
    if (balM) {
      balNum = Math.abs(parseFloat(cleanStr(balM[1]).replace(/[^\d.-]/g, '')) || 0);
    }

    accounts.push({
      name,
      tallyLedgerName: name,
      group: parentGroup,
      openingBalance: balNum,
      tallyGuid: guidM ? cleanStr(guidM[1]) : null,
    });
  }

  return accounts;
}

// ─── ERP Database Loaders ──────────────────────────────────────────────────────

export async function loadErpRecords(type: MasterType): Promise<any[]> {
  if (type === 'customers' || type === 'suppliers') {
    const contactType = type === 'customers' ? 'customer' : 'supplier';
    let allContacts: any[] = [];
    for (let offset = 0; offset <= 5000; offset += 1000) {
      const { data } = await supabaseServer
        .from('contact')
        .select('*')
        .eq('type', contactType)
        .range(offset, offset + 999);
      if (data && data.length > 0) allContacts = allContacts.concat(data);
      else break;
    }
    return allContacts;
  }

  if (type === 'items') {
    let allItems: any[] = [];
    for (let offset = 0; offset <= 5000; offset += 1000) {
      const { data } = await supabaseServer
        .from('inventory_item')
        .select('*')
        .range(offset, offset + 999);
      if (data && data.length > 0) allItems = allItems.concat(data);
      else break;
    }
    return allItems;
  }

  if (type === 'accounts') {
    const { data: banks } = await supabaseServer.from('bank_account').select('*');
    const { data: chart } = await supabaseServer.from('chart_account').select('*');
    return [
      ...(banks || []).map(b => ({ ...b, isBank: true, name: b.name || b.tally_ledger_name })),
      ...(chart || []).map(c => ({ ...c, isBank: false, name: c.name || c.tally_ledger_name })),
    ];
  }

  return [];
}

// ─── Preview Engine ───────────────────────────────────────────────────────────

export async function previewMasterSync(type: MasterType) {
  let tallyItems: any[] = [];
  if (type === 'customers') tallyItems = await loadTallyCustomersOrSuppliers('customers');
  else if (type === 'suppliers') tallyItems = await loadTallyCustomersOrSuppliers('suppliers');
  else if (type === 'items') tallyItems = await loadTallyStockItems();
  else if (type === 'accounts') tallyItems = await loadTallyAccounts();

  const erpRecords = await loadErpRecords(type);
  const erpMapByName = new Map<string, any>();
  const erpMapByGuid = new Map<string, any>();

  for (const r of erpRecords) {
    const key = cleanStr(r.name || r.tally_item_name || r.tally_ledger_name).toLowerCase();
    if (key) erpMapByName.set(key, r);
    if (r.tally_guid) erpMapByGuid.set(r.tally_guid, r);
  }

  const newRecords: any[] = [];
  const updateRecords: any[] = [];
  const identicalRecords: any[] = [];

  for (const item of tallyItems) {
    const lookupName = cleanStr(item.tallyName || item.name).toLowerCase();
    const existing = (item.tallyGuid && erpMapByGuid.get(item.tallyGuid)) || erpMapByName.get(lookupName);

    if (!existing) {
      newRecords.push({
        name: item.tallyName || item.name,
        status: 'NEW',
        details: item,
      });
    } else {
      // Check if values differ (needs healing)
      let hasChanges = false;
      const changes: Record<string, any> = {};

      if (type === 'customers' || type === 'suppliers') {
        const erpPhone = cleanDigits(existing.phone);
        const tallyPhone = cleanDigits(item.phone);
        if (tallyPhone && erpPhone !== tallyPhone) {
          hasChanges = true;
          changes.phone = { old: existing.phone, new: item.phone };
        }

        const erpGstin = cleanStr(existing.tax_number || existing.taxNumber).toUpperCase();
        const tallyGstin = cleanStr(item.gstin).toUpperCase();
        if (tallyGstin && erpGstin !== tallyGstin) {
          hasChanges = true;
          changes.gstin = { old: erpGstin, new: tallyGstin };
        }

        const erpAddr = cleanStr(existing.billing_address_line1 || (existing.addresses as any)?.billing?.line1);
        const tallyAddr = cleanStr(item.address);
        if (tallyAddr && erpAddr !== tallyAddr) {
          hasChanges = true;
          changes.address = { old: erpAddr, new: tallyAddr };
        }

        const erpBal = existing.tally_closing_balance != null ? Number(existing.tally_closing_balance) : Number(existing.opening_balance || 0);
        const tallyBal = Number(item.closingBalance || 0);
        if (tallyBal !== erpBal) {
          hasChanges = true;
          changes.closingBalance = { old: erpBal, new: tallyBal };
        }
      } else if (type === 'items') {
        const erpHsn = cleanStr(existing.hsn_code || existing.hsnCode);
        const tallyHsn = cleanStr(item.hsnCode);
        if (tallyHsn && erpHsn !== tallyHsn) {
          hasChanges = true;
          changes.hsn = { old: erpHsn, new: tallyHsn };
        }
      }

      if (hasChanges) {
        updateRecords.push({
          id: existing.id,
          name: item.tallyName || item.name,
          status: 'UPDATE',
          changes,
          details: item,
        });
      } else {
        identicalRecords.push({
          id: existing.id,
          name: item.tallyName || item.name,
          status: 'MATCHED',
        });
      }
    }
  }

  return {
    totalTally: tallyItems.length,
    totalErp: erpRecords.length,
    newCount: newRecords.length,
    updateCount: updateRecords.length,
    identicalCount: identicalRecords.length,
    newRecords: newRecords.slice(0, 100),
    updateRecords: updateRecords.slice(0, 100),
  };
}

// ─── Execute Sync Engine ──────────────────────────────────────────────────────

export interface ExecuteSyncOptions {
  limit?: number;
  specificName?: string;
}

export async function executeMasterSync(type: MasterType, options?: ExecuteSyncOptions) {
  let tallyItems: any[] = [];
  if (type === 'customers') tallyItems = await loadTallyCustomersOrSuppliers('customers');
  else if (type === 'suppliers') tallyItems = await loadTallyCustomersOrSuppliers('suppliers');
  else if (type === 'items') tallyItems = await loadTallyStockItems();
  else if (type === 'accounts') tallyItems = await loadTallyAccounts();

  const erpRecords = await loadErpRecords(type);
  const erpMapByName = new Map<string, any>();
  const erpMapByGuid = new Map<string, any>();

  for (const r of erpRecords) {
    const key = cleanStr(r.name || r.tally_item_name || r.tally_ledger_name).toLowerCase();
    if (key) erpMapByName.set(key, r);
    if (r.tally_guid) erpMapByGuid.set(r.tally_guid, r);
  }

  let addedCount = 0;
  let updatedCount = 0;
  let syncedDetails: any = null;

  if (type === 'customers' || type === 'suppliers') {
    const contactType = type === 'customers' ? 'customer' : 'supplier';

    let targetItems = tallyItems;
    if (options?.specificName) {
      targetItems = tallyItems.filter(i => cleanStr(i.tallyName).toLowerCase() === cleanStr(options.specificName).toLowerCase());
    } else if (options?.limit === 1) {
      const nonExisting = tallyItems.filter(item => {
        const lookupName = cleanStr(item.tallyName).toLowerCase();
        return !(item.tallyGuid && erpMapByGuid.get(item.tallyGuid)) && !erpMapByName.get(lookupName);
      });
      targetItems = nonExisting.length > 0 ? [nonExisting[0]] : [tallyItems[0]];
    }

    for (const item of targetItems) {
      const lookupName = cleanStr(item.tallyName).toLowerCase();
      const existing = (item.tallyGuid && erpMapByGuid.get(item.tallyGuid)) || erpMapByName.get(lookupName);

      const payload: any = {
        organization_id: DEFAULT_ORG_ID,
        name: item.tallyName,
        displayName: item.tallyName,
        company_name: item.tallyName,
        businessName: item.tallyName,
        business_name: item.tallyName,
        tally_ledger_name: item.tallyName,
        tally_opening_balance: item.openingBalance || 0,
        tally_closing_balance: item.closingBalance || 0,
        opening_balance: item.closingBalance != null ? item.closingBalance : (item.openingBalance || 0),
        opening_balance_type: item.closingBalanceType || item.openingBalanceType || 'Dr',
        financialStats: {
          openingBalance: item.closingBalance != null ? item.closingBalance : (item.openingBalance || 0),
          closingBalance: item.closingBalance != null ? item.closingBalance : (item.openingBalance || 0),
          balanceType: item.closingBalanceType || 'Dr',
          tallyOpeningBalance: item.openingBalance || 0,
          tallyClosingBalance: item.closingBalance || 0,
        },
        phone: item.phone || existing?.phone || null,
        tax_number: item.gstin || existing?.tax_number || null,
        gstin: item.gstin || existing?.gstin || null,
        gstNumber: item.gstin || existing?.gstNumber || null,
        gst_number: item.gstin || existing?.gst_number || null,
        gst_registered: !!item.gstin,
        pan_number: item.pan || existing?.pan_number || null,
        billing_address_line1: item.address || existing?.billing_address_line1 || null,
        billing_city: item.city || existing?.billing_city || 'Mysore',
        city: item.city || existing?.city || 'Mysore',
        billing_state: item.state || existing?.billing_state || 'Karnataka',
        state: item.state || existing?.state || 'Karnataka',
        billing_country: 'India',
        country: 'India',
        billing_pincode: item.pincode || existing?.billing_pincode || null,
        pincode: item.pincode || existing?.pincode || null,
        printerCategory: item.printerCategory || 'HO',
        tally_guid: item.tallyGuid || existing?.tally_guid || null,
        type: contactType,
        is_synced_to_erp: true,
      };

      if (!existing) {
        const { data: inserted } = await supabaseServer.from('contact').insert(payload).select('*').single();
        addedCount++;
        syncedDetails = inserted || payload;
      } else {
        const { data: updated } = await supabaseServer.from('contact').update(payload).eq('id', existing.id).select('*').single();
        updatedCount++;
        syncedDetails = updated || payload;
      }

      if (options?.limit && (addedCount + updatedCount) >= options.limit) break;
    }
  } else if (type === 'items') {
    // 1. Load all inventory categories into memory
    const { data: existingCats } = await supabaseServer.from('inventory_category').select('id, name');
    const catMap = new Map<string, string>();
    for (const c of existingCats || []) {
      if (c.name) catMap.set(cleanStr(c.name).toLowerCase(), c.id);
    }

    let targetItems = tallyItems;
    if (options?.specificName) {
      targetItems = tallyItems.filter(i => cleanStr(i.name).toLowerCase() === cleanStr(options.specificName).toLowerCase());
    } else if (options?.limit === 1) {
      const nonExisting = tallyItems.filter(item => {
        const lookupName = cleanStr(item.name).toLowerCase();
        return !(item.tallyGuid && erpMapByGuid.get(item.tallyGuid)) && !erpMapByName.get(lookupName);
      });
      targetItems = nonExisting.length > 0 ? [nonExisting[0]] : [tallyItems[0]];
    }

    for (const item of targetItems) {
      const lookupName = cleanStr(item.name).toLowerCase();
      const existing = (item.tallyGuid && erpMapByGuid.get(item.tallyGuid)) || erpMapByName.get(lookupName);

      // Resolve or auto-create category
      let categoryId: string | null = null;
      const groupKey = cleanStr(item.group).toLowerCase();
      if (groupKey) {
        if (catMap.has(groupKey)) {
          categoryId = catMap.get(groupKey)!;
        } else {
          const { data: newCat } = await supabaseServer.from('inventory_category').insert({
            organization_id: DEFAULT_ORG_ID,
            name: item.group,
            tally_stock_group: item.group,
            description: `Tally Stock Group: ${item.group}`,
          }).select('id').maybeSingle();
          if (newCat?.id) {
            categoryId = newCat.id;
            catMap.set(groupKey, newCat.id);
          }
        }
      }

      const rateVal = item.rate || 0;
      const paiseVal = Math.round(rateVal * 100);
      const skuVal = existing?.sku || `SKU-${Date.now().toString().slice(-6)}`;

      const isSqft = item.isSqft ?? (item.uom?.toLowerCase() === 'sqft' || item.uom?.toLowerCase() === 'sq.ft' || item.uom?.toLowerCase() === 'sqf');
      const billingMode = item.billingMode || (isSqft ? 'B' : 'A');
      const normalizedUom = isSqft ? 'sqft' : (item.uom || 'N');

      const payload: any = {
        organization_id: DEFAULT_ORG_ID,
        code: existing?.code || skuVal,
        sku: skuVal,
        name: item.name,
        description: `Stock Item: ${item.name}${item.group ? ` (${item.group})` : ''}`,
        category: item.group || 'General',
        category_id: categoryId,
        tally_item_name: item.name,
        tally_stock_group: item.group,
        tally_uom: item.rawUom || item.uom || 'N',
        unit_of_measure: normalizedUom,
        tally_billing_mode: billingMode,
        hsn_code: item.hsnCode || existing?.hsn_code || null,
        purchase_price: paiseVal,
        sale_price: Math.round(paiseVal * 1.25),
        average_cost: paiseVal,
        quantity_on_hand: item.openingQuantity || 0,
        opening_rate: rateVal,
        opening_quantity: item.openingQuantity || 0,
        opening_value: Math.round((item.openingQuantity || 0) * rateVal),
        total_value: Math.round((item.openingQuantity || 0) * paiseVal),
        is_active: true,
        cost_method: 'average',
        tracking_method: 'none',
        metadata: {
          hsn: item.hsnCode || null,
          unit: item.rawUom || item.uom || 'N',
          baseRate: rateVal,
          calcType: isSqft ? 'SQFT' : 'QTY',
          billingMode: billingMode,
        },
        tally_guid: item.tallyGuid || existing?.tally_guid || null,
      };

      if (!existing) {
        const { data: inserted, error: insertErr } = await supabaseServer.from('inventory_item').insert(payload).select('*').single();
        if (insertErr) throw new Error(`Failed to insert item "${item.name}": ${insertErr.message}`);
        addedCount++;
        syncedDetails = inserted || payload;
      } else {
        const { data: updated, error: updateErr } = await supabaseServer.from('inventory_item').update(payload).eq('id', existing.id).select('*').single();
        if (updateErr) throw new Error(`Failed to update item "${item.name}": ${updateErr.message}`);
        updatedCount++;
        syncedDetails = updated || payload;
      }

      if (options?.limit && (addedCount + updatedCount) >= options.limit) break;
    }
  } else if (type === 'accounts') {
    const { data: chartList } = await supabaseServer.from('chart_account').select('id, code, name, type');
    const usedCodes = new Set<string>((chartList || []).map(c => String(c.code)));

    let targetItems = tallyItems;
    if (options?.specificName) {
      targetItems = tallyItems.filter(i => cleanStr(i.name).toLowerCase() === cleanStr(options.specificName).toLowerCase());
    } else if (options?.limit === 1) {
      const nonExisting = tallyItems.filter(acc => {
        const lookupName = cleanStr(acc.name).toLowerCase();
        return !(acc.tallyGuid && erpMapByGuid.get(acc.tallyGuid)) && !erpMapByName.get(lookupName);
      });
      targetItems = nonExisting.length > 0 ? [nonExisting[0]] : [tallyItems[0]];
    }

    for (const acc of targetItems) {
      const lookupName = cleanStr(acc.name).toLowerCase();
      const existing = (acc.tallyGuid && erpMapByGuid.get(acc.tallyGuid)) || erpMapByName.get(lookupName);

      if (!existing) {
        let accType = 'expense';
        let baseCode = 5000;
        const rootCat = await resolveRootGroupCategory(acc.group);
        if (rootCat === 'ASSET') { accType = 'asset'; baseCode = 1400; }
        else if (rootCat === 'LIABILITY') { accType = 'liability'; baseCode = 2400; }
        else if (rootCat === 'REVENUE') { accType = 'revenue'; baseCode = 4100; }
        else if (rootCat === 'EXPENSE') { accType = 'expense'; baseCode = 5000; }

        let newCode = baseCode;
        while (usedCodes.has(String(newCode))) {
          newCode += 10;
        }
        usedCodes.add(String(newCode));

        const payload = {
          organization_id: DEFAULT_ORG_ID,
          name: acc.name,
          tally_ledger_name: acc.name,
          tally_parent_group: acc.group,
          tally_guid: acc.tallyGuid,
          code: String(newCode),
          type: accType,
          opening_balance: acc.openingBalance || 0,
          opening_balance_type: 'Dr',
          currency_code: 'INR',
          is_active: true,
        };

        const { data: inserted, error: insertErr } = await supabaseServer.from('chart_account').insert(payload).select('*').single();
        if (insertErr) throw new Error(`Failed to insert account "${acc.name}": ${insertErr.message}`);
        addedCount++;
        syncedDetails = inserted || payload;
      } else {
        const { data: updated, error: updateErr } = await supabaseServer.from('chart_account').update({
          tally_ledger_name: acc.name,
          tally_parent_group: acc.group,
          tally_guid: acc.tallyGuid || existing.tally_guid,
          opening_balance: acc.openingBalance || existing.opening_balance,
        }).eq('id', existing.id).select('*').single();
        if (updateErr) throw new Error(`Failed to update account "${acc.name}": ${updateErr.message}`);
        updatedCount++;
        syncedDetails = updated || existing;
      }

      if (options?.limit && (addedCount + updatedCount) >= options.limit) break;
    }
  }

  return {
    success: true,
    mode: options?.limit === 1 ? 'single' : 'bulk',
    addedCount,
    updatedCount,
    syncedRecord: syncedDetails,
    summary: await getMasterSummaryCounts().catch(() => null),
  };
}

// ─── Deep Verification Engine ─────────────────────────────────────────────────

export async function verifyMasterSync(type: MasterType) {
  let tallyItems: any[] = [];
  if (type === 'customers') tallyItems = await loadTallyCustomersOrSuppliers('customers');
  else if (type === 'suppliers') tallyItems = await loadTallyCustomersOrSuppliers('suppliers');
  else if (type === 'items') tallyItems = await loadTallyStockItems();
  else if (type === 'accounts') tallyItems = await loadTallyAccounts();

  const erpRecords = await loadErpRecords(type);
  const erpMapByName = new Map<string, any>();
  const erpMapByGuid = new Map<string, any>();

  for (const r of erpRecords) {
    const nameKey = cleanStr(r.name || r.tally_item_name || r.tally_ledger_name).toLowerCase();
    if (nameKey) erpMapByName.set(nameKey, r);
    if (r.tally_guid) erpMapByGuid.set(r.tally_guid, r);
  }

  const results: any[] = [];
  let matchedCount = 0;
  let discrepancyCount = 0;

  for (const item of tallyItems) {
    const lookupName = cleanStr(item.tallyName || item.name).toLowerCase();
    const existing = (item.tallyGuid && erpMapByGuid.get(item.tallyGuid)) || erpMapByName.get(lookupName);

    if (!existing) {
      discrepancyCount++;
      results.push({
        name: item.tallyName || item.name,
        status: 'MISSING_IN_ERP',
        tallyData: item,
        erpData: null,
        discrepancies: [{ field: 'Existence', tally: 'Present in Tally', erp: 'Not found in ERP' }],
      });
      continue;
    }

    const fieldDiffs: any[] = [];

    if (type === 'customers' || type === 'suppliers') {
      // 1. Name Check
      if (cleanStr(item.tallyName).toLowerCase() !== cleanStr(existing.name).toLowerCase()) {
        fieldDiffs.push({ field: 'Name', tally: item.tallyName, erp: existing.name });
      }

      // 2. GSTIN Check
      const tallyGst = cleanStr(item.gstin).toUpperCase();
      const erpGst = cleanStr(existing.tax_number || existing.taxNumber).toUpperCase();
      if (tallyGst && tallyGst !== erpGst) {
        fieldDiffs.push({ field: 'GSTIN', tally: tallyGst, erp: erpGst || 'Empty' });
      }

      // 3. Phone Check (digits-only comparison)
      const tallyPh = cleanDigits(item.phone);
      const erpPh = cleanDigits(existing.phone);
      if (tallyPh && erpPh && tallyPh !== erpPh) {
        fieldDiffs.push({ field: 'Phone', tally: item.phone, erp: existing.phone || 'Empty' });
      }

      // 4. Address Check (normalized comparison)
      const tallyAddr = cleanStr(item.address).toLowerCase().replace(/[\s,]+/g, ' ');
      const erpAddr = cleanStr(existing.billing_address_line1 || (existing.addresses as any)?.billing?.line1).toLowerCase().replace(/[\s,]+/g, ' ');
      if (tallyAddr && erpAddr && tallyAddr !== erpAddr && !erpAddr.includes(tallyAddr.slice(0, 15))) {
        fieldDiffs.push({ field: 'Address', tally: item.address, erp: existing.billing_address_line1 || 'Empty' });
      }
    } else if (type === 'items') {
      const tallyHsn = cleanStr(item.hsnCode);
      const erpHsn = cleanStr(existing.hsn_code || existing.hsnCode);
      if (tallyHsn && tallyHsn !== erpHsn) {
        fieldDiffs.push({ field: 'HSN Code', tally: tallyHsn, erp: erpHsn || 'Empty' });
      }
    }

    if (fieldDiffs.length > 0) {
      discrepancyCount++;
      results.push({
        name: item.tallyName || item.name,
        status: 'MISMATCH',
        tallyData: item,
        erpData: existing,
        discrepancies: fieldDiffs,
      });
    } else {
      matchedCount++;
      results.push({
        name: item.tallyName || item.name,
        status: 'MATCHED',
        tallyData: item,
        erpData: existing,
        discrepancies: [],
      });
    }
  }

  const matchPercentage = tallyItems.length > 0
    ? Number(((matchedCount / tallyItems.length) * 100).toFixed(1))
    : 100;

  return {
    totalTally: tallyItems.length,
    totalErp: erpRecords.length,
    matchedCount,
    discrepancyCount,
    matchPercentage,
    results: results.slice(0, 300), // top 300 for snappy UI
  };
}

// ─── Live Dynamic Summary Counts ──────────────────────────────────────────────

export async function getMasterSummaryCounts() {
  const [cust, supp, items, accs] = await Promise.all([
    loadTallyCustomersOrSuppliers('customers'),
    loadTallyCustomersOrSuppliers('suppliers'),
    loadTallyStockItems(),
    loadTallyAccounts(),
  ]);

  const { count: erpCust } = await supabaseServer.from('contact').select('*', { count: 'exact', head: true }).eq('type', 'customer');
  const { count: erpSupp } = await supabaseServer.from('contact').select('*', { count: 'exact', head: true }).eq('type', 'supplier');
  const { count: erpItems } = await supabaseServer.from('inventory_item').select('*', { count: 'exact', head: true });
  const { count: erpAccs } = await supabaseServer.from('chart_account').select('*', { count: 'exact', head: true });

  return {
    customers: { tally: cust.length, erp: erpCust || 0 },
    suppliers: { tally: supp.length, erp: erpSupp || 0 },
    items: { tally: items.length, erp: erpItems || 0 },
    accounts: { tally: accs.length, erp: erpAccs || 0 },
  };
}
