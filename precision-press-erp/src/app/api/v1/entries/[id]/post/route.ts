import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { journalEntry, bankAccount, bankTransaction } from "@/lib/db/schema";
import { eq, and, sql, or } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { assertNotLocked } from "@/lib/api/period-lock";
import { centsToDecimal } from "@/lib/money";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "post:entries");

    const entry = await db.query.journalEntry.findFirst({
      where: and(
        eq(journalEntry.id, id),
        eq(journalEntry.organizationId, ctx.organizationId)
      ),
    });

    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (entry.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft entries can be posted" },
        { status: 400 }
      );
    }
    // The lock is only checked at create time, but the normal flow is
    // draft-now / finalize-later — so posting must re-check, or a draft can be
    // finalized straight into a period that has since been locked or closed.
    await assertNotLocked(ctx.organizationId, entry.date, ctx);

    await db.transaction(async (tx) => {
      await tx
        .update(journalEntry)
        .set({
          status: "posted",
          postedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(journalEntry.id, id));

      const full = await tx.query.journalEntry.findFirst({
        where: eq(journalEntry.id, id),
        with: {
          lines: {
            with: { account: true },
          },
        },
      });

      if (full) {
        const transferGroupId = full.voucherType === "CONTRA" ? randomUUID() : undefined;
        const insertedBankTxs = [];

        for (const l of full.lines) {
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

              if (full.voucherType === "CONTRA") {
                const [bt] = await tx.insert(bankTransaction).values({
                  bankAccountId: linkedBank.id,
                  date: full.date,
                  description: full.description,
                  reference: full.reference || null,
                  amount: netChange,
                  currencyCode: linkedBank.currencyCode,
                  status: "reconciled",
                  sourceType: "contra",
                  journalEntryId: full.id,
                  transferGroupId,
                }).returning();
                insertedBankTxs.push(bt);
              }
            }
          }
        }

        if (full.voucherType === "CONTRA" && insertedBankTxs.length === 2) {
          await tx.update(bankTransaction)
            .set({ transferTransactionId: insertedBankTxs[1].id })
            .where(eq(bankTransaction.id, insertedBankTxs[0].id));
          await tx.update(bankTransaction)
            .set({ transferTransactionId: insertedBankTxs[0].id })
            .where(eq(bankTransaction.id, insertedBankTxs[1].id));
        }
      }
    });

    const full = await db.query.journalEntry.findFirst({
      where: eq(journalEntry.id, id),
      with: {
        lines: {
          with: { account: true },
        },
      },
    });

    logAudit({ ctx, action: "post", entityType: "journal_entry", entityId: id, changes: { previousStatus: entry.status }, request });

    return NextResponse.json({
      entry: {
        ...full,
        lines: full?.lines.map((l) => ({
          id: l.id,
          accountId: l.accountId,
          accountCode: l.account?.code || "",
          accountName: l.account?.name || "",
          description: l.description,
          debitAmount: centsToDecimal(l.debitAmount),
          creditAmount: centsToDecimal(l.creditAmount),
        })),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
