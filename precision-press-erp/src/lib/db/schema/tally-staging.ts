/**
 * tally-staging.ts
 *
 * Staging (dummy) tables for importing data from Tally into the ERP.
 * Workflow:
 *   1. Import Tally data into these tables (import_status = 'pending')
 *   2. Verify / review data in staging tables
 *   3. Run the migration job to push verified rows into actual production tables
 *   4. Update import_status to 'imported' or 'failed' with error_message
 *
 * These tables are SAFE to wipe and re-import without touching live data.
 */

import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  date,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// 1. contact_tally — Customers / Suppliers from Tally Ledgers
// ---------------------------------------------------------------------------

export const contactTally = pgTable("contact_tally", {
  // Staging PK — independent from the real contact table
  stagingId: uuid("staging_id").primaryKey().defaultRandom(),

  // Import workflow fields
  importStatus: text("import_status").notNull().default("pending"),
  // Values: 'pending' | 'verified' | 'imported' | 'failed' | 'skipped'
  errorMessage: text("error_message"),

  // Raw Tally fields — kept as-is for audit / debugging
  tallyLedgerName: text("tally_ledger_name").notNull(),
  // e.g. "Reliance Ind", "Ramesh Traders"
  tallyLedgerGroup: text("tally_ledger_group"),
  // e.g. "Sundry Debtors", "Sundry Creditors"

  // Mapped / cleaned fields (filled during import or by user correction)
  organizationId: uuid("organization_id").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  taxNumber: text("tax_number"), // GST number
  type: text("type").notNull().default("customer"),
  // 'customer' | 'supplier' | 'both'
  paymentTermsDays: integer("payment_terms_days"),
  addresses: jsonb("addresses").$type<{
    billing?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
    shipping?: {
      line1?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  }>(),
  creditLimit: integer("credit_limit"), // in cents, null = no limit

  // After successful import: the real contact.id this was pushed to
  importedContactId: uuid("imported_contact_id"),

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// 2. bank_account_tally — Bank Ledgers from Tally
// ---------------------------------------------------------------------------

export const bankAccountTally = pgTable("bank_account_tally", {
  stagingId: uuid("staging_id").primaryKey().defaultRandom(),

  importStatus: text("import_status").notNull().default("pending"),
  errorMessage: text("error_message"),

  // Raw Tally fields
  tallyLedgerName: text("tally_ledger_name").notNull(),
  // e.g. "HDFC Current A/c", "SBI Savings"

  // Mapped / cleaned fields
  organizationId: uuid("organization_id").notNull(),
  accountName: text("account_name").notNull(),
  accountNumber: text("account_number"),
  bankName: text("bank_name"),
  currencyCode: text("currency_code").notNull().default("INR"),
  accountType: text("account_type").notNull().default("checking"),
  // 'checking' | 'savings' | 'cash' | 'credit'

  // After successful import: the real bank_account.id this was pushed to
  importedBankAccountId: uuid("imported_bank_account_id"),

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// 3. invoice_tally — Sales Voucher Headers from Tally
// ---------------------------------------------------------------------------

export const invoiceTally = pgTable("invoice_tally", {
  stagingId: uuid("staging_id").primaryKey().defaultRandom(),

  importStatus: text("import_status").notNull().default("pending"),
  errorMessage: text("error_message"),

  // Raw Tally fields
  tallyContactName: text("tally_contact_name").notNull(),
  // Raw customer/party name from Tally voucher

  // Mapped / cleaned fields
  organizationId: uuid("organization_id").notNull(),
  contactId: uuid("contact_id"),
  // Nullable until mapped — filled when contact_tally row is imported

  invoiceNumber: text("invoice_number").notNull(),
  // Tally voucher number e.g. "INV-2024-001"
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date"),
  status: text("status").notNull().default("draft"),
  // 'draft' | 'sent' | 'paid' | 'partial'

  // All amounts in integer cents (paise)
  subtotal: integer("subtotal").notNull().default(0),
  taxTotal: integer("tax_total").notNull().default(0),
  total: integer("total").notNull().default(0),
  amountDue: integer("amount_due").notNull().default(0),
  currencyCode: text("currency_code").notNull().default("INR"),

  notes: text("notes"),

  // After successful import: the real invoice.id this was pushed to
  importedInvoiceId: uuid("imported_invoice_id"),

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// 4. invoice_line_tally — Line Items for Sales Vouchers
// ---------------------------------------------------------------------------

export const invoiceLineTally = pgTable("invoice_line_tally", {
  stagingId: uuid("staging_id").primaryKey().defaultRandom(),

  // Links back to invoice_tally header
  invoiceStagingId: uuid("invoice_staging_id")
    .notNull()
    .references(() => invoiceTally.stagingId, { onDelete: "cascade" }),

  // Raw Tally fields
  tallyItemName: text("tally_item_name"),
  // Raw stock item / product name from Tally
  tallyLedgerName: text("tally_ledger_name"),
  // Raw ledger name e.g. "Sales A/c", "GST 18%"

  // Mapped / cleaned fields
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(100),
  // Stored as integer * 100 (e.g. 1 unit = 100) to match ERP convention
  unitPrice: integer("unit_price").notNull().default(0),
  // In cents (paise)
  amount: integer("amount").notNull().default(0),
  // In cents
  taxAmount: integer("tax_amount").notNull().default(0),
  // In cents

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// 5. payment_tally — Receipt Voucher Headers from Tally
// ---------------------------------------------------------------------------

export const paymentTally = pgTable("payment_tally", {
  stagingId: uuid("staging_id").primaryKey().defaultRandom(),

  importStatus: text("import_status").notNull().default("pending"),
  errorMessage: text("error_message"),

  // Raw Tally fields
  tallyContactName: text("tally_contact_name").notNull(),
  // Raw party/customer name from Tally receipt voucher
  tallyBankName: text("tally_bank_name"),
  // Raw bank ledger name from Tally e.g. "HDFC Current A/c"

  // Mapped / cleaned fields
  organizationId: uuid("organization_id").notNull(),
  contactId: uuid("contact_id"),
  // Nullable until mapped
  bankAccountId: uuid("bank_account_id"),
  // Nullable until bank_account_tally is imported and mapped

  paymentNumber: text("payment_number").notNull(),
  // Tally receipt voucher number e.g. "REC-2024-001"
  type: text("type").notNull().default("received"),
  date: date("date").notNull(),

  // Amount in integer cents (paise)
  amount: integer("amount").notNull().default(0),
  method: text("method").notNull().default("bank_transfer"),
  // 'bank_transfer' | 'cash' | 'cheque' | 'upi'
  reference: text("reference"),
  // Cheque number / NEFT reference / UTR
  notes: text("notes"),
  // Tally narration
  currencyCode: text("currency_code").notNull().default("INR"),

  // After successful import: the real payment.id this was pushed to
  importedPaymentId: uuid("imported_payment_id"),

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// 6. payment_allocation_tally — Bill-wise Details (Against Invoice)
// ---------------------------------------------------------------------------

export const paymentAllocationTally = pgTable("payment_allocation_tally", {
  stagingId: uuid("staging_id").primaryKey().defaultRandom(),

  // Links back to payment_tally header
  paymentStagingId: uuid("payment_staging_id")
    .notNull()
    .references(() => paymentTally.stagingId, { onDelete: "cascade" }),

  // Raw Tally fields
  tallyInvoiceNumber: text("tally_invoice_number"),
  // Raw invoice/voucher number being paid from Tally bill-wise details

  // Mapped / cleaned fields
  documentType: text("document_type").notNull().default("invoice"),
  // 'invoice' | 'prepayment' | 'credit_note'
  documentId: uuid("document_id"),
  // Nullable until invoice_tally is imported and mapped
  // In cents (paise)
  amount: integer("amount").notNull().default(0),

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const invoiceTallyRelations = relations(invoiceTally, ({ many }) => ({
  lines: many(invoiceLineTally),
}));

export const invoiceLineTallyRelations = relations(
  invoiceLineTally,
  ({ one }) => ({
    invoice: one(invoiceTally, {
      fields: [invoiceLineTally.invoiceStagingId],
      references: [invoiceTally.stagingId],
    }),
  })
);

export const paymentTallyRelations = relations(paymentTally, ({ many }) => ({
  allocations: many(paymentAllocationTally),
}));

export const paymentAllocationTallyRelations = relations(
  paymentAllocationTally,
  ({ one }) => ({
    payment: one(paymentTally, {
      fields: [paymentAllocationTally.paymentStagingId],
      references: [paymentTally.stagingId],
    }),
  })
);
