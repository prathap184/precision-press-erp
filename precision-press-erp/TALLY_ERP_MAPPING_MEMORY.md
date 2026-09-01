# 🧠 PRECISION PRESS ERP — COMPLETE TALLY PRIME MAPPING MEMORY

> **Permanent Architectural Knowledge Base & Reconciliation Registry**  
> *Last Updated: August 23, 2026*

---

## 📌 1. Master System Architecture Overview

The ERP operates a **4-tier interconnected relational structure** directly mapped to Tally Prime:

```
                               ┌─────────────────────────────┐
                               │   TALLY PRIME (Port 9000)   │
                               │    1,532 Total Ledgers      │
                               │    582 Stock Items          │
                               │    183 Stock Groups         │
                               └──────────────┬──────────────┘
                                              │
               ┌──────────────────────────────┼──────────────────────────────┬──────────────────────────────┐
               │                              │                              │                              │
               ▼                              ▼                              ▼                              ▼
┌──────────────────────────────┐┌──────────────────────────────┐┌──────────────────────────────┐┌──────────────────────────────┐
│       public.contact         ││     public.chart_account     ││     public.bank_account      ││    public.inventory_item     │
│     (1,393 Subledgers)       ││     (221 GL Accounts)        ││    (3 Active Profiles)       ││     (582 Stock Items)        │
├──────────────────────────────┤├──────────────────────────────┤├──────────────────────────────┤├──────────────────────────────┤
│ • 1,260 Debtors (Customers)  ││ • Codes 1000 – 8200          ││ • Federal Bank (****2091)    ││ • 582 Raw & Finished Items   │
│ • 133 Creditors (Suppliers)  ││ • Complete GST & Duties      ││ • Main Cash Drawer           ││ • 183 Stock Groups / Cats    │
│ • 15-digit GSTIN & 10-PAN    ││ • Real Estate & Fixed Assets ││ • Cash B2 Drawer             ││ • 569 HSN / SAC Codes (18%)  │
│ • Real Geographic City       ││ • Capital (₹3.19 Cr)         ││                              ││ • ₹1.50 Cr Stock Valuation   │
│ • Deep Extracted Mobile      ││ • Retained P&L (₹1.79 Cr)    ││ 🔗 Foreign Key Link:         ││                              │
│ • Division (HO/BO/PO/SO)     ││ • Operating Incomes/Expenses ││    chart_account_id          ││ 🔗 Foreign Key Links:        │
└──────────────┬───────────────┘└──────────────┬───────────────┘└──────────────┬───────────────┘│    GL 1300, 4010, 5000       │
               │                               │                               │                └──────────────┬───────────────┘
               └───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
                                                       Mapped by:
                               `tally_item_name`, `tally_ledger_name`, `tally_guid`, `alter_id`
```

---

## ⚡ 2. Automatic Live Sales Invoicing Workflow (Manual Tally vs Auto-Sync Parity)

When you create an invoice in the ERP, it automatically syncs to Tally Prime and creates a **native Sales Voucher** identical to one typed by hand:

```
┌────────────────────────────────────────────────────────┐
│ 1. YOU CREATE INVOICE IN ERP                           │
│    • Customer: "Pixel Signage Mysore"                  │
│    • Product:  "03 Acrylic Sheet 3mm ~2.5mm- A3"       │
│    • Qty:      100 Sq Ft @ ₹78.46 = ₹7,846.00          │
│    • GST:      18% (CGST ₹706.14 + SGST ₹706.14)       │
│    • Total:    ₹9,258.28                               │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ Automatically triggers `enqueueTallySync`
                            ▼
┌────────────────────────────────────────────────────────┐
│ 2. SYNC QUEUE (`tally_sync_queue` table)               │
│    • Status: "PENDING" (Auto-queued in < 1 second)     │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ Connector Service polls every ~8 seconds
                            ▼
┌────────────────────────────────────────────────────────┐
│ 3. CONNECTOR TRANSLATES & SENDS TO PORT 9000           │
│    • Builds native Tally XML Sales Voucher             │
│    • Sends via HTTP POST to http://localhost:9000      │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ Tally Prime imports into Daybook
                            ▼
┌────────────────────────────────────────────────────────┐
│ 4. TALLY PRIME AUTO-CREATES THE NATIVE SALES VOUCHER   │
│    • Status in ERP: "SUCCESS" ✅                       │
└────────────────────────────────────────────────────────┘
```

### Side-by-Side Comparison: Manual Tally Typing vs Auto-Sync from ERP
| Voucher Component | If Typed Manually in Tally ⌨️ | If Auto-Synced from ERP 🚀 | Is It Identical? |
| :--- | :--- | :--- | :---: |
| **Voucher Type** | Sales Voucher (`VCHTYPE="Sales"`) | Sales Voucher (`VCHTYPE="Sales"`) | ✅ **100% Identical** |
| **Invoice No & Date** | Enters `INV-2026-001`, Date | Enters `INV-2026-001`, Date | ✅ **100% Identical** |
| **Customer Name** | Selects `"Pixel Signage Mysore"` | Sends `<PARTYLEDGERNAME>Pixel Signage Mysore</PARTYLEDGERNAME>` | ✅ **100% Identical** |
| **Stock Item** | Selects `"03 Acrylic Sheet 3mm"` | Sends `<STOCKITEMNAME>03 Acrylic Sheet 3mm ~2.5mm- A3</STOCKITEMNAME>` | ✅ **100% Identical** |
| **Quantity & Rate** | Types `100 sqft` @ `₹78.46` | Sends `<ACTUALQTY>100 sqft</ACTUALQTY>`, `<RATE>78.46/sqft</RATE>` | ✅ **100% Identical** |
| **Godown / Batch** | Selects `Main Location` | Sends `<GODOWNNAME>Main Location</GODOWNNAME>` | ✅ **100% Identical** |
| **Sales Ledger** | Credits `Cutting Charge 9997@18%` | Credits `Cutting Charge 9997@18%` | ✅ **100% Identical** |
| **Central Tax Line** | Adds `CGST` ledger (₹706.14) | Sends `<LEDGERNAME>CGST</LEDGERNAME>` (₹706.14) | ✅ **100% Identical** |
| **State Tax Line** | Adds `SGST` ledger (₹706.14) | Sends `<LEDGERNAME>SGST</LEDGERNAME>` (₹706.14) | ✅ **100% Identical** |
| **Bill Allocation** | Creates `New Ref: INV-2026-001` | Creates `<BILLTYPE>New Ref</BILLTYPE>` `<NAME>INV-2026-001</NAME>` | ✅ **100% Identical** |
| **Stock Deduction** | Deducts 100 sqft from Stock | Deducts 100 sqft from Stock | ✅ **100% Identical** |

---

## 📦 3. Master Inventory & Stock Master Status (Step 5 — 100% Ingested & Verified)

### Live Database Audit Summary:
| Metric | Count / Value in ERP Database | Status |
| :--- | :---: | :---: |
| **Total Stock Items Ingested (`inventory_item`)** | **582 Products** | ✅ **100% Complete** |
| **Total Stock Groups Ingested (`inventory_category`)**| **183 Groups** | ✅ **100% Complete** |
| **Products with Valid HSN / SAC Codes** | **569 Products** | ✅ **100% Complete** |
| **Products with Live Opening Stock** | **355 Products** | ✅ **100% Complete** |
| **Total Opening Stock Rupee Valuation** | **₹1,50,87,661.17 (₹1.50 Crore)** | ✅ **100% Complete** |
| **Default GST Tax Rate Applied** | **18%** (CGST 9% + SGST 9% / IGST 18%) | ✅ **100% Complete** |
| **Automated GL Account Linkage** | **GL `1300`** (Inventory), **GL `4010`** (Revenue), **GL `5000`** (COGS) | ✅ **100% Complete** |

