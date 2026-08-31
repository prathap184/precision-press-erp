import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  customerCredit,
  bankAccount,
  chartAccount,
  journalEntry,
  journalLine,
  payment,
  contact,
} from "@/lib/db/schema";
import { enqueueTallySync } from "@/lib/actions/tally-sync";
import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { assertNotLocked } from "@/lib/api/period-lock";
import { logAudit } from "@/lib/api/audit";
import { checkMultiCurrency } from "@/lib/api/check-limit";
import { resolveDocumentCurrency } from "@/lib/currency/resolve-currency";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { getNextNumber } from "@/lib/api/numbering";
import {
  getNextEntryNumber,
  resolveBaseRate,
  toBaseLines,
  assertBaseRateAvailable,
  ensureControlAccount,
  autoReconcilePayment,
} from "@/lib/api/journal-automation";
import { ensureBankLedgerAccount } from "@/lib/api/bank-ledger";
import { autoSweepCustomerCredits } from "@/lib/api/auto-sweep";
import { z } from "zod";

// A customer credit holds money received in advance of (or in excess of) an
// invoice: a prepayment, a refundable deposit, or an overpayment on account.
// Creating one posts cash immediately and books a Customer Deposits liability.
const createSchema = z.object({
  contactId: z.string().min(1),
  date: z.string().min(1),
  amount: z.number().int().positive().describe("Credit amount in integer cents."),
  sourceType: z.enum(["prepayment", "overpayment", "credit_note"]),
  currencyCode: currencyCodeSchema.optional(),
  notes: z.string().nullable().optional(),
  // Where the cash landed: a bank account (preferred) or a deposit chart
  // account. Exactly one is used to post DR cash. Optional only for the
  // 'credit_note' source, whose cash/AR side is posted elsewhere.
  bankAccountId: z.string().nullable().optional(),
  depositAccountId: z.string().nullable().optional(),
  adjustmentType: z.enum(["NEW_REF", "ON_ACCOUNT"]).optional(),
  referenceName: z.string().nullable().optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SORT_COLUMNS: Record<string, any> = {
  date: customerCredit.date,
  amount: customerCredit.originalAmount,
  remaining: customerCredit.amountRemaining,
  created: customerCredit.createdAt,
};

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");
    const contactId = url.searchParams.get("contactId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const sortBy = url.searchParams.get("sortBy") || "created";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";

    const conditions = [
      eq(customerCredit.organizationId, ctx.organizationId),
      notDeleted(customerCredit.deletedAt),
    ];

    if (status) {
      conditions.push(
        eq(customerCredit.status, status as (typeof customerCredit.status.enumValues)[number])
      );
    }
    if (contactId) {
      conditions.push(eq(customerCredit.contactId, contactId));
    }
    if (from) {
      conditions.push(gte(customerCredit.date, from));
    }
    if (to) {
      conditions.push(lte(customerCredit.date, to));
    }

    const sortCol = SORT_COLUMNS[sortBy] || customerCredit.createdAt;
    const orderFn = sortOrder === "asc" ? asc : desc;

    const credits = await db.query.customerCredit.findMany({
      where: and(...conditions),
      orderBy: orderFn(sortCol),
      limit,
      offset,
      with: { contact: true, journalEntry: { columns: { reference: true, entryNumber: true } } },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(customerCredit)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(credits, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await assertNotLocked(ctx.organizationId, parsed.date);

    const currencyCode = await resolveDocumentCurrency(
      ctx.organizationId,
      parsed.currencyCode,
      parsed.contactId
    );
    await checkMultiCurrency(ctx.organizationId, currencyCode);

    // Resolve the cash account: bank account's linked GL > deposit chart account.
    let cashAccountId: string | null = null;
    if (parsed.bankAccountId) {
      const acct = await db.query.bankAccount.findFirst({
        where: and(
          eq(bankAccount.id, parsed.bankAccountId),
          eq(bankAccount.organizationId, ctx.organizationId),
          notDeleted(bankAccount.deletedAt)
        ),
        columns: {
          id: true,
          accountName: true,
          accountType: true,
          currencyCode: true,
          chartAccountId: true,
        },
      });
      if (!acct) return notFound("Bank account");
      // Connect the bank account to its ledger account automatically (older
      // accounts self-heal on first use) so recording a credit never dead-ends.
      cashAccountId = await ensureBankLedgerAccount(ctx.organizationId, acct);
    } else if (parsed.depositAccountId) {
      const acct = await db.query.chartAccount.findFirst({
        where: and(
          eq(chartAccount.id, parsed.depositAccountId),
          eq(chartAccount.organizationId, ctx.organizationId)
        ),
        columns: { id: true },
      });
      if (!acct) return notFound("Deposit account");
      cashAccountId = acct.id;
    } else {
      return validationError(
        "A bankAccountId or depositAccountId is required to record where the money landed."
      );
    }

    // Foreign-currency credits need a base rate to post. Pre-flight first.
    await assertBaseRateAvailable(ctx.organizationId, currencyCode, parsed.date);

    const { currency, rate, base } = await resolveBaseRate(
      ctx.organizationId,
      currencyCode,
      parsed.date
    );

    const created = await db.transaction(async (tx) => {
      const arAccount =
        (await ensureControlAccount(ctx.organizationId, "customerDeposits", base, tx));
      if (!arAccount) {
        throw new Error("Could not resolve Customer Deposits control account");
      }

      const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
      const recRef =
        parsed.referenceName ||
        (await getNextNumber(ctx.organizationId, "payment", "payment_number", "REC"));
      const description = `Customer Receipt ${recRef}`;
      const [entry] = await tx
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber,
          date: parsed.date,
          description,
          reference: recRef,
          status: "posted",
          sourceType: "customer_credit",
          postedAt: new Date(),
          createdBy: ctx.userId,
        })
        .returning();

      // DR Cash/Bank / CR Customer Deposits (Tally F6 Receipt model)
      const lines: (typeof journalLine.$inferInsert)[] = [
        {
          journalEntryId: entry.id,
          accountId: cashAccountId!,
          description,
          debitAmount: parsed.amount,
          creditAmount: 0,
        },
        {
          journalEntryId: entry.id,
          accountId: arAccount.id,
          description,
          debitAmount: 0,
          creditAmount: parsed.amount,
        },
      ];
      await tx.insert(journalLine).values(toBaseLines(lines, currency, rate));

      // Record in Payment ledger so it appears under Payments & Customer Statements
      await tx.insert(payment).values({
        organizationId: ctx.organizationId,
        contactId: parsed.contactId,
        paymentNumber: recRef,
        type: "received",
        amount: parsed.amount,
        method: parsed.bankAccountId ? "bank_transfer" : "cash",
        bankAccountId: parsed.bankAccountId || null,
        date: parsed.date,
        reference: recRef,
        notes: parsed.notes || description,
        currencyCode,
        journalEntryId: entry.id,
        createdBy: ctx.userId,
      });

      const [row] = await tx
        .insert(customerCredit)
        .values({
          organizationId: ctx.organizationId,
          contactId: parsed.contactId,
          date: parsed.date,
          currencyCode,
          originalAmount: parsed.amount,
          amountRemaining: parsed.amount,
          sourceType: parsed.sourceType,
          status: "open",
          journalEntryId: entry.id,
          notes: parsed.notes || null,
          createdBy: ctx.userId,
        })
        .returning();

      if (parsed.bankAccountId && cashAccountId) {
        await autoReconcilePayment(
          { organizationId: ctx.organizationId, userId: ctx.userId },
          tx,
          cashAccountId,
          entry,
          parsed.amount,
          currencyCode
        );
      }

      // Disabled auto-sweeping so invoices are not automatically marked paid (Tally workflow)
      // await autoSweepCustomerCredits(
      //   { organizationId: ctx.organizationId, userId: ctx.userId },
      //   tx,
      //   parsed.contactId,
      //   currencyCode,
      //   parsed.date
      // );

      return { row, recRef };
    });

    logAudit({
      ctx,
      action: "create",
      entityType: "customer_credit",
      entityId: created.row.id,
      request,
    });

    // Enqueue Receipt Voucher to Tally Sync Queue
    try {
      const customer = await db.query.contact.findFirst({
        where: eq(contact.id, parsed.contactId),
      });
      const customerLedgerName = customer?.name || "Sundry Debtors";
      const receiptRef = created.recRef || parsed.referenceName || `REC-${created.row.id.slice(0, 6).toUpperCase()}`;

      const receiptPayload = {
        tallyCompanyName: "Hindustan Enterprises 25-26",
        voucherType: parsed.bankAccountId ? "Rec1 B1 Bank" : "Rec10 B8 Cash",
        receiptEntryNumber: receiptRef,
        voucherNumber: receiptRef,
        voucherDate: parsed.date,
        invoiceDate: parsed.date,
        date: parsed.date,
        totalAmount: parsed.amount / 100,
        amount: parsed.amount / 100,
        paymentMode: parsed.bankAccountId ? "BANK" : "CASH",
        bankLedger: parsed.bankAccountId ? "Rec1 B1 Bank" : "Cash",
        cashLedger: "Cash",
        debtorLedgerName: customerLedgerName,
        customerName: customerLedgerName,
        partyGstin: customer?.taxNumber || "",
        cmpGstin: "29AFHPP0687G1Z2",
        cmpState: "Karnataka",
        remarks: parsed.notes || `Customer Receipt ${receiptRef}`,
        allocations: [],
        billAllocations: {
          name: receiptRef,
          billType: parsed.adjustmentType === "ON_ACCOUNT" ? "On Account" : "Advance",
          amount: parsed.amount / 100,
        },
      };

      await enqueueTallySync({
        syncType: "RECEIPT_VOUCHER",
        paymentId: created.row.id,
        customerId: parsed.contactId,
        payload: receiptPayload,
        createdBy: ctx.userId,
        voucherId: receiptRef,
        voucherType: "Receipt",
        refId: receiptRef,
        customerName: customerLedgerName,
        amountSnap: parsed.amount / 100,
      });
    } catch (tErr) {
      console.warn("Failed to enqueue Receipt Voucher to Tally queue:", tErr);
    }

    return NextResponse.json({ customerCredit: created.row }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
