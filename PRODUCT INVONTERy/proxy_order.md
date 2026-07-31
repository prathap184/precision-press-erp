# Proxy Order System Documentation

This document outlines the complete workflow, calculation logic, and data points used in the **Proxy Order Terminal** (based on the Hindustan Enterprises legacy system).

## 1. Overview of the Order Terminal
The Proxy Order page is a comprehensive Point of Sale (POS) and Order Management screen designed for custom print and manufacturing jobs. It combines customer selection, item dimension calculations, logistics, and payment processing into a single view.

## 2. Customer & Logistics
### Customer Selection
- **Input:** Searchable dropdown (auto-complete).
- **Data Source:** Fetches from the Customer/Client database.
- **Display:** Shows Customer ID/Phone Number alongside their Name (e.g., `7894561234 - Ram`).

### Logistics Configuration
- **Delivery Modes:** Pick-up, Door Delivery, Courier, Transport.
- **Addresses:** 
  - Automatically fetches the customer's Primary Address.
  - Allows selection or entry of a specific "Sales/Delivery Address" (e.g., `TK Layout, 2nd stage, Mysore, Karnataka, 570001`).
- **Cost:** A flat logistics fee (e.g., Rs. 50.00) is applied based on the selected mode and distance.

## 3. Order Items & Calculations
The core of the system relies on dynamic area-based (Sq.Ft.) pricing.

### Columns & Data Sources:
1. **Name of Item:** Dropdown fetching from the Inventory/Products table (e.g., *Dig Invitation Card*).
2. **Project:** Optional text tag for job categorization.
3. **GST%:** Auto-fetched from the Inventory/HSN database when the item is selected (e.g., *18%*).
4. **Dimensions (Width & Length):** Manual numerical input.
5. **SQ.FT.:** Auto-calculated (`Width × Length`).
6. **QTY:** Number of copies/units required.
7. **RATE/SQFT:** Base price per square foot (auto-fetched from the product's pricing table, can be overridden).
8. **RATE PER:** Auto-calculated base cost for one unit (`SQ.FT. × RATE/SQFT`).
9. **FINISH:** Dropdown for post-processing (e.g., *None, Eyelets, Lamination*). Fetches from Finishing Options.
10. **FILE PATH:** Upload field for artwork files.
11. **AMOUNT:** Final base cost for the row before tax (`RATE PER × QTY`).

*Example Calculation:*
- Width: 2, Length: 3 ➔ **6.00 SQ.FT.**
- Qty: 1
- Rate/SqFt: 50.00 ➔ Rate Per: **300.00**
- Amount: **300.00**

## 4. Payment Terminal
Allows staff to record immediate payment against the order.
- **Methods Supported:** Cash, UPI, Bank Transfer, COD.
- **Fields:** Amount Received, Reference Number (for UPI/Bank), Remarks.
- **Additional Notes:** Free-text field for special color needs, hardware requirements, or dispatch instructions.

## 5. Tax & Final Bill Calculation (The Breakdown)
The system calculates the final bill in the bottom right corner using a specific sequence.

### A. Item Base Total
Sums up the `AMOUNT` column from all rows in the Order Items table.
*(Example: Rs. 300.00)*

### B. GST Calculation (Split Tax)
Taxes are calculated line-by-line based on the base amount and the item's specific GST%. For intra-state transactions, the total GST is split evenly into CGST and SGST.
- **CGST:** `Base Amount × (GST% / 2)` ➔ *300 × 9% = Rs. 27.00*
- **SGST:** `Base Amount × (GST% / 2)` ➔ *300 × 9% = Rs. 27.00*

### C. Item Total
Combines the base cost with the calculated taxes.
- **Item Total:** `Base + CGST + SGST` ➔ *300 + 27 + 27 = Rs. 354.00*

### D. Logistics & Grand Total
Logistics fees are added on top of the Item Total as a flat fee. In the provided example, the logistics fee does not have additional GST calculated on top of it.
- **Logistics:** Flat fee ➔ *Rs. 50.00*
- **Grand Total:** `Item Total + Logistics` ➔ *354.00 + 50.00 = **Rs. 404.00***
