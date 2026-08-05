# Hindustan Enterprises Integration with Pixel Marketing

## Overview
This document details the integration of the Hindustan Enterprises (Printing Press ERP) workflow and tax tracking features into Pixel Marketing (Double-entry accounting system). 

Because Pixel Marketing relies on a strict double-entry ledger architecture, the core accounting structures (`averageCost`, `totalValue`, movements) were deliberately kept isolated from the manufacturing workflows. The integration seamlessly injects necessary metadata (HSN codes, GST rates, and sequential production workflows) without compromising Pixel Marketing's financial integrity.

---

## 1. Database Schema Expansions

To track tax and workflow data directly on the inventory items, we extended the Pixel Marketing Drizzle schema (`lib/db/schema/inventory.ts`):

*   **`inventory_item` table modifications:**
    *   Added `hsnCode` (text)
    *   Added `gstRate` (integer)
    *   Added `workflowSteps` (jsonb)

*   **Tax Master Tables:**
    *   Linked the ERP's `hsn_master` table (ID, hsnCode, description, isActive).
    *   Linked the ERP's `hsn_gst_rates` table to track history via `effectiveFrom` dates.

---

## 2. Dynamic HSN & GST Synchronization

Rather than hardcoding HSN codes on the frontend, Pixel Marketing now directly fetches the master list from the shared Supabase database to ensure exact tax compliance.

*   **API Route (`app/api/v1/hsn/route.ts`):** 
    *   Fetches active HSN codes from `hsn_master`.
    *   Uses a Postgres `JOIN LATERAL` query to locate the **latest** GST rate using the `effective_from` date (bypassing legacy reliance on `effective_to` columns).
    *   Applies `DISTINCT ON (hsn_code)` to resolve duplicate HSN code entries present in the legacy database.

*   **Frontend UI (`components/inventory/hsn-picker.tsx`):**
    *   Implements an asynchronous Combobox (Popover + Command).
    *   Automatically locks the associated GST rate into a read-only field when an HSN code is selected.

---

## 3. Sequential Production Workflows

*   **`WorkflowBuilder` Component:** Ported the ERP's drag-and-drop or sequential workflow UI (`components/inventory/workflow-builder.tsx`). 
*   Allows the user to define operational stages for products:
    *   Pre-press (e.g., Designing, Plate Making)
    *   Press (Printing)
    *   Post-press (e.g., Binding, Cutting, Lamination)
*   The data is stored natively as a JSONB array (`workflowSteps`) on the item row, enabling dynamic read/write operations without complex relational joins.

---

## 4. Architecture Guidelines Maintained
- **Isolated Complexity:** The print-specific variables do not interact with Pixel Marketing's `/api/v1/movements` logic.
- **Tally / Ledger Operations Deferred:** Standard inventory creation focuses heavily on defining stock profiles. Deep ledger transaction injection (Tally sync) is deferred to the Order/Invoice lifecycle rather than the base Inventory setup.
