import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry, journalLine, voucherSetting, voucherSequence } from "@/lib/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
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
  instrumentType: z.string().nullable().optional(),
  instrumentNo: z.string().nullable().optional(),
  instrumentDate: z.string().nullable().optional(),
});

const createSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  reference: z.string().nullable().optional(),
  fiscalYearId: z.string().min(1), // Required for proper sequence isolation
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

    const entries = await db.query.journalEntry.findMany({
      where: eq(journalEntry.organizationId, ctx.organizationId),
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
        sql`SELECT id, next_number FROM voucher_sequence WHERE organization_id = ${ctx.organizationId} AND fiscal_year_id = ${parsed.fiscalYearId} AND voucher_type = ${parsed.voucherType} FOR UPDATE`
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
          fiscalYearId: parsed.fiscalYearId,
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
          fiscalYearId: parsed.fiscalYearId,
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
      await tx.insert(journalLine).values(
        parsed.lines.map((l) => ({
          journalEntryId: insertedEntry.id,
          accountId: l.accountId,
          description: l.description || null,
          debitAmount: l.debitAmount,
          creditAmount: l.creditAmount,
          currencyCode: l.currencyCode,
          exchangeRate: l.exchangeRate,
          contactId: l.contactId || null,
          instrumentType: l.instrumentType || null,
          instrumentNo: l.instrumentNo || null,
          instrumentDate: l.instrumentDate || null,
        }))
      );

      return { entry: insertedEntry };
    });

    logAudit({ ctx, action: "create", entityType: "journal_entry", entityId: entry.id, request });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
