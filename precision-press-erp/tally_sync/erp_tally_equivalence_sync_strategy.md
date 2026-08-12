# ERP to Tally Prime: Logic Equivalence & Sync Strategy

## 1. Introduction
This document proves the conceptual equivalence between the Precision Press ERP (web application) and Tally Prime. It establishes how staff actions on the ERP seamlessly map to Tally's native accounting behavior, enabling a flawless, automated, one-way push of transactions from the ERP to Tally.

## 2. How the Precision Press ERP Works
The ERP operates on a visual, database-driven "Bill-by-Bill" tracking system.
*   **Customer Prepayments (Advances):** When money is received, a receipt record is created with an `unallocated_amount`. The money "floats" on the customer's account.
*   **Sales Invoices:** When an invoice is created, it is recorded with a `balance_due`.
*   **Allocations (Linking):** A user clicks "Allocate" in the UI to apply a prepayment to an invoice. The database links the two records, reducing the `unallocated_amount` of the receipt and the `balance_due` of the invoice.
*   **Direct Payments:** A user receives money and immediately allocates it to a specific invoice during creation.

## 3. How Tally Prime Works
Tally operates on an XML-driven "Bucket" tracking system using Vouchers and Bill Allocations.
*   **`New Ref` (Creating a Bucket):** Used in F6 (Receipts) or F8 (Sales) to create a tracked bucket of money (e.g., an advance or an invoice debt).
*   **`Agst Ref` (Emptying a Bucket):** Used in F7 (Journals) or F6 (Receipts) to target an existing bucket and deduct money from it. If the bucket hits `0`, it vanishes from the Pending Bills report.
*   **`On Account`:** Used when money is received but not explicitly tracked in a bucket (floating balance).

## 4. The Equivalence (Why They Are 100% The Same)
The accounting logic in both systems is identical. They merely use different vocabulary. 

| Business Action | ERP Action (Frontend/Database) | Tally Equivalent (XML/API) |
| :--- | :--- | :--- |
| **Record an Advance** | Save Customer Prepayment | F6 Receipt + `<BILLTYPE>New Ref</BILLTYPE>` |
| **Charge Customer** | Save Sales Invoice | F8 Sales + `<BILLTYPE>New Ref</BILLTYPE>` |
| **Settle Debt** | Click "Allocate" (Link Prepayment to Invoice) | F7 Journal + `<BILLTYPE>Agst Ref</BILLTYPE>` |
| **Direct Payment** | Save Receipt & Allocate immediately | F6 Receipt + `<BILLTYPE>Agst Ref</BILLTYPE>` |
| **Floating Money** | Receipt with Unallocated Balance | F6 Receipt + `<BILLTYPE>On Account</BILLTYPE>` |

**Conclusion:** The two systems are mathematically and functionally identical. Pakka.

## 5. The Sync Strategy (How We Move Entries)
Because the logic is 100% matched, the ERP will act as the single source of truth for all daily operations. The staff will **never** manually enter Invoices or Receipts into Tally.

### The Architecture
1.  **Staff Operations:** Staff create Invoices, Prepayments, and Allocations exclusively on the ERP website (`http://40.81.236.61:3000`).
2.  **Event Queue:** When a document is finalized, the ERP inserts a sync job into a local database queue (e.g., `tally_sync_queue`).
3.  **The Sync Engine:** A local Node.js worker (`connector.js`) constantly polls this queue.
4.  **XML Translation:** The worker reads the ERP data and translates it into the exact XML tags Tally expects (mapping ERP allocations to `Agst Ref` and new documents to `New Ref`).
5.  **Tally API Injection:** The worker sends the XML string via HTTP POST to Tally Prime's local listener on `http://localhost:9000`.
6.  **Silent Update:** Tally instantly records the transaction in its database. When the accountant views the Day Book or Pending Bills, the ledgers are perfectly balanced, exactly as if they had typed it manually.

This strategy ensures total data integrity without any complex mathematical recalculations. We are simply translating actions into XML.