### Sample Live Ingested Items in Supabase:
1. **`01 Acrylic Premium 1.0mm`** (`ACR-0001`):
   * Category: `Acrylic` | UOM: `sqft` | HSN: `39205111` | GST: `18%` | Stock: **268 Sq Ft** (₹4,933.11)
2. **`01 Acrylic Sheet 1.5mm`** (`ACR-0002`):
   * Category: `Acrylic` | UOM: `sqft` | HSN: `3920` | GST: `18%` | Stock: **352 Sq Ft** (₹17,359.80)
3. **`02 Acrylic Sheet 2mm ~1.7mm- A2`** (`ACR-0005`):
   * Category: `Acrylic` | UOM: `sqft` | HSN: `3921` | GST: `18%` | Stock: **4,407.97 Sq Ft** (₹2,53,412.90)
4. **`03 Acrylic Sheet 3mm ~2.5mm- A3`** (`ACR-0006`):
   * Category: `Acrylic` | UOM: `sqft` | HSN: `3921` | GST: `18%` | Stock: **4,004.10 Sq Ft** (₹3,14,172.06)
5. **`04 Acrylic Sheet 4mm ~3.5mm- A4`** (`ACR-0007`):
   * Category: `Acrylic` | UOM: `sqft` | HSN: `3921` | GST: `18%` | Stock: **2,308.94 Sq Ft** (₹2,07,317.22)
6. **`05 Acrylic Sheet 5mm ~4.5mm- A5`** (`ACR-0008`):
   * Category: `Acrylic` | UOM: `sqft` | HSN: `3921` | GST: `18%` | Stock: **1,529.64 Sq Ft** (₹1,74,655.89)

---

## 🌉 4. Two-Way Field Translation Bridge (How XML Tags Map to DB Columns)

Tally uses **XML Tags** (like `<BASEUNITS>`, `<STOCKITEM NAME>`, `<HSNCODE>`), while your ERP uses **Database Columns** (like `tally_uom`, `name`, `hsn_code`). The **Sync Connector** acts as a translator in both directions:

```
    [TALLY PRIME]                                         [ERP SUPABASE DATABASE]
    (XML Language)                                            (SQL Language)
          │                                                         │
          │ 1. <BASEUNITS>sqft</BASEUNITS>                          │
          ├─────────────────────────▶ TRANSLATOR ──────────────────▶│ column: tally_uom = 'sqft'
          │                           (Connector)                   │
          │                                                         │
          │ 2. <BASEUNITS>sqft</BASEUNITS>                          │
          │◀───────────────────────── TRANSLATOR ◀──────────────────┤ reads: item.tally_uom
```

### Ingestion Direction (Tally XML ➔ ERP Database):
* Tally `<STOCKITEM NAME="Acrylic 3mm">` ➔ `inventory_item.name` & `inventory_item.tally_item_name`
* Tally `<BASEUNITS>sqft</BASEUNITS>` ➔ `inventory_item.unit_of_measure` & `inventory_item.tally_uom`
* Tally `<HSNCODE>3921</HSNCODE>` ➔ `inventory_item.hsn_code`
* Tally `<GSTRATE>18.00</GSTRATE>` ➔ `inventory_item.gst_rate`
* Tally `<OPENINGBALANCE>4004.095 sqft</OPENINGBALANCE>` ➔ `inventory_item.quantity_on_hand` & `inventory_item.opening_quantity`

### Syncing Back Direction (ERP Database ➔ Tally XML Voucher):
* Reads `item.tally_item_name` ➔ Writes `<STOCKITEMNAME>Acrylic 3mm</STOCKITEMNAME>`
* Reads `item.tally_uom` ➔ Writes `<RATE>78.46/sqft</RATE>` & `<ACTUALQTY>100 sqft</ACTUALQTY>`
* Reads `invoice.cgst_total` ➔ Writes `<LEDGERNAME>CGST</LEDGERNAME>` `<AMOUNT>9000.00</AMOUNT>`

---

## 🏦 5. Bank Accounts & Cash Ledgers (Double-Entry Mapping)

*Operational Bank Profiles in `public.bank_account` linked to General Ledger in `public.chart_account`:*

| # | Bank Profile (`bank_account`) | Account Number | Opening Balance | Tally Ledger Name | Tally GUID | 🔗 Linked GL Account (`chart_account`) | GL Code | Country |
| :---: | :--- | :--- | :---: | :--- | :---: | :--- | :---: | :---: |
| **1** | **Federal Bank** | `****2091` | **₹915.00** (Dr) | `"Federal 2091"` | `b41e6417-...-00001712` | `Checking Account / Federal Bank` | **`1100`** | `IN` |
| **2** | **Main Cash Drawer** | `MAIN-CASH` | **₹31,73,956.00** (Cr) | `"Cash"` | `b41e6417-...-0000001f` | `Cash on Hand` | **`1000`** | `IN` |
| **3** | **Cash B2 Drawer** | `BRANCH-B2` | **₹74,042.00** (Cr) | `"Cash B2"` | `b41e6417-...-0000213e` | `Petty Cash / Cash B2` | **`1010`** | `IN` |

---

## 🏛️ 6. Master GST & Statutory Tax Chart of Accounts

*All Output Tax Liabilities and Input Tax Credits are mapped to exact Tally `Duties & Taxes` ledger names:*

| ERP Code | ERP Account Name | Type | Sub-Type | Tally Ledger Name | Tally Group | Opening Balance | Purpose & Flow |
| :---: | :--- | :---: | :---: | :--- | :--- | :---: | :--- |
| **`2201`** | **Output CGST Payable** | `liability` | `output_vat` | **`CGST`** | `Duties & Taxes` | **₹14,92,300.46 (Cr)** | 50% Central Tax on local Karnataka sales |
| **`2202`** | **Output SGST Payable** | `liability` | `output_vat` | **`SGST`** | `Duties & Taxes` | **₹0.00** | 50% State Tax on local Karnataka sales |
| **`2203`** | **Output IGST Payable** | `liability` | `output_vat` | **`IGST`** | `Duties & Taxes` | **₹0.00** | 100% Tax on out-of-state inter-state sales |
| **`1501`** | **Input CGST Receivable**| `asset` | `input_vat` | **`Input CGST`** | `Duties & Taxes` | **₹0.00** | ITC claimed on local supplier purchases |
| **`1502`** | **Input SGST Receivable**| `asset` | `input_vat` | **`Input SGST`** | `Duties & Taxes` | **₹0.00** | ITC claimed on local supplier purchases |
| **`1503`** | **Input IGST Receivable**| `asset` | `input_vat` | **`Input IGST`** | `Duties & Taxes` | **₹0.00** | ITC claimed on inter-state purchases |
| **`1500`** | **Input VAT / GST Receivable**| `asset` | `input_vat` | **`Input GST`** | `Duties & Taxes` | **₹0.00** | Consolidated master Input Tax Credit pool |
| **`1260`** | **Income Tax Receivable**| `asset` | `current` | **`Advance Tax Paid`** | `Current Assets` | **₹52,00,000.00 (Dr)** | Advance corporate income tax paid |
| **`2245`** | **Pension & Benefits Payable**| `liability` | `current` | **`EPF Payable`** | `Provisions` | **₹4,29,890.00 (Cr)** | Employee Provident Fund (PF) liability |
| **`2236`** | **Other Statutory Deductions**| `liability` | `current` | **`ESI Payable`** | `Provisions` | **₹52,596.00 (Cr)** | Employee State Insurance (ESI) liability |

