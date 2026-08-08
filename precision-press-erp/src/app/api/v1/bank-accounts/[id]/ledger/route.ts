// @ts-nocheck
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankAccount, journalEntry, journalLine, chartAccount } from "@/lib/db/schema";
import { eq, and, gte, lt, lte, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);

    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    // 1. Find the bank account and its linked chart account
    const account = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, id),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
      with: { chartAccount: true },
    });

    if (!account) return notFound("Bank account");
    if (!account.chartAccountId) {
      return NextResponse.json({
        accountName: account.accountName,
        accountType: account.accountType,
        currencyCode: account.currencyCode,
        openingBalance: 0,
        lines: [],
        totalDebit: 0,
        totalCredit: 0,
        closingBalance: 0,
      });
    }

    const accountId = account.chartAccountId;

    // 2. Opening balance = sum of all journal lines for this account BEFORE the from date
    let openingBalance = 0;
    if (from) {
      const priorLines = await db
        .select({
          debit: journalLine.debitAmount,
          credit: journalLine.creditAmount,
        })
        .from(journalLine)
        .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
        .where(
          and(
            eq(journalLine.accountId, accountId),
            eq(journalEntry.organizationId, ctx.organizationId),
            lt(journalEntry.date, new Date(from))
          )
        );

      for (const row of priorLines) {
        openingBalance += (row.debit ?? 0) - (row.credit ?? 0);
      }
    }

    // 3. Fetch journal lines within date range
    const conditions = [
      eq(journalLine.accountId, accountId),
      eq(journalEntry.organizationId, ctx.organizationId),
    ];

    if (from) conditions.push(gte(journalEntry.date, new Date(from)));
    if (to) conditions.push(lte(journalEntry.date, new Date(to + "T23:59:59")));

    const rows = await db
      .select({
        date: journalEntry.date,
        description: journalEntry.description,
        reference: journalEntry.reference,
        entryNumber: journalEntry.entryNumber,
        sourceType: journalEntry.sourceType,
        sourceModule: journalEntry.sourceModule,
        voucherType: journalEntry.voucherType,
        debit: journalLine.debitAmount,
        credit: journalLine.creditAmount,
        journalEntryId: journalEntry.id,
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .where(and(...conditions))
      .orderBy(asc(journalEntry.date), asc(journalEntry.entryNumber));

    // 4. Build running balance
    let runningBalance = openingBalance;
    let totalDebit = 0;
    let totalCredit = 0;

    const lines = rows.map((row) => {
      const debit = row.debit ?? 0;
      const credit = row.credit ?? 0;
      runningBalance += debit - credit;
      totalDebit += debit;
      totalCredit += credit;

      // Standard Tally Voucher Type Classification
      const vType = (row.voucherType || "").toUpperCase();
      const sModule = (row.sourceModule || "").toUpperCase();
      const sType = (row.sourceType || "").toLowerCase();
      const descLower = ((row.description || "") + " " + (row.reference || "")).toLowerCase();

      let vchType = "Journal";

      if (vType === "RECEIPT" || sModule === "RECEIPT" || sType === "receipt" || descLower.includes("receipt")) {
        vchType = "Receipt";
      } else if (vType === "PAYMENT" || sModule === "PAYMENT" || sType === "payment" || (descLower.includes("payment") && !descLower.includes("contra"))) {
        vchType = "Payment";
      } else if (vType === "CONTRA" || sModule === "CONTRA" || sType === "contra" || descLower.includes("contra")) {
        vchType = "Contra";
      } else if (vType === "SALES" || sModule === "SALES" || sType === "invoice" || descLower.startsWith("invoice inv")) {
        vchType = "Sales Invoice";
      } else if (vType === "PURCHASE" || sModule === "PURCHASE" || sType === "bill" || descLower.includes("bill")) {
        vchType = "Purchase";
      } else if (descLower.includes("credit note") || sType === "credit_note") {
        vchType = "Credit Note";
      } else if (descLower.includes("debit note") || sType === "debit_note") {
        vchType = "Debit Note";
      } else if (descLower.includes("cost of sales") || descLower.includes("opening stock") || descLower.includes("inventory adjustment")) {
        vchType = "Stock Journal";
      } else {
        vchType = "Journal";
      }

      return {
        date: row.date,
        particulars: row.description || row.reference || "-",
        vchType,
        vchNo: row.reference || row.entryNumber || "-",
        debit,
        credit,
        balance: runningBalance,
      };
    });

    return NextResponse.json({
      accountName: account.accountName,
      accountType: account.accountType,
      currencyCode: account.currencyCode || "INR",
      openingBalance,
      lines,
      totalDebit,
      totalCredit,
      closingBalance: runningBalance,
    });
  } catch (err) {
    return handleError(err);
  }
}
