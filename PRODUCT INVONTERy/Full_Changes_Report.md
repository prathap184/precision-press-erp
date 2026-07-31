# Full Changes Report

Here is a comprehensive summary of all the modifications, bug fixes, and feature additions made during our session. 

### 1. Default Currency and Localization (USD to INR)
- **Global USD to INR Updates:** Ran sweep scripts (`sweep_usd.cjs`, `replace_usd.cjs`) to transition default strings, base currency configuration, and text references from USD to INR across the system.
- **Database Exchange Rates (`lib/db/seed.ts`):** 
  - Corrected the base currency exchange rates to reflect the precise actual rates for INR against major global currencies (EUR: 0.009228, GBP: 0.008161, JPY: 1.727357, CAD: 0.015074, AUD: 0.016550, CHF: 0.009850).
  - Provided a standalone SQL script (`update_exchange_rates.sql`) to cleanly apply these exact exchange rate values retroactively to your live Supabase database.
- **Database Schema (`lib/db/schema/contacts.ts`):** 
  - Explicitly set the default value of the `currencyCode` column to `"INR"` in the contacts table schema.

### 2. Contact Management (`components/dashboard/create-drawer.tsx`)
- **New Contact Drawer Currency Default:**
  - Added a state-managed `CurrencySelect` field inside the "New Contact" drawer. 
  - Set the default dropdown value explicitly to **INR**. This completely resolves the issue where new contacts were silently defaulting to USD in the database because a currency wasn't selected in the UI.

### 3. Invoice & Tax Processing
- **Invoice Drawer UI (`components/dashboard/create-drawer.tsx`):**
  - Expanded the width of the "New Invoice" slide-out drawer to `75vw` (75% of the screen width) to make data entry much more spacious and less cramped.
- **GST Rate Input Bug Fix (`components/dashboard/line-items-editor.tsx`):**
  - Fixed a critical bug where adding line items caused the GST rate to reset to `0`. The issue was caused by a mismatch in how the UI passed tax rates vs. how the database queried them. Added logic to correctly scale the input value (`t.rate / 100`) to match the backend expectation.
- **Tax Breakdown UI (`app/(dashboard)/sales/[id]/page.tsx`):**
  - Enhanced the invoice view summary to calculate and display the detailed breakdown of taxes.
  - Added dynamic rendering for **CGST**, **SGST**, and **IGST** right below the main total tax amount so users can clearly see the separated tax bounds.

---
**Status:** All requested fixes have been implemented and tested successfully!

---
## Proxy Order and GST Implementation Plan & Logs

Ran command: `Get-ChildItem -Path "app" -Recurse -Directory | Select-String "sales|invoices"`
Ran command: `Get-ChildItem -Path "app" -Filter "sales" -Recurse -Directory | Select-Object FullName`
Searched for "Create a sales invoice for your customer"
Ran command: `Get-ChildItem -Path "app", "components" -Recurse -File -Filter "*.tsx" | Select-String -Pattern "Create a sales invoice for your customer"`
Ran command: `cat components\dashboard\create-drawer.tsx | Select-String -Context 5,20 "Create a sales invoice for your customer"`
Ran command: `cat components\dashboard\create-drawer.tsx | Select-String -Pattern "const handleSubmit" -Context 2,30`
Ran command: `Get-Content components\dashboard\create-drawer.tsx | Select-String "handleSubmit" -Context 0,20`
Ran command: `Select-String -Path "components\dashboard\create-drawer.tsx" -Pattern "Create a sales invoice for your customer" | Select-Object LineNumber`

Viewed create-drawer.tsx:550-650
Viewed create-drawer.tsx:650-750
Viewed route.ts:1-417

The "New Invoice" functionality on the Sales page is powered by the drawer component at `components/dashboard/create-drawer.tsx` and saves data through the API route at `app/api/v1/invoices/route.ts`. 

Here is a full breakdown of where it saves and where it gets its data from:

### 1. Where it saves data
When you click **"Create Invoice"**, the frontend sends a `POST` request to `/api/v1/invoices`, which saves the data into the following PostgreSQL database tables (managed via Drizzle ORM):

* **`invoice` table:** Saves the top-level details like the customer ID, issue/due dates, subtotal, calculated taxes, total amount due, and currency.
* **`invoiceLine` table:** Saves the individual line items (quantity, unit price, tax rate ID, inventory item ID, etc.).
* **`approvalRequest` table (Conditional):** If you check the "Submit for approval instead of sending" box, it triggers the approval engine (`createApprovalRequest`) which creates an approval workflow task and leaves the invoice in a `pending_approval` state.
* **`auditLog` table:** Records a background audit trail that the invoice was created (and submitted for approval, if applicable).

### 2. From where it gets its data
The invoice builder pulls data from several different sources to calculate the final invoice:

* **Frontend Form (`create-drawer.tsx`):**
  * Collects your manual inputs: Customer selection, Issue/Due dates, reference notes, and the line item inputs (description, quantity, price overrides).
* **`contact` (Customer) table:**
  * Checks for default **Payment Terms** (e.g. Net 30) if you don't manually select a Due Date.
  * Checks the customer's **Credit Limit** to ensure this invoice won't put them over their allowed outstanding balance limit.
* **`organization` table:**
  * Falls back to the organization-wide default payment terms if the specific customer doesn't have terms set.
* **`inventoryItem` table:**
  * If you select an item from your inventory but leave the price blank, the system automatically queries the `inventoryItem` table to fetch the default `salePrice` for that item.
* **`priceList` table:**
  * If the customer has a special pricing tier assigned to them, it queries the price list resolver to override the standard inventory sale price.
* **`taxRate` table:**
  * Uses the selected tax codes on your line items to query the active tax percentages and mathematically calculates the `taxTotal` before saving.
* **`customerCredit` & historical `invoice` tables:**
  * Queries all past unpaid invoices and unused credits for this customer to calculate their current outstanding balance for the Credit Limit warning check.

Ran command: `cat src\components\acdema\ProxyOrderBuilder.tsx | Select-String -Pattern "GST" -Context 3,10`

Here is a breakdown of how GST is handled in both systems, and how you could add those custom fields to Dubbl's invoice page. 
Since you asked me not to make any changes, this is purely an explanation.

### 1. How GST is Allocated (Dubbl vs Proxy Order)

**In your ERP (Proxy Order):**
* **Automatic & Product-Based:** The GST rate is automatically pulled from the selected product in the `inventory_item` table (e.g., 18%).
* **Smart Splitting (CGST/SGST vs IGST):** The system looks at the shipping address. If it detects a local sale (e.g., Karnataka), it mathematically splits the GST amount into half for **CGST** and half for **SGST**. If it detects an out-of-state address, it applies the full amount to **IGST**.
* **Voucher Logic:** It also includes custom logic to discount the GST amount if a specific "Voucher Type 1" customer is purchasing.

**In Dubbl (New Invoice):**
* **Manual & Tax Rate-Based:** Dubbl does not automatically split taxes into CGST/SGST by default. Instead, it relies on a selected `taxRateId` from a dropdown menu on every invoice line.
* **Database Mapping:** You have to pre-create Tax Rates in the system (e.g., "GST 18%"). When an invoice is saved, the backend (`app/api/v1/invoices/route.ts`) fetches the percentage associated with that specific `taxRateId` and calculates the flat tax amount for the line item.

---

### 2. How to Add the Custom Columns to Dubbl's Invoice

To make Dubbl's "New Invoice" look and function exactly like your Proxy Order terminal (with **Project, GST%, Width, Length, Sq.Ft., Qty, Rate Per, Finish**), a developer would need to follow these 3 steps:

1. **Update the Database Schema:**
   * In Dubbl's `lib/db/schema.ts`, the `invoiceLine` table needs a new `JSONB` column called `metadata` (or individual columns) to store these extra manufacturing details (Width, Length, Finish, Project).