---

## 🔍 7. ERP Database Schema Verification: GST Saving Parity (100% Match)

The ERP schema files (`src/lib/db/schema/invoicing.ts`, `bills.ts`, `payments.ts`, `bookkeeping.ts`) have dedicated, exact columns and tables matching every single GST transaction case in Tally Prime:

### 1️⃣ Customer Sales Invoice (`invoice` & `invoice_line`)
* **Header (`invoice`)**: `tax_total`, `cgst_total`, `sgst_total`, `igst_total`, `subtotal`, `total`
* **Line (`invoice_line`)**: `tax_amount`, `cgst_amount`, `sgst_amount`, `igst_amount`, `amount`
* **General Ledger (`journal_entry_line`)**: Credit posted to GL `2201 CGST`, GL `2202 SGST`, or GL `2203 IGST`

### 2️⃣ Supplier Purchase Bill (`bill` & `bill_line`)
* **Header (`bill`)**: `tax_total`, `cgst_total`, `sgst_total`, `igst_total`, `subtotal`, `total`
* **Line (`bill_line`)**: `tax_amount`, `cgst_amount`, `sgst_amount`, `igst_amount`, `amount`
* **General Ledger (`journal_entry_line`)**: Debit posted to GL `1501 Input CGST`, GL `1502 Input SGST`, or GL `1503 Input IGST`

### 3️⃣ & 4️⃣ Payment Receipts & Payments (`payment`)
* `payment.amount`: Pure monetary settlement. **No GST fields**, matching Tally where payments do not have tax lines.

### 5️⃣ Credit Notes (`credit_note` & `credit_note_line`)
* **Header (`credit_note`)**: `tax_total`, `subtotal`, `total`
* **Line (`credit_note_line`)**: `tax_amount`, `amount`
* **General Ledger (`journal_entry_line`)**: Debit posted to GL `2201 CGST` / `2202 SGST` / `2203 IGST` (Tax Reversal)

### 6️⃣ Debit Notes & Supplier Credits (`supplier_credit` / `debit_note`)
* Stores `tax_amount` and posts an ITC reversal credit to GL `1501/1502/1503`.

### 7️⃣ Customer Prepayments & Advances (`customer_credit`)
* Tracks `original_amount`, `amount_remaining`, and links via `journal_entry_id` to double-entry tax provisions (GL `2240` / `2201`), matching Tally `<ISGSTADVANCE>Yes</ISGSTADVANCE>`.

---

## 👥 8. Customers / Debtors Subledger (`public.contact`, `type = 'customer'`)

* **Total Count in Database**: **1,260 Customer Records**
* **Rollup General Ledger Account**: **`1200 Accounts Receivable`**
* **Division Classifications (`printerCategory` & `remarks`)**:
  * `Debtors HO` (Head Office) ➔ `printerCategory: 'HO'`
  * `Debtors Fiber Laser SO` (Laser Cutting Branch) ➔ `printerCategory: 'SO'`
  * `Debtors Print PO` (Printing Branch) ➔ `printerCategory: 'PO'`
  * `Debtors Warehouse BO` (Warehouse Branch) ➔ `printerCategory: 'BO'`
  * `Debtors Glass GO` (Glass Division) ➔ `printerCategory: 'BO'`
  * `Debtors Aspire`, `UV Debtor UVPRO`, `Debtors Kinetic`, `Debtors Sublimation TO`

---

## 🏢 9. Suppliers / Creditors Subledger (`public.contact`, `type = 'supplier'`)

* **Total Count in Database**: **133 Supplier Records**
* **Rollup General Ledger Account**: **`2000 Accounts Payable`**
* **Division Classifications (`printerCategory` & `remarks`)**:
  * `Sundry Creditors` (Raw Material & Machine Suppliers) ➔ `printerCategory: 'CREDITOR'`
  * `Sundry Creditor IRWIN` (Local Irwin Road Vendors) ➔ `printerCategory: 'CREDITOR'`
  * `Sundy Creditors- HO` (Head Office Material Suppliers) ➔ `printerCategory: 'CREDITOR'`
  * `Sundry Creditors Advance` (`Colorjet India Ltd`, `D Nagraj Auditor`) ➔ `printerCategory: 'CREDITOR'`
  * `Glass Creditor` (`Balaji Industries- Vapi- GX`) ➔ `printerCategory: 'CREDITOR'`
  * `Aludecor Sundar` (`Aishwarya Convention`, `Dreams Interiors`, `ENNYESK`) ➔ `printerCategory: 'CREDITOR'`

---

## 📁 10. Sync Connector Scripts Directory

All automated Port 9000 connector scripts are maintained in:
`precision-press-erp/tally-connector/`

1. **`connector.js`** ➔ Background polling service that reads `tally_sync_queue` and posts native XML vouchers to Tally Port 9000.
2. **`sync_stock_items_connector.js`** ➔ Ingests all 582 stock items and 183 stock groups with HSN, GST, UOM, and opening valuation.
3. **`sync_customers_connector.js`** ➔ Synchronizes all 1,260 customers with deep phone, smart city, PAN, and division mapping.
4. **`sync_suppliers_connector.js`** ➔ Synchronizes all 133 suppliers with GSTIN, PAN, and opening balances.
5. **`sync_bank_and_chart_accounts_connector.js`** ➔ Synchronizes all 221 General Ledger accounts and links operational bank profiles.
6. **`fast_enrich_metadata.js`** ➔ Enriches all 582 items with Direct vs Non-Direct metadata and base rates.
7. **`verify_stock_audit.js`** ➔ Live stock items and valuation audit tool.
8. **`verify_final_audit.js`** ➔ Live reconciliation and integrity testing tool.

---

## 🏷️ 11. Direct Selling vs Non-Direct Selling Architecture

The ERP automatically classifies the **582 Tally Stock Items** into two functional business types using the Tally `<BASEUNITS>` (Unit of Measure) tag:

```
                          ┌───────────────────────────────┐
                          │   582 TOTAL TALLY PRODUCTS    │
                          └───────────────┬───────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
       ┌─────────────────────┐                         ┌─────────────────────┐
       │   DIRECT SELLING    │                         │ NON-DIRECT SELLING  │
       │     (395 Items)     │                         │     (187 Items)     │
       └──────────┬──────────┘                         └──────────┬──────────┘
                  │                                               │
        UOM: N, No, pc, Set,                            UOM: sqft, Sh, R,
             Box, Pkt                                        Kg, Mt, lt
                  │                                               │
      Sold count-by-count (Pieces)                    Sold by Area/Dimensions (Sq.Ft)
     Uses Unit Cost & Selling Price                  Uses Base Rate & Dimension Calc
```

### 📊 Classification Summary & Rules

| Classification | Count | Tally `<BASEUNITS>` | ERP `metadata` Flag | ERP UI & Calculation Behavior |
| :--- | :---: | :--- | :--- | :--- |
| **Direct Selling** | **395 Items** | `N`, `No`, `pc`, `Set`, `Box`, `Pkt` | `{"isDirectSelling": true}` | Displays **"Units on hand"**.<br>Standard unit billing (e.g. Qty: 2 $\times$ ₹166.73). |
| **Non-Direct Selling** *(Custom Fabrication / Raw Media)* | **187 Items** | `sqft`, `Sh`, `R`, `Kg`, `Mt`, `lt`, `ft` | `{"isDirectSelling": false, "baseRate": 78.46}` | Displays **"Sq.Ft on hand"**.<br>Triggers Width $\times$ Height dimensional calculator (e.g. 4ft $\times$ 6ft = 24 sq.ft $\times$ ₹102.00). |

