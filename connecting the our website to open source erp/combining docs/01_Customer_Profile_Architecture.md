# Architecture Decision Record: Customer Profiles & Database Merge

## Executive Summary
We are merging the **Precision Press ERP** (custom-built) and an **Open Source Accounting ERP** to run on a single, shared Supabase PostgreSQL database. 
- **Precision Press ERP** will handle all operational workflows: order tracking, design proofs, print workflows, dispatch, and customer creation.
- **Open Source ERP** will strictly handle double-entry accounting: invoices, payments, journal entries, and ledgers.

## The Problem
The open-source accounting system expects a dedicated `customers` table with specific fields (e.g., `ntn`, `cnic`, `current_balance`). However, Precision Press ERP uses a unified `profiles` table to store both staff and customers, and it utilizes custom fields specific to the Indian printing market (e.g., `gstNumber`, structured `billing`/`shipping` addresses, and `loyaltyPoints`).

Modifying the open-source codebase to query our `profiles` table would be a massive, error-prone undertaking that breaks future upstream updates.

## The Solution: Database Virtualization (PostgreSQL Views)
Instead of altering the open-source codebase or maintaining duplicate tables, we will use a **PostgreSQL View** to translate the data in real-time.

A View acts as a virtual table. When the open-source ERP queries `SELECT * FROM customers`, the database will intercept the query, fetch the data from the `profiles` table, filter out staff members, and instantly translate the field names to exactly what the open-source system expects.

### Benefits
1. **Zero Code Changes Required:** The open-source system remains unmodified.
2. **No Data Duplication:** There is only one source of truth (`profiles`).
3. **Instant Sync:** Updating a customer on the custom website instantly updates the accounting system.

## Golden Rules
1. **Unidirectional Creation:** Customers are **ONLY** created or edited via the Precision Press ERP (custom website). Creating customers inside the open-source ERP is strictly prohibited (and will be structurally blocked by the View).
2. **Strict Filtering:** The open-source system must never see internal staff records.

## Implementation Details

### The Translation Map
| Open Source Expects | We Map From (`profiles`) | Logic / Notes |
| :--- | :--- | :--- |
| `id` | `uid` | Primary Key |
| `customer_code` | `uid` | Reuse Supabase Auth ID |
| `customer_type` | `customerType` | Maps 'CASH'/'CREDIT' |
| `name` | `businessName` (or `name`) | Resolves B2B or B2C name |
| `email` | `email` | Direct |
| `phone` | `phone` | Direct |
| `ntn` (Tax ID) | `gstNumber` | Maps our Indian GST to their Tax ID |
| `cnic` (Personal ID) | `pan_number` | Maps our PAN to their Identity ID |
| `address` | `billing_address_line1` | Pulls primary structured address |
| `city` | `billing_city` | Direct |
| `credit_limit` | `creditLimit` | Direct |
| `current_balance` | `usedCredit` | Maps utilized credit as starting balance |
| `is_vip` | `membership` | Evaluates if 'PLATINUM' |
| `is_active` | `status` | Evaluates if 'ACTIVE' |

### The SQL View Definition (Example)
```sql
CREATE VIEW customers AS
SELECT 
    uid AS id,                     
    uid AS customer_code,          
    COALESCE(businessName, name) AS name,
    email,
    phone,
    alternate_mobile AS alternate_phone,
    billing_address_line1 AS address,
    billing_city AS city,
    pan_number AS cnic,
    gstNumber AS ntn,              
    creditLimit AS credit_limit,   
    0 AS credit_days,              
    usedCredit AS current_balance,          
    CASE WHEN membership->>'tier' = 'PLATINUM' THEN true ELSE false END AS is_vip,
    0 AS discount_percentage,
    'INDIVIDUAL' AS customer_type, 
    CASE WHEN status = 'ACTIVE' THEN true ELSE false END AS is_active,
    createdAt AS created_at,
    updatedAt AS updated_at
FROM profiles
WHERE role = 'CUSTOMER';
```
