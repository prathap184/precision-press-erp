import { db } from "@/lib/db";
import { contact, bill, debitNote, payment, paymentAllocation, journalEntry, journalLine } from "@/lib/db/schema";
import { eq, and, gte, lte, lt, notInArray, inArray, isNull } from "drizzle-orm";

/**
 * AP-oriented supplier statement builder, shared by the REST route and the MCP
 * tool so both stay consistent.
 */

export interface SupplierStatementTransaction {
  date: string;
  type: "bill" | "debit_note" | "payment" | "journal";
  documentNumber: string;
  description: string;
  // debit reduces what we owe (payments, debit notes); credit increases it (bills)
  debit: number;
  credit: number;
  balance: number;
}

export interface SupplierStatement {
  contact: {
    id: string;
    name: string;
    email: string | null;
    type: string;
  };
  startDate: string;
  endDate: string;
  openingBalance: number;
  transactions: SupplierStatementTransaction[];
  totalBilled: number;
  totalPaidOrCredited: number;
  closingBalance: number;
}

export class NotASupplierError extends Error {
  constructor() {
    super("Contact is not a supplier");
    this.name = "NotASupplierError";
  }
}

export async function buildSupplierStatement(
  organizationId: string,
  contactId: string,
  startDateInput?: string | null,
  endDateInput?: string | null
): Promise<SupplierStatement | null> {
  const contactRow = await db
    .select()
    .from(contact)
    .where(
      and(
        eq(contact.id, contactId),
        eq(contact.organizationId, organizationId),
        isNull(contact.deletedAt)
      )
    )
    .limit(1);

  if (!contactRow.length) return null;
  const c = contactRow[0];

  const isSupplier = c.type === "supplier" || c.type === "both";
  if (!isSupplier) throw new NotASupplierError();

  // Identify credit/debit-note "carrier" payments (zero-cash applications) for
  // this contact and exclude them — the debit note document is already counted.
  const carrierPaymentRows = await db
    .selectDistinct({ paymentId: paymentAllocation.paymentId })
    .from(paymentAllocation)
    .innerJoin(payment, eq(paymentAllocation.paymentId, payment.id))
    .where(
      and(
        eq(payment.organizationId, organizationId),
        eq(payment.contactId, contactId),
        inArray(paymentAllocation.documentType, ["credit_note", "debit_note"])
      )
    );
  const carrierPaymentIds = carrierPaymentRows.map((r) => r.paymentId);
  const excludeCarriers = carrierPaymentIds.length
    ? notInArray(payment.id, carrierPaymentIds)
    : undefined;

  const now = new Date();
  const defaultStart = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const defaultEnd = now.toISOString().slice(0, 10);

  const startDate = startDateInput || defaultStart;
  const endDate = endDateInput || defaultEnd;

  // ---------- Opening balance (what we owe before startDate) ----------
  let openingBalance = 0;

  const priorBills = await db
    .select({ total: bill.total })
    .from(bill)
    .where(
      and(
        eq(bill.organizationId, organizationId),
        eq(bill.contactId, contactId),
        lt(bill.issueDate, startDate),
        notInArray(bill.status, ["draft", "void"]),
        isNull(bill.deletedAt)
      )
    );
  openingBalance += priorBills.reduce((s, r) => s + r.total, 0);

  const priorDebits = await db
    .select({ total: debitNote.total })
    .from(debitNote)
    .where(
      and(
        eq(debitNote.organizationId, organizationId),
        eq(debitNote.contactId, contactId),
        lt(debitNote.issueDate, startDate),
        notInArray(debitNote.status, ["draft", "void"]),
        isNull(debitNote.deletedAt)
      )
    );
  openingBalance -= priorDebits.reduce((s, r) => s + r.total, 0);

  const priorPaymentsMade = await db
    .select({ amount: payment.amount })
    .from(payment)
    .where(
      and(
        eq(payment.organizationId, organizationId),
        eq(payment.contactId, contactId),
        eq(payment.type, "made"),
        lt(payment.date, startDate),
        isNull(payment.deletedAt),
        excludeCarriers
      )
    );
  openingBalance -= priorPaymentsMade.reduce((s, r) => s + r.amount, 0);

  // Journal lines prior to startDate for this supplier
  const priorJournals = await db
    .select({
      debitAmount: journalLine.debitAmount,
      creditAmount: journalLine.creditAmount,
    })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .where(
      and(
        eq(journalEntry.organizationId, organizationId),
        eq(journalLine.contactId, contactId),
        eq(journalEntry.status, "posted"),
        lt(journalEntry.date, startDate)
      )
    );

  for (const pj of priorJournals) {
    // Credits increase what we owe, Debits decrease what we owe
    openingBalance += (pj.creditAmount - pj.debitAmount);
  }

  // ---------- Transactions within date range ----------
  const transactions: SupplierStatementTransaction[] = [];

  // Journal entries in range for this supplier
  const journalsInRange = await db
    .select({
      date: journalEntry.date,
      voucherNumber: journalEntry.voucherNumber,
      entryNumber: journalEntry.entryNumber,
      entryDescription: journalEntry.description,
      lineDescription: journalLine.description,
      debitAmount: journalLine.debitAmount,
      creditAmount: journalLine.creditAmount,
    })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .where(
      and(
        eq(journalEntry.organizationId, organizationId),
        eq(journalLine.contactId, contactId),
        eq(journalEntry.status, "posted"),
        gte(journalEntry.date, startDate),
        lte(journalEntry.date, endDate)
      )
    );

  for (const j of journalsInRange) {
    transactions.push({
      date: j.date,
      type: "journal",
      documentNumber: j.voucherNumber || `JV-${j.entryNumber}`,
      description: j.lineDescription || j.entryDescription || "General Journal Entry",
      debit: j.debitAmount,
      credit: j.creditAmount,
      balance: 0,
    });
  }

  const billsInRange = await db
    .select()
    .from(bill)
    .where(
      and(
        eq(bill.organizationId, organizationId),
        eq(bill.contactId, contactId),
        gte(bill.issueDate, startDate),
        lte(bill.issueDate, endDate),
        notInArray(bill.status, ["draft", "void"]),
        isNull(bill.deletedAt)
      )
    );
  for (const b of billsInRange) {
    transactions.push({
      date: b.issueDate,
      type: "bill",
      documentNumber: b.billNumber,
      description: b.reference || `Bill ${b.billNumber}`,
      debit: 0,
      credit: b.total,
      balance: 0,
    });
  }

  const debitNotesInRange = await db
    .select()
    .from(debitNote)
    .where(
      and(
        eq(debitNote.organizationId, organizationId),
        eq(debitNote.contactId, contactId),
        gte(debitNote.issueDate, startDate),
        lte(debitNote.issueDate, endDate),
        notInArray(debitNote.status, ["draft", "void"]),
        isNull(debitNote.deletedAt)
      )
    );
  for (const dn of debitNotesInRange) {
    transactions.push({
      date: dn.issueDate,
      type: "debit_note",
      documentNumber: dn.debitNoteNumber,
      description: dn.reference || `Debit Note ${dn.debitNoteNumber}`,
      debit: dn.total,
      credit: 0,
      balance: 0,
    });
  }

  const paymentsMade = await db
    .select()
    .from(payment)
    .where(
      and(
        eq(payment.organizationId, organizationId),
        eq(payment.contactId, contactId),
        eq(payment.type, "made"),
        gte(payment.date, startDate),
        lte(payment.date, endDate),
        isNull(payment.deletedAt),
        excludeCarriers
      )
    );
  for (const p of paymentsMade) {
    transactions.push({
      date: p.date,
      type: "payment",
      documentNumber: p.paymentNumber,
      description: p.reference || `Payment ${p.paymentNumber}`,
      debit: p.amount,
      credit: 0,
      balance: 0,
    });
  }

  // Sort by date, then bills first, then debit notes, then payments.
  const typePriority: Record<string, number> = {
    bill: 0,
    journal: 1,
    debit_note: 2,
    payment: 3,
  };
  transactions.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return (typePriority[a.type] ?? 0) - (typePriority[b.type] ?? 0);
  });

  // Running balance (what we owe the supplier).
  let runningBalance = openingBalance;
  for (const tx of transactions) {
    runningBalance += tx.credit - tx.debit;
    tx.balance = runningBalance;
  }

  const totalBilled = transactions.reduce((s, t) => s + t.credit, 0);
  const totalPaidOrCredited = transactions.reduce((s, t) => s + t.debit, 0);

  return {
    contact: { id: c.id, name: c.name, email: c.email, type: c.type },
    startDate,
    endDate,
    openingBalance,
    transactions,
    totalBilled,
    totalPaidOrCredited,
    closingBalance: runningBalance,
  };
}
