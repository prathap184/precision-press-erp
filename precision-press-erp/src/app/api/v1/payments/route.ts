import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payment, paymentAllocation, invoice, bill, bankAccount, bankTransaction, customerCredit } from "@/lib/db/schema";
import { eq, and, desc, sql, notInArray, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { assertNotLocked } from "@/lib/api/period-lock";
import { getNextNumber } from "@/lib/api/numbering";
import { createPaymentJournalEntry } from "@/lib/api/journal-automation";
import { enqueueTallySync } from "@/lib/actions/tally-sync";
import { isValidCurrencyCode } from "@/lib/currency/iso4217";
import { z } from "zod";

const allocationSchema = z.object({
  documentType: z.enum(["invoice", "bill"]),
  documentId: z.string().min(1),
  amount: z.number().int().positive(),
});

const createSchema = z.object({
  contactId: z.string().min(1),
  type: z.enum(["received", "made"]),
  date: z.string().min(1),
  amount: z.number().int().positive(),
  method: z.enum(["bank_transfer", "cash", "check", "card", "other"]).default("bank_transfer"),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  bankAccountId: z.string().nullable().optional(),
  // Optional — normally derived from the settled documents. Validated below.
  currencyCode: z.string().length(3).optional(),
  allocations: z.array(allocationSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const type = url.searchParams.get("type");
    const contactId = url.searchParams.get("contactId");

    const conditions = [
      eq(payment.organizationId, ctx.organizationId),
      notDeleted(payment.deletedAt),
    ];

    if (type) {
      conditions.push(eq(payment.type, type as "received" | "made"));
    }

    if (contactId) {
      conditions.push(eq(payment.contactId, contactId));
    }

    // Exclude carrier payments — these are zero-cash internal rows created when
    // a customer credit (prepayment) or credit/debit note is applied to an invoice.
    // They must not appear in the Payments list as if real cash was received.
    const carrierRows = await db
      .selectDistinct({ paymentId: paymentAllocation.paymentId })
      .from(paymentAllocation)
      .innerJoin(payment, eq(paymentAllocation.paymentId, payment.id))
      .where(
        and(
          eq(payment.organizationId, ctx.organizationId),
          inArray(paymentAllocation.documentType, ["prepayment", "credit_note", "debit_note"])
        )
      );
    const carrierIds = carrierRows.map((r) => r.paymentId);
    if (carrierIds.length) {
      conditions.push(notInArray(payment.id, carrierIds));
    }

    const payments = await db.query.payment.findMany({
      where: and(...conditions),
      orderBy: desc(payment.createdAt),
      limit,
      offset,
      with: { contact: true, allocations: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(payment)
      .where(and(...conditions));

    // Enrich payments with master journalEntryId for advance receipts
    const allCredits = await db.query.customerCredit.findMany({
      where: and(
        eq(customerCredit.organizationId, ctx.organizationId),
        notDeleted(customerCredit.deletedAt)
      ),
      columns: { id: true, journalEntryId: true, notes: true },
      with: { journalEntry: { columns: { id: true, reference: true, entryNumber: true } } },
    });

    const enrichedPayments = payments.map((p) => {
      const ref = p.reference || p.paymentNumber;
      const creditMatch = allCredits.find(
        (c) =>
          c.journalEntry?.reference === ref ||
          c.journalEntry?.id === p.journalEntryId ||
          c.notes?.includes(ref)
      );

      const targetJeId = creditMatch?.journalEntryId || creditMatch?.journalEntry?.id || p.journalEntryId;
      return {
        ...p,
        journalEntryId: targetJeId,
      };
    });

    return NextResponse.json(
      paginatedResponse(enrichedPayments, Number(countResult?.count || 0), page, limit)
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

    // Validate allocations total does not exceed payment amount
    const allocationsTotal = parsed.allocations.reduce((sum, a) => sum + a.amount, 0);
    if (allocationsTotal > parsed.amount) {
      return NextResponse.json(
        { error: "Allocations total exceeds payment amount" },
        { status: 400 }
      );
    }

    // A "received" payment settles invoices (AR); a "made" payment settles bills
    // (AP). Reject inconsistent allocations so the journal posts to the correct
    // control account and realised-FX direction.
    const expectedDocType = parsed.type === "received" ? "invoice" : "bill";
    if (parsed.allocations.some((a) => a.documentType !== expectedDocType)) {
      return NextResponse.json(
        { error: `A '${parsed.type}' payment can only settle ${expectedDocType}s` },
        { status: 400 }
      );
    }

    // Resolve the payment currency from the documents it settles, and capture
    // each document's currency + issue date so the journal entry can convert to
    // base currency and book realised FX. A payment settles one currency only.
    const docCurrencies = new Set<string>();
    const journalAllocations: {
      amount: number;
      currencyCode: string;
      issueDate: string;
    }[] = [];
    for (const alloc of parsed.allocations) {
      if (alloc.documentType === "invoice") {
        const doc = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, alloc.documentId),
            eq(invoice.organizationId, ctx.organizationId)
          ),
          columns: { currencyCode: true, issueDate: true },
        });
        if (!doc) {
          return NextResponse.json(
            { error: `Invoice ${alloc.documentId} not found` },
            { status: 404 }
          );
        }
        docCurrencies.add(doc.currencyCode);
        journalAllocations.push({
          amount: alloc.amount,
          currencyCode: doc.currencyCode,
          issueDate: doc.issueDate,
        });
      } else {
        const doc = await db.query.bill.findFirst({
          where: and(
            eq(bill.id, alloc.documentId),
            eq(bill.organizationId, ctx.organizationId)
          ),
          columns: { currencyCode: true, issueDate: true },
        });
        if (!doc) {
          return NextResponse.json(
            { error: `Bill ${alloc.documentId} not found` },
            { status: 404 }
          );
        }
        docCurrencies.add(doc.currencyCode);
        journalAllocations.push({
          amount: alloc.amount,
          currencyCode: doc.currencyCode,
          issueDate: doc.issueDate,
        });
      }
    }

    if (docCurrencies.size > 1) {
      return NextResponse.json(
        { error: "All settled documents must share the same currency" },
        { status: 400 }
      );
    }

    const docCurrency = [...docCurrencies][0];
    const providedCurrency = parsed.currencyCode?.toUpperCase();
    if (providedCurrency && !isValidCurrencyCode(providedCurrency)) {
      return NextResponse.json(
        { error: `${providedCurrency} is not a recognized currency code` },
        { status: 400 }
      );
    }
    if (providedCurrency && docCurrency && providedCurrency !== docCurrency) {
      return NextResponse.json(
        { error: "Payment currency must match the settled documents' currency" },
        { status: 400 }
      );
    }
    const currencyCode = providedCurrency ?? docCurrency ?? "INR";

    // Generate payment number
    const paymentNumber = await getNextNumber(ctx.organizationId, "payment", "payment_number", "PAY");

    // Atomically write the payment, its allocations, the settled-document
    // balance/status updates, the GL journal entry, and the payment→journal
    // link. createPaymentJournalEntry can throw MissingExchangeRateError (422)
    // when a foreign-currency allocation lacks a rate; wrapping everything in a
    // single transaction ensures that — or any other failure — rolls the whole
    // settlement back together instead of leaving orphaned/inconsistent rows.
    const { created } = await db.transaction(async (tx) => {
      // Resolve bank account (from payload or fallback)
      let selectedBankAccountId = parsed.bankAccountId || null;
      if (!selectedBankAccountId) {
        if (parsed.method === "cash") {
          const cashBank = await tx.query.bankAccount.findFirst({
            where: and(
              eq(bankAccount.organizationId, ctx.organizationId),
              eq(bankAccount.accountType, "cash"),
              notDeleted(bankAccount.deletedAt)
            ),
          });
          if (cashBank) selectedBankAccountId = cashBank.id;
        } else {
          const defaultBank = await tx.query.bankAccount.findFirst({
            where: and(
              eq(bankAccount.organizationId, ctx.organizationId),
              notDeleted(bankAccount.deletedAt)
            ),
            orderBy: bankAccount.createdAt,
          });
          if (defaultBank) selectedBankAccountId = defaultBank.id;
        }
      }

      // Look up target bank account to get its linked chart account code
      let targetBankCode: string | undefined = undefined;
      if (selectedBankAccountId) {
        const targetBank = await tx.query.bankAccount.findFirst({
          where: and(
            eq(bankAccount.id, selectedBankAccountId),
            eq(bankAccount.organizationId, ctx.organizationId)
          ),
          with: { chartAccount: true },
        });
        if (targetBank?.chartAccount?.code) {
          targetBankCode = targetBank.chartAccount.code;
        }
      }

      // Create payment record
      const [created] = await tx
        .insert(payment)
        .values({
          organizationId: ctx.organizationId,
          contactId: parsed.contactId,
          paymentNumber,
          type: parsed.type,
          date: parsed.date,
          amount: parsed.amount,
          currencyCode,
          method: parsed.method,
          reference: parsed.reference || null,
          notes: parsed.notes || null,
          bankAccountId: selectedBankAccountId,
          createdBy: ctx.userId,
        })
        .returning();

      // Insert allocation rows
      await tx.insert(paymentAllocation).values(
        parsed.allocations.map((a) => ({
          paymentId: created.id,
          documentType: a.documentType,
          documentId: a.documentId,
          amount: a.amount,
        }))
      );

      // Update allocated documents
      for (const alloc of parsed.allocations) {
        if (alloc.documentType === "invoice") {
          const existing = await tx.query.invoice.findFirst({
            where: and(
              eq(invoice.id, alloc.documentId),
              eq(invoice.organizationId, ctx.organizationId)
            ),
          });
          if (existing) {
            const newAmountPaid = existing.amountPaid + alloc.amount;
            const newAmountDue = existing.amountDue - alloc.amount;
            const newStatus = newAmountDue <= 0 ? "paid" : "partial";
            await tx
              .update(invoice)
              .set({
                amountPaid: newAmountPaid,
                amountDue: Math.max(0, newAmountDue),
                status: newStatus,
                updatedAt: new Date(),
              })
              .where(eq(invoice.id, alloc.documentId));
          }
        } else if (alloc.documentType === "bill") {
          const existing = await tx.query.bill.findFirst({
            where: and(
              eq(bill.id, alloc.documentId),
              eq(bill.organizationId, ctx.organizationId)
            ),
          });
          if (existing) {
            const newAmountPaid = existing.amountPaid + alloc.amount;
            const newAmountDue = existing.amountDue - alloc.amount;
            const newStatus = newAmountDue <= 0 ? "paid" : "partial";
            await tx
              .update(bill)
              .set({
                amountPaid: newAmountPaid,
                amountDue: Math.max(0, newAmountDue),
                status: newStatus,
                updatedAt: new Date(),
              })
              .where(eq(bill.id, alloc.documentId));
          }
        }
      }

      // Create journal entry with the resolved bank account code
      const journalEntry = await createPaymentJournalEntry(
        { organizationId: ctx.organizationId, userId: ctx.userId },
        {
          type: parsed.type === "received" ? "invoice" : "bill",
          reference: paymentNumber,
          amount: parsed.amount,
          date: parsed.date,
          bankAccountCode: targetBankCode,
          allocations: journalAllocations,
        },
        tx
      );

      // Link journal entry to payment
      if (journalEntry) {
        await tx
          .update(payment)
          .set({ journalEntryId: journalEntry.id, updatedAt: new Date() })
          .where(eq(payment.id, created.id));
      }

      // Auto-create bank transaction for the selected bank account so it appears in Banking tab
      if (selectedBankAccountId) {
        const isReceived = parsed.type === "received";
        const txAmount = isReceived ? parsed.amount : -parsed.amount;
        await tx.insert(bankTransaction).values({
          bankAccountId: selectedBankAccountId,
          date: parsed.date,
          description: `Payment for ${paymentNumber}`,
          reference: paymentNumber,
          amount: txAmount,
          status: "unreconciled",
          journalEntryId: journalEntry?.id || null,
          sourceType: "manual",
          currencyCode,
        });
      }

      return { created, journalEntry };
    });

    const result = await db.query.payment.findFirst({
      where: eq(payment.id, created.id),
      with: { contact: true, allocations: true },
    });

    logAudit({ ctx, action: "create", entityType: "payment", entityId: created.id, request });

    // Enqueue to Tally Sync Queue
    if (parsed.type === "received") {
      try {
        const selectedBank = selectedBankAccountId
          ? await db.query.bankAccount.findFirst({ where: eq(bankAccount.id, selectedBankAccountId) })
          : null;
        const bankLedgerName = selectedBank?.tally_ledger_name || (parsed.method === "cash" ? "Cash" : "Federal 2091");
        const voucherType = (bankLedgerName.toLowerCase().includes("cash") || parsed.method === "cash") ? "Rec10 B8 Cash" : "Rec1 B1 Bank";
        
        // Build bill allocations for each invoice allocation
        const billAllocs = (result?.allocations || []).map((a) => {
          const invMatch = invoiceMap.get(a.documentId);
          return {
            name: invMatch?.invoiceNumber || a.documentId,
            billType: "Agst Ref",
            amount: a.amount / 100,
          };
        });

        const receiptPayload = {
          tallyCompanyName: process.env.TALLY_COMPANY_NAME || "Website Testing Hindustan",
          voucherType,
          receiptEntryNumber: paymentNumber,
          voucherNumber: paymentNumber,
          voucherDate: parsed.date,
          invoiceDate: parsed.date,
          date: parsed.date,
          totalAmount: parsed.amount / 100,
          amount: parsed.amount / 100,
          paymentMode: (bankLedgerName.toLowerCase().includes("cash") || parsed.method === "cash") ? "CASH" : "BANK",
          bankLedger: bankLedgerName,
          cashLedger: bankLedgerName,
          debtorLedgerName: customerLedgerName,
          customerName: customerLedgerName,
          partyGstin: result?.contact?.taxNumber || "",
          cmpGstin: "29AFHPP0687G1Z2",
          cmpState: "Karnataka",
          remarks: parsed.notes || `Receipt ${paymentNumber}`,
          allocations: billAllocs,
          billAllocations: billAllocs.length > 0 ? billAllocs : {
            name: paymentNumber,
            billType: "On Account",
            amount: parsed.amount / 100,
          },
        };

        await enqueueTallySync({
          syncType: "RECEIPT_VOUCHER",
          paymentId: created.id,
          customerId: parsed.contactId,
          payload: receiptPayload,
          createdBy: ctx.userId,
          voucherId: paymentNumber,
          voucherType: "Receipt",
          refId: paymentNumber,
          customerName: customerLedgerName,
          amountSnap: parsed.amount / 100,
        });
      } catch (tErr) {
        console.warn("Failed to enqueue receipt to Tally queue:", tErr);
      }
    }

    return NextResponse.json({ payment: result }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
