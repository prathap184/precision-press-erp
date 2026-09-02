import fs from 'fs';
import path from 'path';
import http from 'http';
import { supabaseServer } from '@/lib/supabase-server';

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000002';
const TALLY_HOST = process.env.TALLY_HOST || 'localhost';
const TALLY_PORT = parseInt(process.env.TALLY_PORT || '9000', 10);
const TARGET_COMPANY = process.env.TALLY_COMPANY_NAME || 'Website Testing Hindustan';

const ALL_LEDGERS_DIR = path.resolve(process.cwd(), 'tally_sync/all ledgers');
const CUSTOMER_XML_PATH = path.join(ALL_LEDGERS_DIR, 'listofledgers.xml');
const GROUPS_XML_PATH = path.join(ALL_LEDGERS_DIR, 'listofstockgroups.xml');
const ITEMS_XML_PATH = path.join(ALL_LEDGERS_DIR, 'stockitems.xml');

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

function fetchLiveTally(reportName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xmlPayload = `
<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Export Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <EXPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>${reportName}</REPORTNAME>
    <STATICVARIABLES>
     <SVCURRENTCOMPANY>${TARGET_COMPANY}</SVCURRENTCOMPANY>
     <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    </STATICVARIABLES>
   </REQUESTDESC>
  </EXPORTDATA>
 </BODY>
</ENVELOPE>`;

    const req = http.request({
      hostname: TALLY_HOST,
      port: TALLY_PORT,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(xmlPayload),
      },
      timeout: 3000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tally Port 9000 timeout'));
    });

    req.write(xmlPayload);
    req.end();
  });
}

// ─── Tally Data Loaders ────────────────────────────────────────────────────────

const CUSTOMER_GROUPS = ['debtor', 'sundry debtor', 'customer', 'client', 'bo debtor', 'so debtor', 'uv debtor', 'psd debtor'];
const SUPPLIER_GROUPS = ['creditor', 'sundry creditor', 'supplier', 'vendor', 'raw material'];

function isCustomerGroup(group: string) {
  if (!group) return false;
  const lower = group.toLowerCase();
  if (lower.includes('creditor') || lower.includes('supplier')) return false;
  return CUSTOMER_GROUPS.some(k => lower.includes(k));
}

function isSupplierGroup(group: string) {
  if (!group) return false;
  const lower = group.toLowerCase();
  if (lower.includes('debtor') || lower.includes('customer')) return false;
  return SUPPLIER_GROUPS.some(k => lower.includes(k));
}

export async function loadTallyCustomersOrSuppliers(type: 'customers' | 'suppliers'): Promise<any[]> {
  let xml = '';
  try {
    xml = await fetchLiveTally('List of Ledgers');
  } catch {
    if (fs.existsSync(CUSTOMER_XML_PATH)) {
      xml = fs.readFileSync(CUSTOMER_XML_PATH, 'utf8');
    }
  }

  if (!xml) return [];

  const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  const items: any[] = [];
  let m;

  while ((m = ledgerRegex.exec(xml)) !== null) {
    const name = cleanStr(m[1]);
    const body = m[2];

    const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const parentGroup = parentM ? cleanStr(parentM[1]) : '';

    if (type === 'customers' && !isCustomerGroup(parentGroup)) continue;
    if (type === 'suppliers' && !isSupplierGroup(parentGroup)) continue;

    const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
    const alterM = body.match(/<ALTERID>([^<]*)<\/ALTERID>/i);
    const gstinM = body.match(/<PARTYGSTIN>([^<]*)<\/PARTYGSTIN>/i) || body.match(/<GSTIN>([^<]*)<\/GSTIN>/i);
    const mobileM = body.match(/<LEDGERMOBILE>([^<]*)<\/LEDGERMOBILE>/i) || body.match(/<LEDGERPHONE>([^<]*)<\/LEDGERPHONE>/i);
    const balM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
    const pinM = body.match(/<PINCODE>([^<]*)<\/PINCODE>/i);
    const stateM = body.match(/<STATE>([^<]*)<\/STATE>/i) || body.match(/<OLDLEDSTATENAME>([^<]*)<\/OLDLEDSTATENAME>/i);

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
    const addrRegex = /<ADDRESS>([^<]*)<\/ADDRESS>/gi;
    let aM;
    while ((aM = addrRegex.exec(body)) !== null) {
      const line = cleanStr(aM[1]);
      if (line) {
        if (!mobile && /^\d{10}$/.test(line)) mobile = line;
        else addressLines.push(line);
      }
    }

    const pan = (gstin && gstin.length === 15) ? gstin.slice(2, 12) : null;

    let balNum = 0;
    if (balM) {
      const cleanNum = parseFloat(cleanStr(balM[1]).replace(/[^\d.-]/g, '')) || 0;
      balNum = Math.abs(cleanNum);
    }

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
      printerCategory: category,
      type: type === 'customers' ? 'customer' : 'supplier',
    });
  }

  return items;
}

