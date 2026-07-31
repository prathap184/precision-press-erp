# Dubbl ERP Migration Requirements

If you want to merge all the operational manufacturing features from your old website (Precision Press ERP) directly into **Dubbl**, here is the exhaustive, exact list of every database table, API route, and frontend page that must be modified.

---

## 1. Database Tables (`lib/db/schema/inventory.ts`)

Instead of polluting Dubbl's strict financial `inventory_item` table with manufacturing data, the best practice is to create a linked "Extension Table". 

### Add a New Table: `inventory_manufacturing_spec`
```typescript
export const inventoryManufacturingSpec = pgTable("inventory_manufacturing_spec", {
  id: uuid("id").primaryKey().defaultRandom(),
  inventoryItemId: uuid("inventory_item_id").notNull().references(() => inventoryItem.id, { onDelete: "cascade" }),
  
  // Tax Integration
  hsnCode: text("hsn_code"),
  hsnDescription: text("hsn_description"),
  gstRate: integer("gst_rate"), // e.g. 1800 for 18.00%
  gstEffectiveFrom: timestamp("gst_effective_from"),

  // Print Specifications
  printerCategory: text("printer_category"),
  specsMaxWidth: text("specs_max_width"),
  specsGsm: text("specs_gsm"),

  // Modular Pricing (Stored in Cents)
  eyeletMetalPrice: integer("eyelet_metal_price").default(0),
  eyeletPlasticPrice: integer("eyelet_plastic_price").default(0),
  deliveryDoorPrice: integer("delivery_door_price").default(0),
  deliveryCourierPrice: integer("delivery_courier_price").default(0),
  deliveryTransportPrice: integer("delivery_transport_price").default(0),

  // Production Workflow Engine
  workflowSteps: jsonb("workflow_steps").default([]),
});
```

---

## 2. API & Code Changes (`app/api/`)

### `app/api/v1/inventory/route.ts` (POST Route)
1. **Update `createSchema` (Zod):** Add validation for all the new pricing fields, HSN code, and the `workflowSteps` JSON array.
2. **Inject HSN Fetching:** Import your `HSNService`. Before inserting the database row, query the live GST rate based on the provided HSN code.
3. **Database Transaction:** Update the `db.transaction(async (tx) => {...})` block. After creating the `inventoryItem` at 0 stock, execute a second insert into `inventoryManufacturingSpec` linking it to the newly created `item.id`.

### `app/api/v1/inventory/[id]/route.ts` (GET & PUT Routes)
1. **GET Route:** Update the database query to `LEFT JOIN` the new `inventory_manufacturing_spec` table so that when the frontend asks for a product, it receives all the manufacturing data too.
2. **PUT Route:** Update the update logic to save changes to the manufacturing spec table. If the `hsnCode` changes, it must trigger a new fetch to update the `gstRate`.

---

## 3. Frontend Pages & Components (`components/` & `app/`)

### `components/dashboard/create-drawer.tsx` (Add New Item)
You must heavily expand the simplified drawer UI to include:
1. **HSN Block:** An input for HSN Code that shows "Auto-fetched on save" for the description and rate.
2. **Pricing Grids:** Add the 3x1 grid for Delivery Pricing (Door, Courier, Transport) and 2x1 grid for Eyelet Pricing.
3. **Conversion Logic:** Add React state for these pricing inputs and ensure they are multiplied by 100 before being sent to the POST API (to convert Rupees to Cents).
4. **Workflow Builder Integration:** Port the `<WorkflowBuilder />` React component from your old codebase, copy it into `components/inventory/workflow-builder.tsx` in Dubbl, and mount it inside the drawer.

### `app/(dashboard)/inventory/[id]/page.tsx` (Item Details View)
1. The current Dubbl item details page just shows basic stock and accounting ledgers.
2. You must build new UI cards on this page to display the attached Manufacturing Workflow, the active GST rate, and the modular add-on pricing.

### `app/(dashboard)/sales/quotes/new/page.tsx` (Quoting / Invoicing Engine)
**This is the most complex code change.**
When a user selects this product on a new Quote or Invoice, the system must be updated to ask them:
1. *"Which delivery method?"* (Door/Courier/Transport) -> Dynamically add this cost to the line item.
2. *"Which eyelets?"* (Metal/Plastic/None) -> Dynamically add this cost to the line item.
3. **Tax Override:** The invoicing engine must be programmed to ignore Dubbl's default organization tax rates and specifically use the `gstRate` fetched from the `inventory_manufacturing_spec` table for this exact line item.
