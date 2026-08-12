Let me trace the exact invoice creation flow through the code.

Listed directory invoices
Listed directory api
Listed directory v1
Listed directory invoices
Viewed route.ts:1-480

Now let me check what happens when an invoice is **sent/posted** (which triggers the journal entry and inventory):

Listed directory %5Bid%5D
Viewed route.ts:1-243

Now I have the complete picture. Here is the full database flow when you create an invoice:

---

## 🧾 What Happens in the Database When You Create an Invoice

The process has **2 stages**: **Create (Draft)** and **Send (Post to GL)**.

---

### 📝 STAGE 1 — POST `/api/v1/invoices` (Create as Draft)

These tables are **READ** first (pre-checks):

| Table | Why |
|---|---|
| `contact` | Read `paymentTermsDays` → auto-calculate `dueDate` |
| `contact` | Read `creditLimit` → credit limit check |
| `organization` | Read `defaultPaymentTerms` if contact has none |
| `invoice` | Sum `amountDue` for all open invoices → credit limit |
| `customer_credit` | Sum `amountRemaining` → reduce outstanding for credit limit |
| `inventory_item` | Read `salePrice` for lines without explicit price |
| `tax_rate` | Preload all rates for tax calculation |
| `price_list_item` | If `priceListId` set → resolve unit price |
| `member` | If `submitForApproval=true` → get requester member |
| `approval_workflow` | If `submitForApproval=true` → find matching workflow |

Then these tables are **WRITTEN**:

| Table | Action | What is written |
|---|---|---|
| **`invoice`** | `INSERT` | `invoiceNumber`, `contactId`, `issueDate`, `dueDate`, `subtotal`, `taxTotal`, `cgstTotal`, `sgstTotal`, `igstTotal`, `total`, `amountDue`, `currencyCode`, `status='draft'`, `invoiceType`, `createdBy` |
| **`invoice_line`** | `INSERT` (one row per line) | `description`, `quantity`, `unitPrice`, `accountId`, `taxRateId`, `taxAmount`, `cgstAmount`, `sgstAmount`, `amount`, `width`, `length`, `sqFt`, `finishAmount`, `deliveryAmount`, `inventoryItemId`, `warehouseId`, `sortOrder` |
| **`audit_log`** | `INSERT` | `action='create'`, `entityType='invoice'`, `entityId` |
| **`approval_request`** | `INSERT` (if `submitForApproval=true`) | workflow + invoice linked |
| **`invoice`** | `UPDATE` (if approval) | `status='pending_approval'` |
| **Supabase `orders` table** | `UPDATE` | `is_invoice_generated=true`, `invoice_number`, `invoice_id` (if `reference` field matches an order ID) |

---

### 📤 STAGE 2 — POST `/api/v1/invoices/:id/send` (Post to GL + Email)

All inside a **single DB transaction**:

| Table | Action | What is written |
|---|---|---|
| **`journal_entry`** | `INSERT` | Header: DR Accounts Receivable, CR Revenue, CR Output VAT (CGST/SGST/IGST split) |
| **`journal_line`** | `INSERT` (2–4 rows) | One debit leg (AR), one credit leg per revenue account/tax |
| **`inventory_movement`** | `INSERT` (if stock lines) | Qty relieved from warehouse |
| **`inventory_item`** | `UPDATE` (if stock lines) | `quantityOnHand` decreased |
| **`journal_entry`** (COGS) | `INSERT` (if stock lines) | DR COGS, CR Inventory asset |
| **`journal_line`** (COGS) | `INSERT` (if stock lines) | COGS debit + inventory credit |
| **`invoice`** | `UPDATE` | `status='sent'`, `sentAt`, `journalEntryId`, `senderSnapshot`, `recipientSnapshot` |
| **`document_email_log`** | `INSERT` | Recipient email, subject, PDF attached Y/N, status=sent |

---

### 🗺️ Full Visual Flow

```
POST /invoices
│
├── READ: contact (terms, credit limit)
├── READ: organization (default terms)
├── READ: invoice (outstanding AR for credit check)
├── READ: customer_credit (unapplied credits)
├── READ: inventory_item (sale prices)
├── READ: tax_rate (rates)
├── READ: price_list_item (if price list used)
│
├── INSERT → invoice (status=draft)
├── INSERT → invoice_line (N rows)
├── INSERT → audit_log
│
├── [IF submitForApproval]
│   ├── READ: member + approval_workflow
│   ├── INSERT → approval_request
│   └── UPDATE → invoice (status=pending_approval)
│
└── [IF reference = order ID] UPDATE → Supabase orders.is_invoice_generated

POST /invoices/:id/send  ← TRANSACTION
│
├── INSERT → journal_entry (AR + Revenue + VAT)
├── INSERT → journal_line (debit AR, credit revenue/tax per line)
│
├── [IF inventory lines]
│   ├── INSERT → journal_entry (COGS)
│   ├── INSERT → journal_line (DR COGS, CR inventory)
│   ├── INSERT → inventory_movement
│   └── UPDATE → inventory_item (quantityOnHand--)
│
├── UPDATE → invoice (status=sent, journalEntryId, snapshots)
└── INSERT → document_email_log
```

In short — **create** touches 3–6 tables, **send** touches 6–10 tables and is the moment the invoice actually hits the accounting ledger (GL).