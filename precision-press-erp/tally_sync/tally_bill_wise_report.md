# Tally Prime: Bill-Wise Allocation & Reference Logic Report

## Executive Summary
This report documents the exact behavior of Tally Prime's Bill-Wise allocation system (specifically `New Ref` and `Agst Ref`), as verified through manual UI testing and raw XML data extraction on August 11, 2026. 

This logic is the foundation for the automated two-way sync engine being built for the Precision Press ERP.

## The Core Concept: "Buckets" of Value
Tally uses `<BILLALLOCATIONS.LIST>` to track pending amounts for specific contacts (Ledgers). You can think of every reference as a "Bucket".

1. **`New Ref`**: Instructs Tally to **CREATE** a new bucket.
2. **`Agst Ref`**: Instructs Tally to **EMPTY** (or reduce) an existing bucket.

When a bucket's balance reaches `0.00`, Tally automatically destroys the bucket, removing it from the "Pending Bills" report.

---

## Verified Workflow Example (The F6 -> F8 -> F7 Flow)

During our live testing, we executed the following workflow to prove the logic:

### Step 1: The Advance Receipt (F6)
*   **Action**: Received an advance of 500 Cr from the customer (Ram).
*   **Tally UI**: We used `New Ref` and named it `12`.
*   **XML Behavior**: Tally generated a `<BILLALLOCATIONS.LIST>` with `<BILLTYPE>New Ref</BILLTYPE>` and `<NAME>12</NAME>`, holding `500.00 Cr`.
*   **Result**: Bucket `12` was created with 500 available.

### Step 2: The Sales Invoice (F8)
*   **Action**: Generated a Sales Invoice for 300 Dr for the same customer.
*   **Tally UI**: We used `New Ref` and named it `4`.
*   **XML Behavior**: Tally generated a `<BILLALLOCATIONS.LIST>` with `<BILLTYPE>New Ref</BILLTYPE>` and `<NAME>4</NAME>`, holding `300.00 Dr`.
*   **Result**: Bucket `4` was created with 300 pending.

### Step 3: The Settlement Journal (F7)
*   **Action**: We wanted to use the advance (Bucket `12`) to pay off the invoice (Bucket `4`).
*   **Tally UI**: We created a Journal entry for 300. We debited Ram (using `Agst Ref` against `12`) and credited Ram (using `Agst Ref` against `4`).
*   **XML Behavior**: Tally generated two `<BILLALLOCATIONS.LIST>` blocks:
    *   One with `<BILLTYPE>Agst Ref</BILLTYPE>` pointing to `<NAME>12</NAME>` for -300.
    *   One with `<BILLTYPE>Agst Ref</BILLTYPE>` pointing to `<NAME>4</NAME>` for 300.
*   **Result**: Bucket `4` was reduced to 0 and vanished from Pending Bills. Bucket `12` was reduced from 500 to 200 Cr.

### Step 4: The Final Proof (F8)
*   **Action**: Created another Sales Invoice (No. `5`) for 200 Dr.
*   **Tally UI**: When selecting `Agst Ref`, the Pending Bills list popped up.
*   **Result**: The list showed **exactly 200.00 Cr remaining** for reference `12`. Reference `4` was completely absent. We successfully linked the new invoice to the remaining 200 Cr, wiping out the advance completely.

---

## Conclusion & Next Steps
The XML extracted from `DayBook.xml` perfectly matched our manual operations. We have absolute confirmation that injecting `<BILLTYPE>New Ref</BILLTYPE>` and `<BILLTYPE>Agst Ref</BILLTYPE>` via the `localhost:9000` API will seamlessly replicate accountant behavior inside Tally.

The `tally_sync` engine will be coded to automatically construct this exact XML structure when pushing Invoices and Receipts from the Cloud ERP.
