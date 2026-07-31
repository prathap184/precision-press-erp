# Dubbl Inventory System Architecture

This document outlines the strict financial inventory architecture used in the **Dubbl** accounting system, contrasting it with traditional operational ERPs.

## 1. Database Schema & Tables

Dubbl separates physical goods and categories into distinct entities to maintain strict accounting compliance.

### Categories (`inventory_category`)
Categories are formal entities supporting deep hierarchies.
- **`id`** (UUID): Unique identifier.
- **`name`** (Text): Category name (e.g., "Paper", "Ink").
- **`parentId`** (UUID): Allows nesting sub-categories (e.g., *Paper -> Glossy -> 300GSM*).

### Products & Items (`inventory_item`)
The core table linking physical goods to financial ledgers.
- **`code`** / **`name`**: Standard product identifiers.
- **`purchasePrice`** / **`salePrice`** (Integer): Stored strictly in **cents** to prevent floating-point math errors.
- **`costMethod`** (Enum): The valuation method (`average`, `fifo`, or `standard`).
- **`averageCost`** (Integer): Live moving average cost per unit in cents.
- **`totalValue`** (Integer): The financial book value of all on-hand stock.
- **`quantityOnHand`** (Integer): The live physical count.
- **Accounting Hooks**: Requires `costAccountId`, `revenueAccountId`, and `inventoryAccountId` to automatically post GL entries.

### Warehouses (`warehouse`)
Tracks multiple physical locations.
- **`id`** / **`name`** / **`code`**: Identifiers for the warehouse.
- **`isDefault`** (Boolean): The primary location for incoming/outgoing stock.

### Movement Log (`inventory_movement`)
An immutable audit log that tracks *why* and *when* stock moved, providing the double-entry accounting hook.
- **`type`** (Enum): `purchase`, `sale`, `transfer_in`, `adjustment`, etc.
- **`quantity`**: The delta of units moved.
- **`unitCost`**: The exact cost at the time of movement.
- **`journalEntryId`** (UUID): **Double-Entry Link** pointing to the official accounting journal entry (`journal_entry` table) that recorded the debits and credits for this movement.

---

## 2. End-to-End Lifecycle: Adding a New Item

When a user creates a new inventory item via the UI and inputs an "Initial Quantity" (e.g., 50 units), the backend executes a massive atomic transaction to keep the books balanced.

Here is the exact sequence of events across 6 database tables:

1. **Insert at ZERO Stock (`inventory_item`)**
   The backend intercepts the user's input and deliberately saves the product to the `inventory_item` table with `quantityOnHand: 0` and `totalValue: 0`. This establishes a clean accounting base.

2. **Trigger Stock Receipt Event (`inventory_movement`)**
   It triggers a core engine function called `recordInventoryReceipt`. This writes a new row to the `inventory_movement` table with the type set to `"initial"`.

3. **Blend the Item Cost (`inventory_item` Update)**
   It runs a mathematical function (`blendAverageCost`) to multiply the 50 units by the Purchase Price. It updates the `inventory_item` table to reflect the new `quantityOnHand` (50), the calculated `averageCost`, and the financial `totalValue` (e.g., ₹5000).

4. **Create Cost Layers (`inventory_cost_layer`)**
   If the company uses FIFO (First-In, First-Out), it drops an isolated "cost layer" bucket for these specific 50 items so the system remembers exactly what *these* 50 cost.

5. **Assign to a Shelf (`warehouse_stock`)**
   It updates the `warehouse_stock` table to track exactly which physical warehouse location holds these 50 units.

6. **Post the Double-Entry Journal (`journal_entry` & `journal_line`)**
   The system automatically creates a formal double-entry accounting ledger to balance the company's Balance Sheet:
   - **Debit (DR):** *Inventory Asset Account* for ₹5000 (increasing total assets).
   - **Credit (CR):** *Opening Balance Equity Account* for ₹5000.

**Conclusion:** A single click on a simple UI triggers a chain reaction across 6 financial tables, ensuring the physical stock perfectly mirrors the financial balance sheet.
