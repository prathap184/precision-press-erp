# Precision Press ERP (Hindustan Enterprices) Product Architecture

This document outlines the product management architecture used in the **Precision Press ERP** system. Unlike standard financial inventory software, this ERP is designed specifically for print-manufacturing and operational workflows.

## 1. Database Schema (`products` Table)

The system uses a fast, flat structure where almost all product details, including manufacturing variables and workflows, are stored in a single row on the Supabase `products` table.

### Basic Information
- **`id`**: Unique identifier (must be >= 6000).
- **`name`**: The display name of the product.
- **`name_lowercase`**: A secondary column used for fast, case-insensitive searching.
- **`category`**: Saved as simple text (e.g., "Solvent Print").
- **`printer_category`**: Specific machine category mapping.
- **`base_rate`**: The fundamental price rate (e.g., ₹ per sqft).
- **`status`**: Current operational status (e.g., "ACTIVE").

### HSN & Tax Configuration
Rather than a simple flat number, the system pulls live tax data from an internal `HSNService` during creation:
- **`hsn_master_id`**: Links to the master tax record.
- **`hsn_code`**: The official HSN code for invoicing.
- **`hsn_description`**: Government description of the good.
- **`gst_rate`**: The active GST percentage at the time of creation.
- **`gst_effective_from`**: The timestamp the tax rate became applicable.
*Note: Any changes to HSN codes trigger an automatic row insertion in the separate `product_audit_logs` table for compliance tracking.*

### Dynamic Manufacturing Pricing
Print jobs require dynamic pricing based on physical additions or shipping methods:
- **Eyelet Pricing**: `eyelet_metal`, `eyelet_plastic` (Pricing per unit).
- **Delivery Pricing**: `delivery_door`, `delivery_courier`, `delivery_transport` (Flat rate pricing).

### Media & Physical Specifications
- **`media_images`**: A JSON array of image URL strings.
- **`media_video_url`**: Optional text URL for video demonstrations.
- **`specs_max_width`**: Physical print limits (e.g., "10ft").
- **`specs_gsm`**: Paper/flex weight (e.g., "180").
- **`specs_description`**: Rich text manufacturing description.

### Production Workflow Builder
- **`workflow_steps`**: This is a powerful JSON array column. It defines the exact multi-step operational sequence required to manufacture the product (e.g., 1. Accountant -> 2. Designer -> 3. Manager -> 4. Printer -> 5. Pasting -> 6. Dispatch -> 7. Delivery). This ensures strict sign-offs during physical production on the factory floor.

---

## 2. System Contrast

When compared to a financial accounting software (like Dubbl):
- **Operational vs Financial:** The ERP tracks *how to make* the product and *who* needs to approve it (Workflow Builder). It does not track formal Double-Entry Cost of Goods Sold.
- **Flat vs Relational:** The ERP stores categories and specs directly on the product row for extreme query speed, whereas financial software breaks categories into hierarchical relational tables.
- **Dynamic Pricing:** The ERP includes modular pricing add-ons (Eyelets, Delivery) out-of-the-box on the product row, whereas standard software usually handles these as separate line items.