export async function loadTallyStockItems(): Promise<any[]> {
  let xml = '';
  try {
    xml = await fetchLiveTally('Stock Summary');
  } catch {
    if (fs.existsSync(ITEMS_XML_PATH)) {
      xml = fs.readFileSync(ITEMS_XML_PATH, 'utf8');
    }
  }

  if (!xml) return [];

  const itemRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
  const items: any[] = [];
  let m;

  while ((m = itemRegex.exec(xml)) !== null) {
    const name = cleanStr(m[1]);
    const body = m[2];

    const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const uomM = body.match(/<BASEUNITS>([^<]*)<\/BASEUNITS>/i);
    const hsnM = body.match(/<GSTHSNNAME>([^<]*)<\/GSTHSNNAME>/i) || body.match(/<HSNCODE>([^<]*)<\/HSNCODE>/i);
    const rateM = body.match(/<RATE>([^<]*)<\/RATE>/i);
    const balM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
    const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);

    const group = parentM ? cleanStr(parentM[1]) : 'General';
    const uom = uomM ? cleanStr(uomM[1]).toLowerCase() : 'n';
    const hsn = hsnM ? cleanStr(hsnM[1]) : '';
    const guid = guidM ? cleanStr(guidM[1]) : null;

    let rate = 0;
    if (rateM) {
      rate = parseFloat(cleanStr(rateM[1]).replace(/[^\d.-]/g, '')) || 0;
    }

    let qty = 0;
    if (balM) {
      qty = parseFloat(cleanStr(balM[1]).replace(/[^\d.-]/g, '')) || 0;
    }

    items.push({
      name,
      tallyItemName: name,
      group,
      uom: uom === 'sqft' ? 'sqft' : 'N',
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
  let xml = '';
  try {
    xml = await fetchLiveTally('List of Ledgers');
  } catch {
    if (fs.existsSync(CUSTOMER_XML_PATH)) {
      xml = fs.readFileSync(CUSTOMER_XML_PATH, 'utf8');
    }
  }

  if (!xml) return [];

  const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  const accounts: any[] = [];
  let m;

  while ((m = ledgerRegex.exec(xml)) !== null) {
    const name = cleanStr(m[1]);
    const body = m[2];

    const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const parentGroup = parentM ? cleanStr(parentM[1]) : 'Primary';

    // Exclude customer and supplier debtors/creditors
    if (isCustomerGroup(parentGroup) || isSupplierGroup(parentGroup)) continue;

    const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
    const balM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);

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

export async function executeMasterSync(type: MasterType) {
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

  if (type === 'customers' || type === 'suppliers') {
    const contactType = type === 'customers' ? 'customer' : 'supplier';
    for (const item of tallyItems) {
      const lookupName = cleanStr(item.tallyName).toLowerCase();
      const existing = (item.tallyGuid && erpMapByGuid.get(item.tallyGuid)) || erpMapByName.get(lookupName);

      const payload: any = {
        organization_id: DEFAULT_ORG_ID,
        name: item.tallyName,
        displayName: item.tallyName,
        company_name: item.tallyName,
        tally_ledger_name: item.tallyName,
        tally_opening_balance: item.openingBalance || 0,
        phone: item.phone || existing?.phone || null,
        tax_number: item.gstin || existing?.tax_number || null,
        gstin: item.gstin || existing?.gstin || null,
        pan_number: item.pan || existing?.pan_number || null,
        billing_address_line1: item.address || existing?.billing_address_line1 || null,
        billing_city: item.city || existing?.billing_city || 'Mysore',
        city: item.city || existing?.city || 'Mysore',
        billing_state: item.state || existing?.billing_state || 'Karnataka',
        state: item.state || existing?.state || 'Karnataka',
        billing_pincode: item.pincode || existing?.billing_pincode || null,
        pincode: item.pincode || existing?.pincode || null,
        printerCategory: item.printerCategory || 'HO',
        tally_guid: item.tallyGuid || existing?.tally_guid || null,
        type: contactType,
      };

      if (!existing) {
        await supabaseServer.from('contact').insert(payload);
        addedCount++;
      } else {
        await supabaseServer.from('contact').update(payload).eq('id', existing.id);
        updatedCount++;
      }
    }
  } else if (type === 'items') {
    for (const item of tallyItems) {
      const lookupName = cleanStr(item.name).toLowerCase();
      const existing = (item.tallyGuid && erpMapByGuid.get(item.tallyGuid)) || erpMapByName.get(lookupName);

      const payload: any = {
        organization_id: DEFAULT_ORG_ID,
        name: item.name,
        tally_item_name: item.name,
        tally_stock_group: item.group,
        tally_uom: item.uom,
        unit_of_measure: item.uom,
        hsn_code: item.hsnCode,
        default_sale_price: Math.round(item.rate * 100),
        opening_rate: item.rate,
        opening_quantity: item.openingQuantity,
        opening_value: Math.round((item.openingQuantity || 0) * (item.rate || 0)),
        tally_guid: item.tallyGuid || existing?.tally_guid || null,
      };

      if (!existing) {
        payload.sku = `SKU-${Date.now().toString().slice(-6)}`;
        await supabaseServer.from('inventory_item').insert(payload);
        addedCount++;
      } else {
        await supabaseServer.from('inventory_item').update(payload).eq('id', existing.id);
        updatedCount++;
      }
    }
  }

  return {
    success: true,
    addedCount,
    updatedCount,
    totalProcessed: tallyItems.length,
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
