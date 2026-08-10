import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { journalEntry, journalLine, voucherSetting, voucherSequence, fiscalYear, bankAccount, bankTransaction } from "@/lib/db/schema";
import { eq, sql, desc, and, or } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { centsToDecimal } from "@/lib/money";
import { assertNotLocked } from "@/lib/api/period-lock";
import { checkMonthlyLimit } from "@/lib/api/check-limit";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";

const lineSchema = z.object({
  accountId: z.string().min(1),
  description: z.string().nullable().optional(),
  debitAmount: z.number().int().min(0).default(0),
  creditAmount: z.number().int().min(0).default(0),
  currencyCode: currencyCodeSchema.default("INR"),
  exchangeRate: z.number().int().default(1000000),
  contactId: z.string().nullable().optional(),
  costCenterId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  instrumentType: z.string().nullable().optional(),
  instrumentNo: z.string().nullable().optional(),
  instrumentDate: z.string().nullable().optional(),
  // Bill-wise Details — Phase 1
  adjustmentType: z.enum(["NEW_REF", "AGAINST_REF", "ON_ACCOUNT", "ADVANCE", "OPENING_BALANCE"]).nullable().optional(),
  referenceName: z.string().nullable().optional(),
  referenceType: z.enum(["SALES_INVOICE", "PURCHASE_BILL", "SALES_ORDER", "PURCHASE_ORDER", "PROJECT", "JOB_CARD"]).nullable().optional(),
  referenceId: z.string().nullable().optional(),
});

const createSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  reference: z.string().nullable().optional(),
  fiscalYearId: z.string().nullable().optional(), // Auto-resolved if omitted
  voucherType: z.enum(["JOURNAL", "CONTRA", "SALES", "PURCHASE", "RECEIPT", "PAYMENT"]).default("JOURNAL"),
  status: z.enum(["draft", "posted"]).default("draft"),
  subType: z.string().nullable().optional(),
  sourceModule: z.enum(["MANUAL", "SALES", "PURCHASE", "PAYMENT", "RECEIPT", "CONTRA", "STOCK", "PAYROLL", "ASSET"]).default("MANUAL"),
  // If set, a scheduled job posts a mirror reversing entry on this date
  // (accruals / prepayments). Must be on or after the entry date.
  autoReverseDate: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(2),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const type = url.searchParams.get("type");

    const entries = await db.query.journalEntry.findMany({
      where: and(
        eq(journalEntry.organizationId, ctx.organizationId),
        type ? eq(journalEntry.voucherType, type as any) : undefined
      ),
      orderBy: desc(journalEntry.createdAt),
      limit,
      with: {
        lines: true,
      },
    });

    const result = entries.map((e) => {
      const totalDebit = e.lines.reduce((sum, l) => sum + l.debitAmount, 0);
      return {
        ...e,
        lines: undefined,
        totalDebit: centsToDecimal(totalDebit),
      };
    });

    return NextResponse.json({
      entries: result,
      total: result.length,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await assertNotLocked(ctx.organizationId, parsed.date);
    await checkMonthlyLimit(ctx.organizationId, journalEntry, journalEntry.organizationId, journalEntry.createdAt, "entriesPerMonth");

    // Validate balance. A single-currency entry must balance in its own
    // amounts. A multi-currency entry (lines in different currencies, or any
    // non-1.0 exchange rate) must balance in BASE currency — comparing raw
    // amounts across currencies is meaningless and would let an unbalanced
    // entry post.
    const totalDebit = parsed.lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredit = parsed.lines.reduce((sum, l) => sum + l.creditAmount, 0);
    const firstCurrency = parsed.lines[0]?.currencyCode;
    const isMultiCurrency = parsed.lines.some(
      (l) => l.currencyCode !== firstCurrency || l.exchangeRate !== 1_000_000
    );

    if (parsed.status === "posted") {
      if (!isMultiCurrency) {
        if (totalDebit !== totalCredit) {
          return NextResponse.json(
            { error: "Debits must equal credits" },
            { status: 400 }
          );
        }
      } else {
        const toBase = (amount: number, rate: number) =>
          Math.round((amount * rate) / 1_000_000);
        const baseDebit = parsed.lines.reduce((s, l) => s + toBase(l.debitAmount, l.exchangeRate), 0);
        const baseCredit = parsed.lines.reduce((s, l) => s + toBase(l.creditAmount, l.exchangeRate), 0);
        // Allow up to one cent of per-line rounding slack.
        if (Math.abs(baseDebit - baseCredit) > parsed.lines.length) {
          return NextResponse.json(
            { error: "In your base currency, total debits must equal total credits." },
            { status: 400 }
          );
        }
      }
    }
    
    if (totalDebit === 0) {
      return NextResponse.json(
        { error: "Entry must have non-zero amounts" },
        { status: 400 }
      );
    }

    // An auto-reversal must fall on or after the original entry's date.
    if (parsed.autoReverseDate && parsed.autoReverseDate < parsed.date) {
      return NextResponse.json(
        { error: "Auto-reverse date must be on or after the entry date" },
        { status: 400 }
      );
    }

    // Auto-resolve fiscalYearId if omitted
    let activeFiscalYearId = parsed.fiscalYearId || null;
    if (!activeFiscalYearId) {
      const [activeFy] = await db
        .select({ id: fiscalYear.id })
        .from(fiscalYear)
        .where(and(eq(fiscalYear.organizationId, ctx.organizationId), eq(fiscalYear.isClosed, false)))
        .limit(1);

      if (activeFy) {
        activeFiscalYearId = activeFy.id;
      } else {
        const [anyFy] = await db
          .select({ id: fiscalYear.id })
          .from(fiscalYear)
          .where(eq(fiscalYear.organizationId, ctx.organizationId))
          .limit(1);

        if (anyFy) {
          activeFiscalYearId = anyFy.id;
        } else {
          const currentYear = new Date().getFullYear();
          const [newFy] = await db
            .insert(fiscalYear)
            .values({
              organizationId: ctx.organizationId,
              name: `FY ${currentYear}-${currentYear + 1}`,
              startDate: `${currentYear}-04-01`,
              endDate: `${currentYear + 1}-03-31`,
              isClosed: false,
            })
            .returning();
          activeFiscalYearId = newFy.id;
        }
      }
    }

    const { entry } = await db.transaction(async (tx) => {
      // 1. Get voucher settings for prefix & padding
      const [setting] = await tx
        .select()
        .from(voucherSetting)
        .where(
          and(
            eq(voucherSetting.organizationId, ctx.organizationId),
            eq(voucherSetting.voucherType, parsed.voucherType)
          )
        );

      const prefix = setting?.prefix || `${parsed.voucherType.substring(0, 2)}-`;
      const padding = setting?.paddingLength || 6;

      // 2. Lock and increment sequence
      const sequenceResult = await tx.execute(
        sql`SELECT id, next_number FROM voucher_sequence WHERE organization_id = ${ctx.organizationId} AND fiscal_year_id = ${activeFiscalYearId} AND voucher_type = ${parsed.voucherType} FOR UPDATE`
      );

      const rows = Array.isArray(sequenceResult) ? sequenceResult : (sequenceResult as { rows?: unknown[] }).rows ?? [];
      const existing = rows[0] as { id: string; next_number: number } | undefined;

      let seqNumber = 1;

      if (existing) {
        seqNumber = existing.next_number;
        await tx
          .update(voucherSequence)
          .set({ nextNumber: seqNumber + 1 })
          .where(eq(voucherSequence.id, existing.id));
      } else {
        await tx.insert(voucherSequence).values({
          organizationId: ctx.organizationId,
          fiscalYearId: activeFiscalYearId,
          voucherType: parsed.voucherType,
          nextNumber: 2,
        });
      }

      const voucherNumber = `${prefix}${seqNumber.toString().padStart(padding, "0")}`;

      // Calculate old entryNumber for backwards compatibility
      const [maxResult] = await tx
        .select({ max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)` })
        .from(journalEntry)
        .where(eq(journalEntry.organizationId, ctx.organizationId));
      const entryNumber = (maxResult?.max || 0) + 1;

      // 3. Create entry
      const [insertedEntry] = await tx
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber,
          date: parsed.date,
          description: parsed.description,
          reference: parsed.reference || null,
          fiscalYearId: activeFiscalYearId,
          voucherType: parsed.voucherType,
          subType: parsed.subType || null,
          status: parsed.status,
          sourceModule: parsed.sourceModule,
          voucherPrefix: prefix,
          voucherSequence: seqNumber,
          voucherNumber,
          postingDate: parsed.status === "posted" ? parsed.date : null,
          postedBy: parsed.status === "posted" ? ctx.userId : null,
          postedAt: parsed.status === "posted" ? new Date() : null,
          autoReverseDate: parsed.autoReverseDate || null,
          createdBy: ctx.userId,
        })
        .returning();

      // 4. Insert lines
      const cleanString = (val?: string | null) => (val && val.trim() !== "" ? val.trim() : null);

      await tx.insert(journalLine).values(
        parsed.lines.map((l) => ({
          journalEntryId: insertedEntry.id,
          accountId: l.accountId,
          description: cleanString(l.description),
          debitAmount: l.debitAmount,
          creditAmount: l.creditAmount,
          currencyCode: l.currencyCode,
          exchangeRate: l.exchangeRate,
          contactId: cleanString(l.contactId),
          costCenterId: cleanString(l.costCenterId),
          projectId: cleanString(l.projectId),
          instrumentType: cleanString(l.instrumentType),
          instrumentNo: cleanString(l.instrumentNo),
          instrumentDate: cleanString(l.instrumentDate),
          // Bill-wise Details
          adjustmentType: l.adjustmentType || null,
          referenceName: cleanString(l.referenceName),
          referenceType: l.referenceType || null,
          referenceId: cleanString(l.referenceId),
        }))
      );

      // 5. Automatically update live bank balances for any line affecting a Bank/Cash account
      if (parsed.status === "posted") {
        const transferGroupId = parsed.voucherType === "CONTRA" ? randomUUID() : undefined;
        const insertedBankTxs = [];

        for (const l of parsed.lines) {
          const netChange = l.debitAmount - l.creditAmount;
          if (netChange !== 0) {
            const linkedBank = await tx.query.bankAccount.findFirst({
              where: and(
                eq(bankAccount.organizationId, ctx.organizationId),
                or(eq(bankAccount.chartAccountId, l.accountId), eq(bankAccount.id, l.accountId))
              ),
            });

            if (linkedBank) {
              await tx
                .update(bankAccount)
                .set({ balance: sql`${bankAccount.balance} + ${netChange}` })
                .where(eq(bankAccount.id, linkedBank.id));

              // If it's a CONTRA voucher, insert a reconciled bankTransaction so it appears in the bank dashboard
              if (parsed.voucherType === "CONTRA") {
                const [bt] = await tx.insert(bankTransaction).values({
                  bankAccountId: linkedBank.id,
                  date: parsed.date,
                  description: parsed.description,
                  reference: parsed.reference || null,
                  amount: netChange,
                  currencyCode: linkedBank.currencyCode,
                  status: "reconciled",
                  sourceType: "contra",
                  journalEntryId: insertedEntry.id,
                  transferGroupId,
                }).returning();
                insertedBankTxs.push(bt);
              }
            }
          }
        }

        // Pair the two sides of a CONTRA transfer
        if (parsed.voucherType === "CONTRA" && insertedBankTxs.length === 2) {
          await tx.update(bankTransaction)
            .set({ transferTransactionId: insertedBankTxs[1].id })
            .where(eq(bankTransaction.id, insertedBankTxs[0].id));
          await tx.update(bankTransaction)
            .set({ transferTransactionId: insertedBankTxs[0].id })
            .where(eq(bankTransaction.id, insertedBankTxs[1].id));
        }
      }

      return { entry: insertedEntry };
    });

    logAudit({ ctx, action: "create", entityType: "journal_entry", entityId: entry.id, request });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