---

### 🔍 Real-World Master Data Examples

#### 1️⃣ Direct Selling Example: `CP 22 Medium Grey` (Spray Can)
* **Tally XML Data**:
  * `<STOCKITEM NAME="CP 22 Medium Grey">`
  * `<PARENT>Spray</PARENT>`
  * `<BASEUNITS>N</BASEUNITS>`
  * `<OPENINGBALANCE> 2.00 N</OPENINGBALANCE>`
  * `<OPENINGRATE>128.25/N</OPENINGRATE>`
  * `<OPENINGVALUE>-256.50</OPENINGVALUE>`
* **ERP Database State**:
  * `code`: `SPR-0566`
  * `quantity_on_hand`: `2`
  * `purchase_price`: `12825` (₹128.25)
  * `sale_price`: `16673` (₹166.73)
  * `metadata`: `{"isDirectSelling": true}`
* **Sales Sync Flow**: When sold, decreases Tally stock by $N$ units.

#### 2️⃣ Non-Direct Selling Example: `03 Acrylic Sheet 3mm ~2.5mm- A3` (Raw Sheet)
* **Tally XML Data**:
  * `<STOCKITEM NAME="03 Acrylic Sheet 3mm ~2.5mm- A3">`
  * `<PARENT>Acrylic</PARENT>`
  * `<BASEUNITS>sqft</BASEUNITS>`
  * `<OPENINGBALANCE> 4004.095 sqft</OPENINGBALANCE>`
  * `<OPENINGRATE>78.46/sqft</OPENINGRATE>`
  * `<OPENINGVALUE>-314172.06</OPENINGVALUE>`
* **ERP Database State**:
  * `code`: `ACR-0003`
  * `quantity_on_hand`: `4004` (4,004.095 sq.ft)
  * `purchase_price`: `7846` (₹78.46)
  * `sale_price`: `10200` (₹102.00)
  * `metadata`: `{"isDirectSelling": false, "baseRate": 102.00}`
* **Sales Sync Flow**: Order specifies job dimensions (e.g. 4ft $\times$ 6ft = 24 sqft). Invoice charges 24 sqft $\times$ ₹102.00. Tally stock reduces by exactly 24.00 sqft.

---

## 🏛️ 12. Isolated Opening Balance Architecture (Day 1 Starting Scoreboards)

### 1. 🛡️ The Golden Accounting Rule:
* **Opening balances are STATIC STARTING NUMBERS.** They define the Day 1 starting scoreboard for each ledger.
* Setting an opening balance **NEVER** generates automated background journal entries or bank movements.
* Setting a Customer opening balance **NEVER** touches Bank Accounts or Sales Revenue.
* Setting a Bank opening balance **NEVER** touches Customers or Suppliers.
* **Only NEW live Invoices and Receipts created during daily operations** generate double-entry vouchers and auto-sync to Tally Prime.

### 2. 🗄️ Database Fields & UI Locations:

| Entity | DB Table | DB Field(s) | UI Location | Effect on UI |
| :--- | :--- | :--- | :--- | :--- |
| **Customers** | `public.contact` | `opening_balance`<br>`opening_balance_type` | `/accounting/contacts/[id]` *(Details Tab)* | Shows as **`STARTING BALANCE`** on Statement & live **`OWES YOU`** |
| **Suppliers** | `public.contact` | `opening_balance`<br>`opening_balance_type` | `/accounting/contacts/[id]` *(Details Tab)* | Shows as **`STARTING BALANCE`** on Statement & live **`YOU OWE`** |
| **Bank Accounts** | `public.bank_account` | `opening_balance`<br>`opening_balance_type`<br>`balance` | `/accounting/banking/[id]/settings` | Sets starting cash/bank card & **`Opening Balance`** row on Bank Ledger |
| **Chart of Accounts** | `public.chart_account` | `opening_balance`<br>`opening_balance_type` | `/accounting/accounts/[id]/settings` | Sets starting line & running balance on Account Ledger |
| **Stock Items** | `public.inventory_item` | `quantity_on_hand`<br>`opening_quantity`<br>`purchase_price` | `/accounting/inventory/[id]` | Sets starting stock quantity & ₹1.508 Cr opening valuation |

### 3. 🔗 Bank Account $\leftrightarrow$ GL Account Synchronization:
* Each `bank_account` is linked to a `chart_account` via `chart_account_id` (e.g. Federal Bank $\leftrightarrow$ GL 1100 Checking Account).
* Updating the opening balance on a Bank Account automatically synchronizes its linked Chart of Account opening balance simultaneously, ensuring a single source of truth with **ZERO double-counting**!

---

## 🚀 13. Live Sync Implementation Status & Pending Tasks

### ✅ Completed & Active Components:
1. **Master Ledger Ingestion**: 1,260 Debtors, 133 Creditors, 582 Stock Items (395 Direct / 187 Non-Direct), 221 Chart of Accounts, and 3 Bank Profiles completely mapped to Tally.
2. **Tally XML Engine**: Full XML generators and parsers (`src/lib/actions/tally-xml-parser.ts`, `tally-connector/`) for `Sales`, `Receipt`, `Payment`, `Contra`, `Journal`, and `Ledger` masters.
3. **Idempotent Sync Queue**: `tally_sync_queue` table and `enqueueTallySync()` server action in `src/lib/actions/tally-sync.ts`.
4. **Manual Sync Operations UI**: `/tally` dashboard page with manual trigger buttons for batch syncing Invoices, Receipts, Payments, Contra, Journals, and Masters.

### ⏳ Remaining Work To Build (Pending Live Auto-Trigger):
1. **Automatic Live Enqueue Hooks in Backend API Routes**:
   * **Invoices (`src/app/api/v1/invoices/route.ts`)**: Wire `enqueueTallySync({ syncType: 'SALES_INVOICE', ... })` directly after invoice creation/approval so every new invoice automatically enters the Tally queue without manual clicks.
   * **Customer Prepayments & Receipts (`src/app/api/v1/customer-credits/route.ts` & `src/app/api/v1/payments/route.ts`)**: Wire `enqueueTallySync({ syncType: 'RECEIPT_VOUCHER', ... })` on receipt saving and bill allocation.
   * **New Customers / Contacts (`src/app/api/v1/contacts/route.ts`)**: Auto-enqueue new customer ledgers (`CUSTOMER_LEDGER`) when created from proxy order or contacts page.
2. **Local Connector Execution**:
   * Run background connector service (`node tally-connector/connector.js`) on the local Accounting PC pointing to TallyPrime at `http://localhost:9000`.
3. **Live Daybook Reconciliation**:
   * Verify test transactions pass to TallyPrime with 0 errors and show up in the Daybook under proper bill references (`New Ref` / `Agst Ref`).

---

## 📑 14. Real Tally Native XML Vouchers & Master Analysis (`tally_sync/all ledgers/`)

Analysis of the three ground-truth XML exports from TallyPrime (`Hindustan Enterprises 25-26`):

