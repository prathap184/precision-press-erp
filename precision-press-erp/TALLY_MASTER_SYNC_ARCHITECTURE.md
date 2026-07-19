# Tally Master Data Synchronization Architecture

This document outlines the architecture and implementation details for bi-directionally syncing Master Data (Customers, Ledgers, and Company Details) between the Precision Press Cloud ERP (Supabase) and the local TallyPrime software.

## 1. Core Concept & The Bridge
The synchronization relies on TallyPrime's built-in HTTP Server and Tally Definition Language (TDL) XML. The local Node.js script (`tally-connector/connector.js`) acts as the bridge between the Cloud ERP and Tally.

*   **To Push (ERP -> Tally):** The connector pulls a task from the Cloud queue, generates a `<LEDGER ACTION="Create">` XML payload, and POSTs it to `localhost:9000`. Tally instantly processes it and creates/updates the Ledger.
*   **To Pull/Audit (Tally -> ERP):** The connector sends an "Export Request" (`<REPORTNAME>List of Accounts</REPORTNAME>`) to Tally. Tally responds with a massive XML string containing all ledgers. The connector parses this XML into JSON and securely POSTs it to the Cloud ERP API.

## 2. Why Sync Ledgers, Not Balances?
*   **Balances (Math):** We **do not** sync mathematical balances (e.g., Opening Balance or Closing Balance). Because we sync every Sales Invoice and Receipt to Tally, Tally will automatically calculate the exact same balance as the ERP.
*   **Ledgers (Profiles):** We **must** sync the Ledger profiles (Address, PAN, GSTIN). If a Sales Invoice is pushed to Tally for a customer that does not exist in Tally's ledger list, Tally rejects it. Furthermore, Tally needs the GSTIN inside the Ledger to generate accurate GSTR-1 tax returns.

## 3. The "Verify Sync" & Audit Flow
To guarantee both systems match perfectly, the ERP will feature a "Verify Sync" dashboard button. 

1. **Trigger:** User clicks "Verify Sync" on the website.
2. **Export:** The website commands `connector.js` to ask Tally for a list of all current Ledgers and their GSTINs.
3. **Compare:** The Cloud ERP compares Tally's list against the Supabase `profiles` table.
4. **Report & Action:** The dashboard displays the results:
   - ✅ **Synced:** Customers exist perfectly in both.
   - ❌ **Missing in Tally:** Click **"Push to Tally"** to generate XML and send the Supabase profile to Tally.
   - ❌ **Missing in Website:** Click **"Pull to Website"** to take Tally's ledger data and insert it into Supabase.

## 4. Data Mapping Table
When creating the `<LEDGER>` XML, the data from Supabase `public.profiles` maps to Tally as follows:

| Printing Press ERP (Supabase) | Tally XML Tag | Tally UI Field | Notes |
| :--- | :--- | :--- | :--- |
| `businessName` (fallback: `name`) | `<NAME>` | **Name** | The unique name of the ledger. |
| `customerType` or `role` | `<PARENT>` | **Under** | Group mapping (e.g., `BO Debtor Main Big`). |
| *(Hardcoded to true)* | `<ISBILLWISEON>` | **Maintain balances bill-by-bill** | Standard for Debtors. |
| `credit_days` | `<BILLCREDITPERIOD>` | **Default credit period** | e.g., "30 Days". |
| `businessName` | `<LEDGERMAILINGNAME>` | **Mailing Details - Name** | Usually the same as Ledger Name. |
| `billing_address_line1` + `line2` | `<ADDRESS>` (Line 1) | **Address (Line 1)** | Street address. |
| `billing_city` | `<ADDRESS>` (Line 2) | **Address (Line 2)** | City name. |
| `phone` / `alternate_mobile` | `<ADDRESS>` (Line 3) | **Address (Line 3)** | Phone numbers. |
| `billing_state` | `<LEDGERSTATENAME>` | **State** | Must perfectly match Tally's spelling. |
| `billing_country` | `<COUNTRYNAME>` | **Country** | e.g., "India". |
| `billing_pincode` | `<PINCODE>` | **Pincode** | 6-digit zip code. |
| `phone` | `<LEDGERPHONE>` | **Primary Mobile No.** | Formatted as "+91-XXXXXXXXXX". |
| `pan_number` | `<INCOMETAXNUMBER>` | **PAN/IT No.** | 10-character alphanumeric. |
| `gstType` | `<GSTREGISTRATIONTYPE>`| **Registration type** | e.g., `Regular`, `Unregistered`. |
| `gstin` | `<PARTYGSTIN>` | **GSTIN/UIN** | 15-character GST number. |

## 5. Next Steps for Implementation
1. **Extend `connector.js`**: Add XML generators for `<LEDGER>` and add the TDL Export XML logic.
2. **Update ERP APIs**: Create inbound routes in `src/app/api/tally/` to receive data pushed up from the local connector.
3. **Build the Dashboard**: Create `src/components/accounting/SyncDashboard.tsx` to handle the UI for the Verification, Push, and Pull commands.
