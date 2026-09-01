# 🧠 COMPLETE MEMORY MAP: PRECISION PRESS ERP ⟷ TALLY PRIME INTEGRATION

This document serves as the permanent, root-level master memory record for all TallyPrime ⟷ Precision Press ERP sync flows, file locations, data field mappings, and architectural designs.

---

## 📂 1. Directory & File Locations Map

| Purpose | File Path | Description |
|---|---|---|
| **Live Outbound Sync Connector** | `tally-connector/connector.js` & `tally_sync/connector.js` | Polls Supabase `tally_sync_queue` and posts XML to Tally Prime Port `9000`. |
| **Tally XML Voucher Builder** | `tally-connector/xml-builder.js` & `tally_sync/xml-builder.js` | Builds compliant Tally XML for Invoices (`1.GST HO CS`), Bank Receipts (`Rec1 B1 Bank`), Cash Receipts (`Rec10 B8 Cash`), Advances, and Bill allocations (`New Ref`, `Agst Ref`, `On Account`). Supports `<HASCASHFLOW>Yes</HASCASHFLOW>`. |
| **Inbound Customers Connector** | `tally-connector/sync_customers_connector.js` | Extracts Sundry Debtors from Tally XML/live port, parses multi-line address, phone, GSTIN, PAN, and saves to `public.contact`. |
| **Inbound Suppliers Connector** | `tally-connector/sync_suppliers_connector.js` | Extracts Sundry Creditors from Tally XML/live port, parses terms, GSTIN, and saves to `public.contact` (`type = 'supplier'`). |
| **Inbound Stock Items Connector** | `tally-connector/sync_stock_items_connector.js` | Extracts Stock Items from Tally, parses HSN, GST Rates, UOM, opening quantity/rate/value, and saves to `public.inventory_item`. |
| **Inbound Bank & GL Connector** | `tally-connector/sync_bank_and_chart_accounts_connector.js` | Extracts all General Ledger & Bank ledgers from Tally, maps core accounts, and saves to `public.chart_account` & `public.bank_account`. |
| **Bank Auto-Discovery Script** | `tally-connector/discover_tally_banks.js` | Scans Tally for Bank and Cash ledgers and configures them in ERP. |
| **Group Hierarchy Connector** | `tally-connector/sync_tally_subgroups.js` | Synchronizes parent-child accounting tree between Tally and ERP. |
| **ERP Payments API** | `src/app/api/v1/payments/route.ts` | Handles ERP payments, resolves bank account UUIDs, and enqueues to `tally_sync_queue`. |
| **ERP Customer Credits API** | `src/app/api/v1/customer-credits/route.ts` | Handles ERP customer prepayments/advances, unifies receipt numbering (`REC-XXXXX`), and enqueues to `tally_sync_queue`. |
| **ERP Banking UI Pages** | `src/app/(dashboard)/accounting/banking/` | Full banking dashboard, transaction views, and settings. |

---

## 📑 2. Field-by-Field Entity Mapping Matrix

### A. Customers (`Sundry Debtors` ➔ `public.contact`)
* **Source XML**: `<LEDGER>` under Sundry Debtors
* **Script**: `tally-connector/sync_customers_connector.js`

| Tally XML Field | Connector Transformation | Destination Column (`public.contact`) |
|---|---|---|
| `<NAME>` | Sanitizes special characters | `name`, `tally_ledger_name` |
| `<ADDRESS.LIST>` (Multiple `<ADDRESS>` lines) | Merges array with `', '` | `billing_address_line1` (Clean 1-line address) |
| Address text & `<STATENAME>` | `resolveSmartCity(name, addr, state)` | `billing_city`, `billing_state` |
| `<PINCODE>` | 6-digit regex validation | `billing_pincode` |
| `<PARTYGSTIN>` / `<GSTIN>` | 15-char uppercase validation | `gstin`, `tax_number`, `gst_number` |
| *Derived from GSTIN* | Slices chars 3 to 12 (`gstin.slice(2, 12)`) | `pan_number` |
| `<LEDGERMOBILE>` / `<LEDGERPHONE>` | Cleans prefix and non-digits | `phone` |
| `<EMAIL>` | Trimmed lowercase | `email` |
| `<OPENINGBALANCE>` | Parses magnitude and sign | `opening_balance`, `opening_balance_type` (`Dr`/`Cr`) |
| `<GUID>` | Immutable Tally unique identifier | `tally_guid` |
| `<ALTERID>` | BigInt version tracking | `alter_id` |
| `<PARENT>` | Group detection (`HO` vs `BO`) | `printerCategory` |

---

### B. Suppliers (`Sundry Creditors` ➔ `public.contact`)
* **Source XML**: `<LEDGER>` under Sundry Creditors
* **Script**: `tally-connector/sync_suppliers_connector.js`

