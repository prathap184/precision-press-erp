Viewed page.tsx:1-20

Let me read the full page and trace all the API calls it makes.

Viewed page.tsx:1-534

Now let me find the API routes for customer-credits and the drawer form:

Listed directory customer-credits
Searched for "customerCredit"
Viewed route.ts:1-294
Searched for "CustomerCreditDrawer"
Viewed create-drawer.tsx:4208-5007

I now have everything I need. Here is the complete picture:

---

## 🏦 Customer Prepayments Page — Full Database Flow

The page has **2 modes of operation**: reading the list, and creating a new receipt (via the drawer).

---

### 📋 PAGE LOAD — `GET /api/v1/customer-credits`

**Tables READ:**

| Table | Fields read | Purpose |
|---|---|---|
| `customer_credit` | `id`, `date`, `status`, `originalAmount`, `amountRemaining`, `sourceType`, `currencyCode`, `contactId`, `journalEntryId` | Main list data |
| `contact` | `name` | Joined → shows Customer name |
| `journal_entry` | `reference`, `entryNumber` | Joined → shows Reference column |

**Filters applied from UI:**
- `status` → All / Available (open) / Used (applied) / Cancelled (void)
- `from` / `to` → date range
- `sortBy` → date, amount, remaining, created
- `page` + `limit=50` → infinite scroll (loads next 50 on scroll)
- Client-side search → filters on `contact.name` or `sourceType`

---

### 🧾 NEW RECEIPT DRAWER — "New Receipt" Button

The drawer has **3 settlement modes**, each hitting a different API:

---

#### MODE 1 — "On Account" or "New Ref" → `POST /api/v1/customer-credits`

All inside a **single DB transaction**:

| Table | Action | Fields Written |
|---|---|---|
| `bank_account` | READ | Find linked `chartAccountId` for the bank |
| `chart_account` | READ | Resolve Customer Deposits control account |
| `exchange_rate` | READ | If foreign currency → get base rate |
| **`journal_entry`** | `INSERT` | `entryNumber`, `date`, `description`, `reference` (REC-xxxx or custom name), `status='posted'`, `sourceType='customer_credit'`, `postedAt` |
| **`journal_line`** | `INSERT` (2 rows) | Row 1: `DR Cash/Bank` account + amount; Row 2: `CR Customer Deposits` + amount (with base-currency equivalents) |
| **`payment`** | `INSERT` | `paymentNumber`, `contactId`, `type='received'`, `amount`, `method='bank_transfer'`, `bankAccountId`, `date`, `currencyCode`, `journalEntryId` |
| **`customer_credit`** | `INSERT` | `contactId`, `date`, `currencyCode`, `originalAmount`, `amountRemaining`, `sourceType` (prepayment/overpayment), `status='open'`, `journalEntryId`, `notes` |
| `bank_transaction` | `UPDATE` (auto-reconcile) | Links the bank tx to this journal entry if a matching unreconciled transaction exists |
| **`audit_log`** | `INSERT` | `action='create'`, `entityType='customer_credit'`, `entityId` |

---

#### MODE 2 — "Against Invoice (Agst Ref)" → `POST /api/v1/invoices/:id/pay`

| Table | Action | Fields Written |
|---|---|---|
| `invoice` | READ | Validate `status`, `amountDue`, `currencyCode` |
| `bank_account` | READ | Get linked ledger account |
| **`journal_entry`** | `INSERT` | DR Bank, CR Accounts Receivable |
| **`journal_line`** | `INSERT` (2 rows) | Debit bank, Credit AR |
| **`payment`** | `INSERT` | `type='received'`, `bankAccountId`, `amount`, linked to invoice |
| **`payment_allocation`** | `INSERT` | Links payment → invoice, `documentType='invoice'`, `amount` |
| **`invoice`** | `UPDATE` | `amountPaid +=`, `amountDue -=`, `status` → partial or paid |
| **`audit_log`** | `INSERT` | action='pay', entityType='invoice' |

---

### 🗺️ Full Visual Map

```
PAGE LOAD
│
└── GET /api/v1/customer-credits
    ├── READ: customer_credit (with filters: status, date range, sort, pagination)
    ├── JOIN:  contact           → contact.name
    └── JOIN:  journal_entry     → reference / entryNumber

DRAWER OPEN
└── GET /api/v1/bank-accounts   → READ: bank_account (populates "Paid into" dropdown)

DRAWER: Settlement = "Against Invoice" + contact selected
└── GET /api/v1/invoices?contactId=xxx
    └── READ: invoice (status=sent/partial/overdue, amountDue > 0)

─────────────────────────────────────────────────
SUBMIT: On Account / New Ref  → POST /api/v1/customer-credits
│
├── READ:  bank_account         (get chartAccountId)
├── READ:  chart_account        (Customer Deposits control account)
├── READ:  exchange_rate        (if foreign currency)
│
├── [TRANSACTION]
│   ├── INSERT → journal_entry  (DR Cash, CR Customer Deposits)
│   ├── INSERT → journal_line   (2 rows: debit + credit)
│   ├── INSERT → payment        (payment ledger record)
│   ├── INSERT → customer_credit (status='open', amountRemaining=full)
│   └── UPDATE → bank_transaction (auto-reconcile if match found)
│
└── INSERT → audit_log

─────────────────────────────────────────────────
SUBMIT: Against Invoice  → POST /api/v1/invoices/:id/pay
│
├── READ:  invoice              (validate status/amount)
├── READ:  bank_account         (get ledger account)
│
├── INSERT → journal_entry      (DR Bank, CR AR)
├── INSERT → journal_line       (2 rows)
├── INSERT → payment
├── INSERT → payment_allocation (links to invoice)
├── UPDATE → invoice            (amountPaid, amountDue, status)
└── INSERT → audit_log
```

---

### 📊 Form Fields → Database Column Mapping

| UI Field | DB Table | Column |
|---|---|---|
| Customer | `customer_credit` | `contactId` |
| Method of Adjustment | Logic only (picks which API to call) | — |
| Reference Name (New Ref) | `journal_entry` | `reference`; `customer_credit` → `notes` |
| Date | `customer_credit` | `date`; `journal_entry` → `date` |
| Amount | `customer_credit` | `originalAmount`, `amountRemaining`; `payment` → `amount` |
| Currency | `customer_credit` | `currencyCode` |
| Paid Into (bank account) | `payment` | `bankAccountId`; `journal_line` → `accountId` (DR leg) |
| Source Type | `customer_credit` | `sourceType` (prepayment/overpayment) |
| Notes | `customer_credit` | `notes`; `payment` → `notes` |