### 1. `Sales_HS7547.xml` (Single Full-Spec e-Invoice Sales Voucher — 39.85 KB)
* **Voucher Type**: `1.GST HO CS` (Head Office Cash/Credit Sale, Class: `GST Sale`)
* **Voucher Number**: `HS7547` | **Date**: `01-Aug-2026`
* **Customer**: `Image Media Solutions- HO- IMX` (GSTIN: `29AADFI9241C1ZG`, Place of Supply: `Karnataka`)
* **Company GSTIN**: `29AFHPP0687G1Z2` (`Karnataka Registration`)
* **e-Invoice (IRN / QR Code)**:
  * `IRN`: `225f3da596f1e605f6ab1ea7b618f8eb07d95e8ce7ff1557fd2814e888af035a`
  * `IRNACKNO`: `112631910586506` | `IRNACKDATE`: `2026-08-11 16:17:00`
  * `IRNQRCODE`: Full signed JWT token embedded.
* **Line Item**: `Dow 789= Clear/24` (HSN: `32141000`, Qty: `1.00 N`, Rate: `₹211.86/N`, Amount: `₹211.86`, Godown: `B1`)
* **Ledger Allocations**:
  * `GST SALES` $\rightarrow$ Credit `₹211.86`
  * `CGST (9%)` $\rightarrow$ Credit `₹19.07`
  * `SGST (9%)` $\rightarrow$ Credit `₹19.07`
  * `Image Media Solutions- HO- IMX` $\rightarrow$ Debit `₹250.00` (Negative in XML: `-250.00`)
* **Bill-Wise Allocation**:
  * `<BILLTYPE>New Ref</BILLTYPE>`
  * `<NAME>HS7547</NAME>`
  * `<AMOUNT>-250.00</AMOUNT>`

---

### 2. `listofallsalevorcher.xml` (Daybook Batch Export of 21 Sales Vouchers — 699.09 KB)
* **21 Total Vouchers** across all operational branches:
  * **`1.GST HO CS` (13 Vouchers)**: Head Office Sales (`HS7547` to `HS7559`)
  * **`GST BO CREDIT` (5 Vouchers)**: Branch Office Credit Sales (`BC3505` to `BC3509`)
  * **`GST PO CASH` (2 Vouchers)**: Printing Office Cash Sales (`PS1166`, `PS1167`)
  * **`GST AO Sales` (1 Voucher)**: Acrylic Division Sales
* **14 Unique Customer Ledgers & 23 Unique Stock Items** spanning dimensional materials and unit products.

---

### 3. `Transactions.xml` (Composite Master + Voucher Structure — 499.96 KB)
* **11 Master Groups**: `Sales Accounts`, `Duties & Taxes`, `Current Liabilities`, `Current Assets`, `Sundry Debtors`, `Debtors HO`, `Debtors Warehouse BO`, `Cash-in-hand`, `Indirect Expenses`, `Indirect Incomes`.
* **11 Master Ledgers**:
  * **Sales / Revenue**: `GST SALES` (under `Sales Accounts`)
  * **Duties / Taxes**: `CGST`, `SGST`, `IGST` (under `Duties & Taxes`)
  * **Logistics / Freight**: `zForwarding Charge- Sale` (under `Indirect Incomes`)
  * **Rounding**: `Round Off` (under `Indirect Expenses`)
  * **Cash**: `Cash` (under `Cash-in-hand`)
  * **Debtors**: `Image Media Solutions- HO- IMX`, `Pixel Perceptions- Mys`, `P5 INDIA- BO`
* **6 Stock Items**: Complete with UOMs (`N`, `sqft`), HSNs (`32141000`, `3920`, `3921`), and GST tax rates (18%).
* **5 Sample Vouchers**: `HS7547`, `HS7548`, `PS1166`, `BC3505`, `PS1167`.

---

### 🎯 Key Production Takeaways for ERP Auto-Sync:
1. **Official Sales Ledger**: Always credit **`GST SALES`** for taxable turnover.
2. **Official Tax Ledgers**: Use exact Tally names: **`CGST`**, **`SGST`**, **`IGST`**.
3. **Official Logistics Ledger**: Map delivery/transport charges to **`zForwarding Charge- Sale`**.
4. **Official Rounding Ledger**: Map round-off adjustments to **`Round Off`**.
5. **Bill-Wise Tracking**: Every invoice voucher must include `<BILLALLOCATIONS.LIST>` with `<BILLTYPE>New Ref</BILLTYPE>` and `<NAME>{Invoice Number}</NAME>`.

---

## 📑 15. Bill-Wise Allocation Mechanics: `New Ref` vs `Agst Ref` in Sales & Receipts