| Tally XML Field | Connector Transformation | Destination Column (`public.contact`) |
|---|---|---|
| `<NAME>` | Vendor Title | `name`, `tally_ledger_name` |
| Group Type | Creditor identification | `type = 'supplier'` |
| `<PARTYGSTIN>` | 15-char uppercase | `gstin`, `tax_number` |
| *Derived from GSTIN* | Slices chars 3 to 12 | `pan_number` |
| `<ADDRESS.LIST>` | Merges multi-line address into 1 line | `billing_address_line1` |
| `<OPENINGBALANCE>` | Opening payable magnitude and sign | `opening_balance`, `opening_balance_type` |
| `<GUID>` | Immutable Tally unique identifier | `tally_guid` |

---

### C. Stock Items (`Inventory` ➔ `public.inventory_item`)
* **Source XML**: `<STOCKITEM>`
* **Script**: `tally-connector/sync_stock_items_connector.js`

| Tally XML Field | Connector Transformation | Destination Column (`public.inventory_item`) |
|---|---|---|
| `<STOCKITEMNAME>` | Product Title | `name`, `tally_item_name` |
| *Auto SKU* | Category prefix + sequential index | `code` (e.g. `ACR-0001`, `BAN-0002`) |
| `<PARENT>` | Category / Stock Group | `category`, `tally_stock_group` |
| `<BASEUNITS>` | Standardized UOM (`sqft`, `nos`, `kgs`, `roll`) | `unit_of_measure`, `tally_uom` |
| `<GSTHSNNAME>` | HSN / SAC Code | `hsn_code` |
| `<GSTRATE>` | Maps Tally rate (e.g. 9% $\rightarrow$ 18% total) | `gst_rate` |
| `<OPENINGBALANCE>` | Quantity | `opening_quantity`, `quantity_on_hand` |
| `<OPENINGRATE>` | Rate per unit | `opening_rate`, `purchase_price` (cents) |
| `<OPENINGVALUE>` | Total Inventory Valuation | `opening_value`, `total_value` (cents) |
| `<GUID>` | Immutable Tally unique identifier | `tally_guid` |

---

### D. Chart of Accounts & Banks (`Ledgers` ➔ `public.chart_account` & `public.bank_account`)
* **Source XML**: `<LEDGER>`
* **Script**: `tally-connector/sync_bank_and_chart_accounts_connector.js`

| Tally Ledger | ERP GL Code | Classification | Linked ERP Drawer / Bank |
|---|:---:|---|---|
| **`Federal 2091`** | `1100` | Asset / Bank | `Federal Bank (****2091)` |
| **`Cash`** | `1000` | Asset / Cash | `Main Cash Drawer` |
| **`Cash B2`** | `1010` | Asset / Cash | `Cash B2 Drawer` |
| **`CGST`** | `2201` | Liability / Duties & Taxes | Output CGST |
| **`SGST`** | `2202` | Liability / Duties & Taxes | Output SGST |
| **`IGST`** | `2203` | Liability / Duties & Taxes | Output IGST |
| **`GST SALES`** | `4000` | Revenue / Operating | Sales Revenue |

---

### E. Outbound Vouchers Flow (ERP $\longrightarrow$ Tally)
* **Source**: `public.tally_sync_queue`
* **Processor**: `tally-connector/connector.js` + `tally-connector/xml-builder.js`

| ERP Transaction | Tally Voucher Type | Tally Bank/Cash Debit Ledger | Bill Allocation Mode |
|---|:---:|:---:|:---:|
| **Sales Invoice** (`HS1`, `HS2`, etc.) | `1.GST HO CS` | *(Party Debited)* | `New Ref` or `Agst Ref` |
| **Bank Advance Receipt** (`ADV-0001`, `ADV-0002`) | `Rec1 B1 Bank` | `Federal 2091` | `Advance` |
| **Cash Receipt** (`REC-9`) | `Rec10 B8 Cash` | `Cash` | `On Account` / `Agst Ref` |
| **Cash B2 Receipt** (`REC-00036`) | `Rec10 B8 Cash` | `Cash B2` | `Agst Ref` (`INV-00047`) |

---

## 🔒 3. Core Architectural Rules

1. **UUID / GUID Permanence**:
   * All ERP entities use internal UUIDs. Name or label changes in the UI will never break relational joins or Tally mapping.
2. **Cash Flow Accounting**:
   * All Receipt Vouchers exported to Tally include `<HASCASHFLOW>Yes</HASCASHFLOW>` and `<ISPARTYLEDGER>Yes</ISPARTYLEDGER>` on the bank/cash side so Tally immediately updates the Cash/Bank Summary register.
3. **Respective Drawer Routing**:
   * Every receipt dynamically checks the selected `bank_account_id` and routes the debit to its exact matching Tally ledger (`Federal 2091`, `Cash`, or `Cash B2`).
4. **Sequential Receipt Numbering**:
   * All receipts and advances use unified sequential numbering (`REC-XXXXX`).

---
*Created & Persisted on: 2026-09-01*
