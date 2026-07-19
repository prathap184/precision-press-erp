/**
 * TALLY INTEGRATION — TYPE DEFINITIONS
 * ──────────────────────────────────────
 * All type definitions for the Tally sync queue, event payloads,
 * and connector communication contracts.
 *
 * Architecture:
 *   Cloud ERP (Firebase) → tally_sync_queue → Accounting PC Connector → TallyPrime localhost:9000
 *
 * NOTE: Only the Accounts Department PC runs the local connector.
 *       All other employees only use the ERP website and never touch Tally directly.
 */

// ─── Sync Queue Event Types ────────────────────────────────────────────────────

export type TallySyncType =
  | 'SALES_INVOICE'    // Created when order reaches DISPATCHED / DELIVERED
  | 'RECEIPT_VOUCHER'  // Created when payment is VERIFIED/APPROVED
  | 'LEDGER_UPDATE';   // Created for credit customer balance adjustments

export type TallySyncStatus =
  | 'PENDING'   // Waiting to be picked up by the connector
  | 'IN_FLIGHT' // Connector has picked it up and is processing
  | 'SUCCESS'   // Successfully pushed to TallyPrime
  | 'FAILED'    // All retries exhausted — manual intervention needed
  | 'SKIPPED';  // Intentionally skipped (e.g. test order, duplicate guard)

// ─── Queue Document (stored in Firestore: tally_sync_queue/{id}) ───────────────

export interface TallySyncEvent {
  id: string;
  syncType: TallySyncType;

  // Reference to source ERP records
  orderId?: string;
  paymentId?: string;
  customerId?: string;

  // Idempotency key: uniquely identifies this business event.
  // Format: "<syncType>-<orderId|paymentId>"
  // The connector checks this before posting to Tally to prevent duplicates.
  idempotencyKey: string;

  // Full serialized payload ready for Tally XML generation
  payload: SalesInvoicePayload | ReceiptVoucherPayload | LedgerUpdatePayload;

  // Lifecycle tracking
  status: TallySyncStatus;
  retryCount: number;       // How many times we've attempted this sync
  maxRetries: number;       // After this, mark FAILED (default: 3)
  lastAttemptAt?: string;   // ISO timestamp of last connector attempt
  lastError?: string;       // Last error message from Tally or network

  // Tally response (on success)
  tallyResponse?: {
    requestId?: string;
    lineno?: string;
    status?: 'Accepted' | 'Not Accepted';
    rawXml?: string;        // Full Tally response XML for debugging
  };

  // Audit
  createdBy: string;        // The UID of the staff member who triggered this
  createdAt: string;        // ISO timestamp
  processedAt?: string;     // ISO timestamp when connector processed it
}

// ─── Payload Types ─────────────────────────────────────────────────────────────

export interface SalesInvoicePayload {
  // Tally company info
  tallyCompanyName: string;

  // Invoice details
  invoiceNumber: string;     // ERP invoiceNumber e.g. INV-123456
  invoiceDate: string;       // YYYYMMDD format for Tally
  orderDate: string;         // YYYYMMDD

  // Customer (maps to Tally Ledger under Sundry Debtors)
  customerName: string;      // Must match Tally ledger name EXACTLY
  customerAddress?: string;
  customerGST?: string;

  // Line items
  items: SalesInvoiceItem[];

  // Totals
  subTotal: number;
  gstAmount: number;
  grandTotal: number;

  // GST split
  cgst: number;
  sgst: number;
  igst: number;

  // Tally account names (configured in ERP settings)
  salesLedgerName: string;   // e.g. "Sales (GST)" — must match Tally
  gstLedgerName: string;     // e.g. "CGST" or "Output CGST"
  debtorLedgerName: string;  // e.g. "Sundry Debtors" or customer name
}

export interface SalesInvoiceItem {
  productName: string;
  quantity: number;
  sqft: number;
  rate: number;
  amount: number;
  gstPercent: number;        // 18 (for 18% GST)
}

export interface ReceiptVoucherPayload {
  tallyCompanyName: string;

  // Voucher details
  voucherNumber: string;     // paymentId
  voucherDate: string;       // YYYYMMDD
  amount: number;

  // Against (which invoice / ledger)
  orderId: string;
  invoiceNumber?: string;    // Reference to the sales invoice

  // Customer
  customerName: string;

  // Bank / Cash details
  paymentMode: string;       // CASH | UPI | BANK
  bankLedgerName: string;    // e.g. "State Bank of India" — must match Tally
  depositRefNo?: string;     // UTR / Cheque number

  // Tally account names
  debtorLedgerName: string;
}

export interface LedgerUpdatePayload {
  tallyCompanyName: string;
  customerName: string;
  ledgerGroup: string;       // e.g. "Sundry Debtors"
  openingBalance: number;
  creditLimit: number;
}

// ─── Connector API Contract (used by the local Node.js connector service) ──────

export interface ConnectorQueueResponse {
  events: TallySyncEvent[];
  fetchedAt: string;         // ISO
}

export interface ConnectorMarkResult {
  id: string;
  status: TallySyncStatus;
  tallyResponse?: TallySyncEvent['tallyResponse'];
  error?: string;
}

// ─── ERP Tally Settings (stored in Firestore: settings/tally) ──────────────────

export interface TallySettings {
  // These MUST match the names in the Tally company exactly
  companyName: string;             // e.g. "Hindustan Enterprises"
  salesLedgerName: string;         // e.g. "Sales (GST 18%)"
  cgstLedgerName: string;          // e.g. "Output CGST"
  sgstLedgerName: string;          // e.g. "Output SGST"
  igstLedgerName: string;          // e.g. "Output IGST"
  cashLedgerName: string;          // e.g. "Cash"
  bankLedgerName: string;          // e.g. "HDFC Bank"
  upiLedgerName: string;           // e.g. "Paytm / UPI"
  sundryDebtorsGroup: string;      // e.g. "Sundry Debtors"
  
  // Connector settings
  connectorEnabled: boolean;
  connectorLastSeen?: string;      // ISO — when the connector last polled
  connectorVersion?: string;

  updatedAt: string;
  updatedBy: string;
}