### 1. The Core Bill Allocation Rules in Tally:
* **`New Ref` (New Reference)**: Creates a new pending bill/demand for payment (e.g. Sales Invoice #`HS7547`).
* **`Agst Ref` (Against Reference)**: Settles/closes an existing pending bill reference (e.g. Receipt paying #`HS7547` or Invoice consuming Advance deposit).
* **`Advance`**: Records prepayment from a customer before an invoice exists (e.g. Advance Receipt #`ADV-101`).
* **`On Account`**: Records lump-sum payments without specifying exact invoice numbers.

---

### 2. Can a Sales Invoice have `Agst Ref`? YES! 🎯

```
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │                              THE 2 FLOWS OF A SALES INVOICE                            │
 ├────────────────────────────────────────────────────────────────────────────────────────┤
 │ FLOW A: Standard Credit Sale (Customer pays LATER)                                     │
 │ 1. Today:  Sales Invoice generated ──────▶  <BILLTYPE>New Ref</BILLTYPE> (HS7547)      │
 │ 2. Later:  Customer pays money     ──────▶  <BILLTYPE>Agst Ref</BILLTYPE> (HS7547)     │
 ├────────────────────────────────────────────────────────────────────────────────────────┤
 │ FLOW B: Advance / Pre-paid Sale (Customer paid BEFORE the bill)                        │
 │ 1. Earlier: Customer paid ₹5,000 Advance  ──▶ <BILLTYPE>Advance</BILLTYPE> (ADV-101)  │
 │ 2. Today:   Final Sales Invoice generated ──▶ <BILLTYPE>Agst Ref</BILLTYPE> (ADV-101) │
 │             (Invoice is INSTANTLY marked PAID using their existing advance!)           │
 └────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Real Examples from `listofallsalevorcher.xml`:
* **Invoice #1 (`HS7547`)**: Uses **`New Ref: HS7547`** for ₹250.00 (Customer pays later).
* **Invoice #11 (`AC786`)**: Uses **`Agst Ref: AC786`** for ₹1,300.00 (Settled against advance).
* **Invoice #20 (`BC3509`)**: Uses **`Agst Ref: BC3509`** for ₹1,35,936.00 (Settled against order advance).

---

### 3. Summary Mapping Table for ERP Synchronization:

| Customer Payment Timing | Sales Invoice Bill Type in XML | Receipt Voucher Bill Type in XML | Result in Tally |
| :--- | :--- | :--- | :--- |
| **Credit Sale** (Pay later) | `<BILLTYPE>New Ref</BILLTYPE>` | `<BILLTYPE>Agst Ref</BILLTYPE>` | Opens unpaid bill $\rightarrow$ Paid when receipt arrives |
| **Full Advance Prepayment** | `<BILLTYPE>Agst Ref</BILLTYPE>` | `<BILLTYPE>Advance</BILLTYPE>` | Pre-recorded advance $\rightarrow$ Closed immediately upon billing |
| **Partial Advance** (e.g. ₹500 adv on ₹1,000 bill) | Split: `Agst Ref ₹500` + `New Ref ₹500` | `<BILLTYPE>Advance</BILLTYPE>` | ₹500 advance consumed, ₹500 remains outstanding |
| **Counter Cash / Immediate UPI** | Cash/Bank ledger debit | N/A (Direct settlement) | Zero debt balance |

---

## 📑 16. Live End-to-End Invoice Queue Integration & TallyPrime Company Setup

### 1. Live Verification of Auto-Enqueued Sales Invoices (`INV-00043`):
Successfully created and verified live queue entry generated by ERP Sales Invoice endpoint (`src/app/api/v1/invoices/route.ts`):
* **Sync Event ID**: `TSYNC-S-1787726931361-AV6`
* **Voucher Number / ID**: `INV-00043`
* **Customer**: `5C Shimoga Hidayath` (Customer ID: `f29dca90-b33b-4868-8e95-9ba2c868338f`)
* **Item**: `01 Acrylic Premium 1.0mm (5 FT x 5 FT)` (Quantity: 100 N, Rate: ₹23.91, Taxable: ₹597.75)
* **Godown**: Passed as **`B1`** in both `<BATCHALLOCATIONS.LIST><GODOWNNAME>` and `<UDF:HECOMMONGODOWN>`.
* **Taxes**: `CGST 9% (₹53.80)`, `SGST 9% (₹53.80)`, Total: `₹705.35`.
* **Bill-Wise Allocation**: `<BILLTYPE>New Ref</BILLTYPE>`, `<NAME>INV-00043</NAME>`, `<AMOUNT>-705.35</AMOUNT>`.
* **Ledgers Used**: `GST SALES`, `CGST`, `SGST`, `zForwarding Charge- Sale`, `Round Off`.

### 2. Multi-Warehouse Data Population (`public.warehouse_stock`):
* Standardized default warehouse name and code to **`Godown B1` (Code: `B1`)**.
* Populated **all 582 items** in `public.warehouse_stock` linking directly to `Godown B1`.
* Integrated **Warehouse & Godown Location** display card into product details page (`/accounting/inventory/[id]`).
* Integrated **Warehouse / Godown** selector into New Inventory Item drawer (`src/components/dashboard/create-drawer.tsx`).

### 3. Contact Search Upgrade:
* Upgraded `/api/v1/contacts` and `ContactPicker` limit from 500 to **2,500 contacts** so all **1,393 customers** load and search instantly.
* Enabled multi-field filtering across `Name`, `Phone`, `Email`, and `GSTIN/TaxNumber`.

### 4. TallyPrime Company Creation Configuration:
When setting up the target company in TallyPrime for live connector sync:
* **Company Name**: `Hindustan Enterprises 25-26` *(or active ERP org name e.g. `Auravionx`)*
* **Financial Year Beginning From**: `1-Apr-26` *(or `1-Apr-2026`)*
* **Books Beginning From**: `1-Apr-26` *(or `1-Apr-2026`)*
* **State**: `Karnataka` (State Code: `29`)
* **Country**: `India`
* **Base Currency Symbol**: `₹` | **Formal Name**: `INR`
* **Enable GST (F11)**: `Yes` (GSTIN: `29AFHPP0687G1Z2`, Registration: `Regular`, Periodicity: `Monthly`)

---

## 📑 17. The 7 Real-Time Tally Impacts on Live Sales Invoice Sync

When any invoice is created in ERP and synced to TallyPrime, exactly 7 core places update automatically in real-time:

1. **Day Book (`Gateway of Tally` ➔ `Day Book`)**:
   * Logs the native voucher under `1.GST HO CS` with invoice number `INV-00043` (`HS1`) for `₹705.35`.
2. **Customer Ledger (`Account Books` ➔ `Ledger` ➔ `5C Shimoga Hidayath`)**:
   * Debits the customer account (`₹705.35 Dr`) and opens `<BILLTYPE>New Ref: INV-00043</BILLTYPE>`.
3. **Profit & Loss Statement (`Gateway of Tally` ➔ `Profit & Loss A/c`)**:
   * Credits `GST SALES` revenue account (`₹597.75 Cr`), immediately reflecting in Gross and Net Profit.
4. **Company Balance Sheet (`Gateway of Tally` ➔ `Balance Sheet`)**:
   * Increases Current Assets (`Sundry Debtors: +₹705.35`) and Current Liabilities (`Duties & Taxes: +₹107.60` = CGST `₹53.80` + SGST `₹53.80`). Balanced perfectly (`₹705.35 = ₹705.35`).
5. **Stock Summary & Godowns (`Gateway of Tally` ➔ `Stock Summary`)**:
   * Reduces physical inventory specifically from **`Godown B1`** (e.g. `100.00 N` outwards of `01 Acrylic Premium 1.0mm`) with the monthly August bar chart.
6. **GST Returns / GSTR-1 (`Display More Reports` ➔ `GST Reports` ➔ `GSTR-1`)**:
   * Automatically populates under B2B/B2C with Taxable turnover (`₹597.75`), CGST, SGST, and HSN Table 12.
7. **Bills Receivables & Aging (`Statement of Accounts` ➔ `Outstandings` ➔ `Receivables`)**:
   * Enters the bill into outstanding receivables tracking with age and due date until customer payment receipt is posted.

---

## 📑 18. Bank & Cash Accounts Synchronization & Master Hierarchy

### 1. Bank and Cash Ledgers Populated in Tally:
* **`Federal 2091`** (Parent: `Bank Accounts`):
  * Running Balance: `₹915.00 Cr` (`-₹915.00`)
* **`Cash` (Main Cash Drawer)** (Parent: `Cash-in-hand`):
  * Running Balance: `₹31,73,956.41 Dr`
* **`Cash B2` (Branch B2 Drawer)** (Parent: `Cash-in-hand`):
  * Running Balance: `₹74,042.00 Dr`

### 2. Stock Categories Configured:
* `Acrylic`, `ACP`, `Flex & Banner`, `Vinyl & Lamination`, `Spray & Paints`, `Foam Board & Sunpack`, `LED & Power Supplies`, `Polycarbonate & Multiwall`, `Adhesives & Sealants`.

### 3. Stock Groups Configured:
* `Acrylic`, `Spray`, `ACP Sheets`, `Flex Material`, `Vinyl Rolls`, `Hardware & Accessories`, `Print Media`.

### 4. Divisional Customer Debtors Hierarchy:
* `Sundry Debtors`:
  * `Debtors HO` (Head Office Credit Debtors)
  * `Debtors Warehouse BO` (Branch Office Debtors)
  * `Debtors Print PO` (Print Division Debtors)
  * `Debtors Fiber Laser SO` (Laser & CNC Jobwork Debtors)
  * `Debtors Glass GO` (Glass Division Debtors)
  * `Debtors Aspire` (Aspire Project Division)

---

## 📑 19. Complete Receipt & Agst Ref Synchronization Architecture (25 Pin-to-Pin Fields & FIFO Engine)

### 1. The 3 Types of Customer Receipts in TallyPrime:

```
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │                              THE 3 CUSTOMER RECEIPT TYPES                              │
 ├────────────────────────────────────────────────────────────────────────────────────────┤
 │ 1. ON ACCOUNT: Lump-sum payment received with no specific invoice specified.          │
 │    • Bill Allocation: <BILLTYPE>On Account</BILLTYPE>                                  │
 │    • Bill Name: <NAME>REC-0001</NAME> (Exact Receipt Table ID)                         │
 ├────────────────────────────────────────────────────────────────────────────────────────┤
 │ 2. NEW REF / ADVANCE: Prepayment received before an invoice is billed.                │
 │    • Bill Allocation: <BILLTYPE>Advance</BILLTYPE> (or <BILLTYPE>New Ref</BILLTYPE>)   │
 │    • Bill Name: <NAME>ADV-0001</NAME> (Unique Advance Reference ID)                    │
 ├────────────────────────────────────────────────────────────────────────────────────────┤
 │ 3. AGST REF (Against Reference): Payment clearing one or multiple specific bills.     │
 │    • Bill Allocation: <BILLTYPE>Agst Ref</BILLTYPE>                                    │
 │    • Bill Name: <NAME>INV-00045</NAME> or <NAME>BC515</NAME> (Target Bill Number)      │
 └────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 2. The 25 Pin-to-Pin Fields Required for 100% Tally XML Compliance:

| Category | # | XML Field Tag | Mandatory | Example Value | Description |
| :--- | :---: | :--- | :---: | :--- | :--- |
| **Envelope & Company Header** | **1** | `<TALLYREQUEST>` | **YES** | `Import Data` | Core Tally request type |
| | **2** | `<REPORTNAME>` | **YES** | `Vouchers` | Specifies voucher payload |
| | **3** | `<SVCURRENTCOMPANY>` | **YES** | `Hindustan Enterprises 25-26` | Active target company in Tally |
| **Voucher Header & Audit** | **4** | `VCHTYPE` / `<VOUCHERTYPENAME>` | **YES** | `Rec1 B1 Bank` / `1.GST HO CS` | Exact voucher type series in Tally |
| | **5** | `ACTION` | **YES** | `Create` | Action mode |
| | **6** | `OBJVIEW` | **YES** | `Accounting Voucher View` | Standard double-entry view |
| | **7** | `<DATE>` | **YES** | `20260831` | Transaction date (`YYYYMMDD`) |
| | **8** | `<VCHSTATUSDATE>` | **YES** | `20260831` | Audit status posting date |
| | **9** | `<EFFECTIVEDATE>` | **YES** | `20260831` | Effective ledger posting date |
| | **10** | `<GUID>` | **YES** | `TSYNC-R-1787726900000-ADV` | Unique ID preventing duplicates |
| | **11** | `<VOUCHERNUMBER>` | **YES** | **`ADV-0001`** / **`INV-00045`** | **Exact DB Table ID / Number** |
| | **12** | `<PARTYLEDGERNAME>` | **YES** | `Festive Events- Mys- FTM- BO` | Customer name in Sundry Debtors |
| | **13** | `<NARRATION>` | Optional | `Receipt against ADV-0001` | Transaction narration in Day Book |
| | **14** | `<CMPGSTIN>` | **YES** | `29AFHPP0687G1Z2` | Company GSTIN |
| **Customer Party Ledger & Bill Allocation** | **15** | `<LEDGERNAME>` (Party) | **YES** | `Festive Events- Mys- FTM- BO` | Customer ledger |
| | **16** | `<ISDEEMEDPOSITIVE>` (Party) | **YES** | `No` (Receipt) / `Yes` (Sales) | Debit/Credit balance indicator |
| | **17** | `<ISPARTYLEDGER>` | **YES** | `Yes` | Enables bill-by-bill table |
| | **18** | `<AMOUNT>` (Party) | **YES** | `1000.00` | Customer transaction amount |
| | **19** | `<BILLALLOCATIONS.LIST>` | **YES** | `Block` | Starts bill-wise allocation |
| | **20** | **`<NAME>`** | **YES** | **`ADV-0001`** / **`INV-00045`** | **Reference ID (From Table ID)** |
| | **21** | **`<BILLTYPE>`** | **YES** | **`Advance` / `On Account` / `Agst Ref`** | Allocation mechanism |
| **Bank / Cash Ledger Entry** | **22** | `<LEDGERNAME>` (Bank/Cash) | **YES** | `Rec1 B1 Bank` / `ICICI 4415` | Bank or Cash account |
| | **23** | `<ISDEEMEDPOSITIVE>` (Bank) | **YES** | `Yes` | Bank Debit indicator |
| | **24** | `<ISPARTYLEDGER>` (Bank) | **YES** | `No` | Bank is an asset account |
| | **25** | `<AMOUNT>` (Bank) | **YES** | `-1000.00` | Balancing negative debit |

---

### 3. Chronological FIFO Engine & Advance Settlement Rules:

1. **Chronological Sorting (`ORDER BY createdAt ASC`)**:
   * Advance receipt **`ADV-0001` (Timestamp: `2026-08-26`)** syncs to Tally **FIRST**.
   * Invoices **`INV-00045` & `INV-00046` (Timestamp: `2026-08-30`)** sync to Tally **SECOND**.
   * Tally finds existing `ADV-0001` and consumes the advance with **0 reference errors**!

2. **Self-Contained Payload Architecture**:
   * Every record in `tally_sync_queue` stores the entire 25-field dataset inside `payload` JSON.
   * Local connector requires **ZERO external table lookups** during execution.

3. **Two-Way Synchronization Status Update**:
   * Upon `<CREATED>1</CREATED>` response from Tally:
     * `tally_sync_queue` $\rightarrow$ `status: 'SUCCESS'`, `processedAt: NOW()`, `tallyResponse: rawXml`.
     * Source records (`orders`, `invoices`, `payments`, `customer_credit`) $\rightarrow$ `is_tally_synced: true`, `tally_synced_at: NOW()`.
   * UI displays green **`✓ Synced to Tally`** badge across all invoice and receipt screens.

4. **Clean Ledger Guarantee (Zero Duplicate Day Book Entries)**:
   * Removed redundant `customer_credit_application` journal vouchers.
   * `Agst Ref` invoices settle directly against `ADV-0001` inside the native Sales Invoice voucher, keeping Day Book and Financial Statements completely clean.

---

## 📂 20. Dedicated Connector Suite & File System Directory Map

| Purpose / Module | File Path | Detailed Description & Responsibilities |
|---|---|---|
| **Live Outbound Sync Connector** | `tally-connector/connector.js` & `tally_sync/connector.js` | Background real-time poller that reads `tally_sync_queue` from Supabase and transmits compliant XML to Tally Prime on Port `9000`. |
| **Tally XML Voucher Builder** | `tally-connector/xml-builder.js` & `tally_sync/xml-builder.js` | Generates standard Tally XML vouchers for Sales Invoices (`1.GST HO CS`), Bank Receipts (`Rec1 B1 Bank`), Cash Receipts (`Rec10 B8 Cash`), Advances, and Bill allocations (`New Ref`, `Agst Ref`, `On Account`). Automatically injects `<HASCASHFLOW>Yes</HASCASHFLOW>`. |
| **Inbound Customers Connector** | `tally-connector/sync_customers_connector.js` | Extracts Sundry Debtors from Tally XML/live port, parses multi-line address into 1 line, extracts mobile, GSTIN, PAN, and saves to `public.contact`. |
| **Inbound Suppliers Connector** | `tally-connector/sync_suppliers_connector.js` | Extracts Sundry Creditors from Tally XML/live port, parses vendor payment terms, GSTIN, PAN, and saves to `public.contact` (`type = 'supplier'`). |
| **Inbound Stock Items Connector** | `tally-connector/sync_stock_items_connector.js` | Extracts Stock Items from Tally, parses HSN, GST Rates (5/12/18/28%), UOM (`sqft`/`N`/`kg`), opening quantity/rate/value, and saves to `public.inventory_item`. |
| **Inbound Bank & GL Connector** | `tally-connector/sync_bank_and_chart_accounts_connector.js` | Extracts all General Ledger & Bank ledgers from Tally, maps core accounts (`1000`, `1010`, `1100`, `2201`), and saves to `public.chart_account` & `public.bank_account`. |
| **Bank Auto-Discovery Script** | `tally-connector/discover_tally_banks.js` | Scans Tally for Bank and Cash ledgers and configures them in ERP. |
| **Group Hierarchy Connector** | `tally-connector/sync_tally_subgroups.js` | Synchronizes parent-child accounting tree between Tally and ERP. |
| **ERP Payments API** | `src/app/api/v1/payments/route.ts` | Handles ERP payments, resolves bank account UUIDs dynamically, and enqueues to `tally_sync_queue`. |
| **ERP Customer Credits API** | `src/app/api/v1/customer-credits/route.ts` | Handles customer prepayments/advances, unifies receipt numbering (`REC-XXXXX`), and enqueues to `tally_sync_queue`. |
| **ERP Banking UI Pages** | `src/app/(dashboard)/accounting/banking/` | Full banking dashboard, live transaction views, and settings. |

---

## 📑 21. Multi-Line Address Parsing & Transformation Matrix

In Tally XML, customer and supplier addresses are output as multiple `<ADDRESS>` elements within `<ADDRESS.LIST>`:

```xml
<LEDGER NAME="3D Duniya- NIzamabad">
  <ADDRESS.LIST TYPE="String">
    <ADDRESS>Shop No. 25, Kavita Complex</ADDRESS>
    <ADDRESS>Godown Road, Nizamabad- 503001</ADDRESS>
    <ADDRESS>99899 92888</ADDRESS>
  </ADDRESS.LIST>
  <STATENAME>Telangana</STATENAME>
  <PINCODE>503001</PINCODE>
</LEDGER>
```

### Connector Parsing Rules (`sync_customers_connector.js`):
1. **Multi-Line Merge**: Iterates through all `<ADDRESS>` tags and joins them using `', '` into a single, clean address string stored in `billing_address_line1`.
2. **Phone Extraction**: If an address line contains a 10-digit mobile number (e.g. `9989992888`), it extracts it directly into the `contact.phone` column.
3. **Smart City Resolution**: `resolveSmartCity(name, fullAddress, state)` detects geographical cities (e.g., Mysore, Bangalore, Nizamabad, Shimoga, New Delhi) and assigns `contact.billing_city`.
4. **PAN Extraction**: Slices characters 3 through 12 from the 15-character GSTIN (`gstin.slice(2, 12)`) and stores in `contact.pan_number`.

---

## 🏦 22. Live Reconciled Bank & Cash Accounts Verification Registry

| Account / Drawer | Tally Clean Opening | Transaction Money In | Tally Final Live Balance | ERP Live Balance | Status |
|---|:---:|:---:|:---:|:---:|:---:|
| **🏛️ Federal Bank (`2091`)** | `₹915.00 Cr` (`-₹915`) | `+₹1,100.00` (`ADV-0001` ₹1000 + `ADV-0002` ₹100) | **`₹185.00 Dr`** *(or `₹1,623.56` with all)* | **`₹185.00 Dr`** | ✅ **100% Exact Match** |
| **👛 Cash B2 Drawer** | `₹74,042.00 Dr` | `+₹169.28` (`REC-00036` against `INV-00047`) | **`₹74,211.28 Dr`** | **`₹74,211.28 Dr`** | ✅ **100% Exact Match** |
| **💵 Main Cash Drawer** | `₹31,73,956.41 Dr` | `+₹169.28` (`REC-9` / `ADV-98A2F7`) | **`₹31,74,125.69 Dr`** | **`₹31,74,125.69 Dr`** | ✅ **100% Exact Match** |
| **Total Cash-in-Hand** | `₹32,47,998.41 Dr` | `+₹338.56` | **`₹32,48,336.97 Dr`** | **`₹32,48,336.97 Dr`** | ✅ **100% Exact Match** |
| **⭐ GRAND TOTAL** | `₹32,47,083.41 Dr` | `+₹1,438.56` | **`₹32,48,521.97 Dr`** | **`₹32,48,521.97 Dr`** | ✅ **100% Exact Match** |

---

## 🔒 23. Permanent Architectural Invariants

1. **UUID / GUID Relational Permanence**:
   * All ERP entities use internal UUIDs (`contact.id`, `bank_account.id`, `invoice.id`, `payment.id`).
   * UI name changes never break relationships or GL links.
2. **Dynamic Respective Drawer Routing**:
   * Every receipt dynamically checks the selected `bank_account_id` and routes the debit to its exact matching Tally ledger (`Federal 2091`, `Cash`, or `Cash B2`).
3. **Cash Flow Accounting (`<HASCASHFLOW>Yes</HASCASHFLOW>`)**:
   * All Receipt Vouchers exported to Tally include `<HASCASHFLOW>Yes</HASCASHFLOW>` and `<ISPARTYLEDGER>Yes</ISPARTYLEDGER>` on the bank/cash side so Tally immediately updates the Cash/Bank Summary register.
4. **Unified Sequential Receipt Numbering**:
   * All receipts and advances use unified sequential numbering (`REC-XXXXX`) generated by `getNextNumber`.

---
*Memory Updated & Persisted on: 2026-09-01*

---

## 🖥️ 24. Standalone Windows Executable (`TallyConnector.exe`) & 1-Click Sync Architecture

> **Purpose**: Allow the accounts department PC to run real-time Tally Prime sync without installing Node.js, npm, or dev tools.

### A. Overview & Packaging Architecture
`TallyConnector.exe` is a fully compiled standalone binary created from `tally-connector/connector.js` and `tally-connector/xml-builder.js`:
- Contains the Node.js V8 runtime embedded inside the `.exe`.
- Contains all required dependencies (`axios`, `dotenv`, `winston`, `xml2js`) bundled in bytecode.
- **Client PC Requirement**: **Zero software installations** (No Node.js / npm required).

```
📁 C:\Precision-Tally-Sync\
├── 📄 TallyConnector.exe     <-- Standalone Compiled Application (~45 MB)
├── ⚙️ .env                  <-- Company Configuration (ERP URL, Port, Company Name)
└── 📁 logs/                 <-- Auto-created log directory (connector.log)
```

### B. Compilation Procedure (When Ready to Build)
Run inside the `tally-connector/` folder:
```bash
# Package into Windows x64 Standalone Executable
npx @yao-pkg/pkg . --targets node18-win-x64 --output TallyConnector.exe
```

### C. Client Configuration (`.env`)
```env
ERP_BASE_URL=http://40.81.236.61:3000
CONNECTOR_SECRET=your_secure_secret_token
TALLY_HOST=http://127.0.0.1
TALLY_PORT=9000
TALLY_COMPANY_NAME=Hindustan Enterprises 25-26
POLL_INTERVAL_MS=8000
TALLY_EDUCATIONAL_MODE=false
```

### D. Alternative 1-Click Launcher (`Start-Sync.bat`)
If Node.js is already present on the PC:
```bat
@echo off
title Precision Press ERP - Tally Sync Connector
color 0A
cd /d "%~dp0"

echo ========================================================
echo   PRECISION PRESS ERP -> TALLY PRIME REAL-TIME SYNC
echo ========================================================
echo.
echo Connecting to ERP Cloud Queue & Local Tally Port 9000...
echo Keep this window open during business hours.
echo.

node connector.js

pause
```

### E. Automatic Background Windows Startup (Zero-Touch)
To start syncing automatically when Windows boots up:
1. Press `Win + R` $\rightarrow$ type `shell:startup` $\rightarrow$ press Enter.
2. Create a shortcut to `TallyConnector.exe` in this folder.
3. Every morning when the Accounts PC turns on, `TallyConnector.exe` starts and syncs every ERP invoice & receipt to Tally Prime automatically.

---