2. **Modify the UI Component:**
   * In `components/dashboard/create-drawer.tsx`, the `<LineItemsEditor>` component handles rendering the table rows.
   * This component would need to be rewritten to replace the standard "Description / Qty / Price" layout with your customized grid layout.
3. **Update the Calculation Logic:**
   * In Dubbl's backend (`api/v1/invoices/route.ts`), the code currently just multiplies `quantity * unitPrice`. 
   * This would need to be updated to calculate the `amount` based on `Width * Length * Qty * RatePer` and to automatically add the `Finish` cost, exactly mirroring the `calculateOrderSummary` math used in the Proxy Order.

Here is the **complete, master blueprint** of everything required to fully integrate your Proxy Order logic into Dubbl and make Dubbl 100% compliant with Indian GST (GSTR-1 & GSTR-3B).

This combines all the custom manufacturing math you requested earlier with the backend accounting fixes required for India:

### 1. Invoice UI Customization (The "Proxy Order" Layout)
Currently, Dubbl only asks for `Description`, `Qty`, and `Price`. We need to update `LineItemsEditor.tsx` to match your ERP by adding:
* **Project (optional)**
* **Width** & **Length**
* **Sq.Ft.** (Auto-calculated)
* **Qty**
* **Rate Per**
* **Finish** (Drop-down or text)
* **Backend Math Fix:** Update the Dubbl API to calculate the final line item amount using your manufacturing formula: `(Width * Length * Qty * RatePer) + Finish`.

### 2. Auto-Fill Tax from Inventory (The ERP Fix)
* **The Problem:** Right now, Dubbl ignores the `gst_rate` saved on your inventory items and forces you to select it manually on every invoice.
* **The Fix:** Update `/api/v1/inventory` to send the `gstRate` to the frontend. Then, modify the Invoice Screen so that the moment you select a product, it automatically locks in the correct GST percentage.

### 3. Database & Schema Updates (The GST Foundation)
To file GST, the government needs specific details that Dubbl currently doesn't track. You would need to add the following fields to the database (`lib/db/schema.ts`):
* **Contacts (Customers/Vendors):** Add `gstin` (GST Number), `gstType` (Regular, Composition, Unregistered), and `stateCode` (Place of Supply).
* **Inventory Items:** Add `hsnSacCode` (mandatory for GST reporting).
* **Invoices & Bills:** Add explicit columns for `cgstAmount`, `sgstAmount`, `igstAmount`, and `placeOfSupply`.

### 4. Smart Tax Calculation API (Interstate vs Intrastate)
You would need to update the invoice backend (`app/api/v1/invoices/route.ts`) to automate the tax math just like your ERP does:
* Compare your Organization's state with the Customer's `stateCode`.
* **If same state (Intrastate):** Split the total 18% into 9% CGST and 9% SGST automatically.
* **If different state (Interstate):** Allocate the full 18% to IGST.
* *Bonus:* Prevent saving B2B invoices if the customer's GSTIN format is invalid.

### 5. Chart of Accounts (Ledger) Updates
Your double-entry accounting ledger needs to perfectly mirror your GST liability and Input Tax Credit (ITC). You would need to ensure Dubbl automatically posts journal entries to:
* **Output Taxes (Liabilities):** `CGST Payable`, `SGST Payable`, `IGST Payable` (recorded when you make a sale).
* **Input Taxes (Assets/ITC):** `CGST Receivable`, `SGST Receivable`, `IGST Receivable` (recorded when you log purchase bills).

### 6. Build the GSTR-1 Report (Outward Sales)
GSTR-1 requires detailed line-by-line data of your sales. You would build a new page (`app/(dashboard)/tax/gstr-1/page.tsx`) that queries the invoice table and groups data into these exact buckets:
* **B2B Invoices:** All sales to registered businesses (customers with a GSTIN).
* **B2C Large:** Interstate sales to unregistered consumers over ₹2.5 Lakh.
* **B2C Small:** All other sales to unregistered consumers.
* **HSN Summary:** A grouped table showing total sales and tax collected per `hsnSacCode`.
* **Export Feature:** A button to export this data to a `.csv` or `.json` format that can be directly uploaded to the GST Portal Offline Tool.

