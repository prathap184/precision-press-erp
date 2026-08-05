import { db } from "@/lib/db";
import {
  customerCredit,
  invoice,
  payment,
  paymentAllocation,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { getNextNumber } from "@/lib/api/numbering";
import {
  getNextEntryNumber,
  resolveBaseRate,
  toBaseLines,
  findAccountByCode,
  ensureControlAccount,
  Tx,
} from "@/lib/api/journal-automation";

export async function autoSweepCustomerCredits(
  ctx: { organizationId: string; userId: string },
  tx: Tx,
  contactId: string,
  currencyCode: string,
  applyDate: string
) {
  // Find all open credits for this customer in this currency
  const openCredits = await tx.query.customerCredit.findMany({
    where: and(
      eq(customerCredit.organizationId, ctx.organizationId),
      eq(customerCredit.contactId, contactId),
      eq(customerCredit.currencyCode, currencyCode),
      eq(customerCredit.status, "open"),
      sql`${customerCredit.deletedAt} IS NULL`
    ),
    orderBy: asc(customerCredit.date),
  });

  if (openCredits.length === 0) return;

  // Find all unpaid invoices (sent or partial) for this customer in this currency
  const openInvoices = await tx.query.invoice.findMany({
    where: and(
      eq(invoice.organizationId, ctx.organizationId),
      eq(invoice.contactId, contactId),
      eq(invoice.currencyCode, currencyCode),
      sql`${invoice.status} IN ('sent', 'partial')`,
      sql`${invoice.amountDue} > 0`,
      sql`${invoice.deletedAt} IS NULL`
    ),
    orderBy: asc(invoice.issueDate),
  });

  if (openInvoices.length === 0) return;

  // Resolve base rates and GL accounts (only do this once if we end up applying)
  const { currency, rate, base } = await resolveBaseRate(
    ctx.organizationId,
    currencyCode,
    applyDate
  );

  const arAccount = await findAccountByCode(ctx.organizationId, "1200", tx);
  if (!arAccount) {
    throw new Error("Accounts Receivable account (1200) not found");
  }
  const deposits = await ensureControlAccount(
    ctx.organizationId,
    "customerDeposits",
    base,
    tx
  );
  if (!deposits) {
    throw new Error("Could not resolve the Customer Deposits account");
  }

  let creditIndex = 0;
  let invoiceIndex = 0;

  // We need local tracking of remaining amounts since we might apply one credit across multiple invoices or vice versa
  const creditsRemaining = openCredits.map((c: any) => ({ id: c.id, remaining: c.amountRemaining, originalAmount: c.originalAmount, originalRemaining: c.amountRemaining }));
  const invoicesDue = openInvoices.map((i: any) => ({ id: i.id, due: i.amountDue, invoiceNumber: i.invoiceNumber, total: i.total, amountPaid: i.amountPaid, originalDue: i.amountDue }));

  while (creditIndex < creditsRemaining.length && invoiceIndex < invoicesDue.length) {
    const activeCredit = creditsRemaining[creditIndex];
    const activeInvoice = invoicesDue[invoiceIndex];

    if (activeCredit.remaining <= 0) {
      creditIndex++;
      continue;
    }
    if (activeInvoice.due <= 0) {
      invoiceIndex++;
      continue;
    }

    const applyAmount = Math.min(activeCredit.remaining, activeInvoice.due);
    
    activeCredit.remaining -= applyAmount;
    activeInvoice.due -= applyAmount;
    activeInvoice.amountPaid += applyAmount;

    // Create Journal Entry
    const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
    const description = `Auto-apply customer credit to invoice ${activeInvoice.invoiceNumber}`;
    const [entry] = await tx
      .insert(journalEntry)
      .values({
        organizationId: ctx.organizationId,
        entryNumber,
        date: applyDate,
        description,
        reference: activeInvoice.invoiceNumber,
        status: "posted",
        sourceType: "customer_credit_application",
        sourceId: activeCredit.id,
        postedAt: new Date(),
        createdBy: ctx.userId,
      })
      .returning();

    // DR Customer Deposits / CR AR
    const lines: (typeof journalLine.$inferInsert)[] = [
      {
        journalEntryId: entry.id,
        accountId: deposits.id,
        description,
        debitAmount: applyAmount,
        creditAmount: 0,
      },
      {
        journalEntryId: entry.id,
        accountId: arAccount.id,
        description,
        debitAmount: 0,
        creditAmount: applyAmount,
      },
    ];
    await tx.insert(journalLine).values(toBaseLines(lines, currency, rate));

    // Create payment tracking row
    const paymentNumber = await getNextNumber(
      ctx.organizationId,
      "payment",
      "payment_number",
      "PAY"
    );

    const [createdPayment] = await tx
      .insert(payment)
      .values({
        organizationId: ctx.organizationId,
        contactId,
        paymentNumber,
        type: "received",
        date: applyDate,
        amount: applyAmount,
        method: "other",
        reference: activeInvoice.invoiceNumber,
        notes: `Customer credit auto-applied to invoice ${activeInvoice.invoiceNumber}`,
        currencyCode,
        journalEntryId: entry.id,
        createdBy: ctx.userId,
      })
      .returning();

    await tx.insert(paymentAllocation).values([
      {
        paymentId: createdPayment.id,
        documentType: "prepayment",
        documentId: activeCredit.id,
        amount: applyAmount,
      },
      {
        paymentId: createdPayment.id,
        documentType: "invoice",
        documentId: activeInvoice.id,
        amount: applyAmount,
      },
    ]);
  }

  // Finalize Credit Updates
  for (const c of creditsRemaining) {
    if (c.remaining !== c.originalRemaining) { // If it changed
      const creditStatus = c.remaining <= 0 ? "applied" : "open";
      await tx
        .update(customerCredit)
        .set({
          amountRemaining: Math.max(0, c.remaining),
          status: creditStatus,
          updatedAt: new Date(),
        })
        .where(eq(customerCredit.id, c.id));
    }
  }

  // Finalize Invoice Updates
  for (const i of invoicesDue) {
    if (i.due !== i.originalDue) { // If it changed
      const invoiceStatus = i.due <= 0 ? "paid" : "partial";
      await tx
        .update(invoice)
        .set({
          amountPaid: i.amountPaid,
          amountDue: Math.max(0, i.due),
          status: invoiceStatus,
          paidAt: invoiceStatus === "paid" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(invoice.id, i.id));
    }
  }
}
