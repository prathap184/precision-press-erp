# ERP Migration to `inventory_item` - Change Log

This document details all the codebase changes made to migrate the `precision-press-erp` frontend from the legacy `products` table to the new Dubbl-integrated `inventory_item` table. 

## 1. Data Reading & Translating (`src/lib/actions/products.ts`)
- **Query Change:** Swapped all instances of `.from('products')` to `.from('inventory_item')`.
- **Translator Implementation:** Updated `parseProduct(row: any)` to unpack the `inventory_item.metadata` JSONB column. 
- **Mapping:** 
  - `eyeletPricing.metal` is now mapped from `meta.eyeletPricing.metal` or falls back to legacy columns.
  - `specs.gsm` mapped from `meta.specs.gsm`.
  - `media.images` and `media.video.url` are unpacked correctly from the nested metadata structure.
- **ID Strategy:** The UUID in `inventory_item.id` was ignored for ERP purposes. Instead, the ERP now assigns `id: row.sku`. This allows the rest of the application to keep using the numeric ID (e.g., `"6000"`).

## 2. Redis Cache Updates (`src/lib/cache/products.ts`)
- **Query Change:** The caching system previously queried Firebase (`adminDb.collection('products')`). This was completely replaced to query Supabase (`supabaseServer.from('inventory_item')`).
- **Data Mapping:** Applied the identical data translator logic used in `products.ts` to ensure the Redis cache returns the exact `Product` shape the UI expects.

## 3. Order Processing & Inventory Deductions (`src/lib/actions/acdema.ts`)
- **Stock Tracking Query:** Changed the stock validation query from checking the `products` table to checking the `inventory_item` table.
- **Column Rename:** Replaced `current_stock` with the new schema column `stock_quantity`.
- **Foreign Key Check:** Updated the `.eq('id', item.productId)` logic to `.eq('sku', item.productId)` so the ERP successfully identifies the product in the new table using the numeric SKU.

## 4. Order Returns (`src/lib/actions/returns.ts`)
- **Inward & Outward Movements:** For both customer returns (Inward) and supplier returns (Outward), the stock update logic was modified to query `.from('inventory_item')`, update the `stock_quantity` column, and locate the item using `.eq('sku', item.productId)`.

## 5. Tally Syncing (`src/lib/actions/tally-sync.ts`)
- **Category Fetching:** The script that fetches all unique product categories was updated from `.from('products')` to `.from('inventory_item')`.

## 6. HSN Services (`src/services/hsnService.ts`)
- **Active Products:** HSN logic validates whether an HSN code is safe to disable by checking if any active products are using it.
- **Query Update:** Changed from `.from('products')` to `.from('inventory_item')`.
- **Status Mapping:** Replaced `.eq('status', 'ACTIVE')` with the new boolean flag `.eq('is_active', true)`.

---
**Conclusion:** 
No changes were required to the `order_items` saving logic or `workflow.ts` because the ID mapping strategy (`id: row.sku`) ensures that the database naturally stores the numeric SKU (e.g., "6000") in the `order_items.product_id` column, preserving full backward compatibility with all historical orders.