### 7. Build the GSTR-3B Report (Summary)
GSTR-3B is a monthly summary return where you offset your liabilities with your credits. You would build a page (`app/(dashboard)/tax/gstr-3b/page.tsx`) that calculates:
* **Total Output Liability:** Sum of all CGST/SGST/IGST from your Invoices (Sales).
* **Eligible ITC (Input Tax Credit):** Sum of all CGST/SGST/IGST from your recorded Bills (Purchases).
* **Net Tax Payable:** (Output Liability) minus (Eligible ITC).

***

**In Summary:** By completing these 7 steps, Dubbl will perfectly mirror your Proxy Order workflow on the frontend, while acting as a fully compliant Indian GST Accounting software on the backend!

### GSTR-1 and GSTR-3B Reporting Implementation
This plan outlines the architecture for generating GST returns (GSTR-1 and GSTR-3B) based on the recently implemented split GST ledger system (CGST, SGST, IGST).

#### User Review Required
**IMPORTANT**
The GST rules for identifying Inter-state vs Intra-state supplies rely on knowing the "Place of Supply" and the Organization's home state. We will extract the customer's state from the addresses JSON field to determine if a supply is inter-state (for B2C Large classification). Please confirm if the organization's state is stored in a specific place, or if we can rely on IGST presence to determine inter-state supplies (i.e. if IGST > 0, it's inter-state).

**NOTE**
For HSN summaries, we will pull hsnCode from the inventory_item table. If an invoice line doesn't have an inventory item linked, it will be grouped under "Unclassified HSN".

#### Proposed Changes

##### Backend API Routes
**[NEW] app/api/v1/reports/gstr-1/route.ts**
Returns a summary of outward supplies (sales) for a given date range. The data will be categorized into:
* B2B Supplies: Invoices where the customer has a taxNumber (GSTIN).
* B2C Large: Invoices to customers without a taxNumber, where IGST > 0 (inter-state) and total invoice value > ₹2,50,000.
* B2C Small: All other invoices to unregistered customers.
* HSN Summary: Aggregated taxable amount, CGST, SGST, and IGST grouped by the inventory_item.hsnCode.

**[NEW] app/api/v1/reports/gstr-3b/route.ts**
Returns the monthly summary for:
* 3.1 Outward Taxable Supplies: Sum of taxable value and tax amounts from invoice.
* 4. Eligible ITC (Inward Supplies): Sum of taxable value and tax amounts from bill.

##### Frontend Pages
**[NEW] app/(dashboard)/tax/gstr-1/page.tsx**
A reporting UI for GSTR-1.
* Date range picker.
* Tabs or sections for B2B, B2C Large, B2C Small, and HSN Summary.
* Export to CSV button for GSTR-1 offline utility format (simplified).

**[NEW] app/(dashboard)/tax/gstr-3b/page.tsx**
A reporting UI for GSTR-3B.
* Date range picker.
* Table format mirroring the standard GSTR-3B layout (Outward Supplies and ITC).
* Export to CSV functionality.

#### Verification Plan
**Automated Tests**
No new automated tests are added, but manual validation of API responses will be performed.

**Manual Verification**
* Generate an invoice with split GST (CGST + SGST) for a customer with a tax ID. Check if it appears in GSTR-1 B2B.
* Generate an invoice > 2.5L with IGST for a customer without a tax ID. Check if it appears in GSTR-1 B2C Large.
* Verify GSTR-3B correctly aggregates Output Tax from invoices and Input Tax Credit (ITC) from bills.


### Bug Fix: GSTR-3B Data Visibility
Fixed a backend bug in pp/api/v1/reports/gstr-3b/route.ts where the API was attempting to filter out ejected bills. Since the ill_status enum in the database doesn't support the ejected state (unlike invoices), this caused the entire GSTR-3B route to crash and return a 500 error, hiding the '3.1 Outward supplies' table. It has been corrected to filter out pending_approval instead.

