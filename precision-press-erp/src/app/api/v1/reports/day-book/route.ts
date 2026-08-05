import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { 
  journalEntry, bankTransaction, invoice, payment, bill, 
  expenseClaim, creditNote, debitNote, customerCredit
} from "@/lib/db/schema";
import { eq, and, gte, lte, isNull, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const dateStr = url.searchParams.get("date") || new Date().toISOString().split("T")[0];

    const startOfDay = new Date(dateStr + "T00:00:00.000Z");
    const dateOnlyStr = startOfDay.toISOString().split("T")[0];

    // ── 1. Opening Cash & Bank Balance Query ────────────────────────────────
    let openingBalance = 0;
    try {
      const [openingRow] = await db
        .select({
          total: sql<number>`coalesce(sum(${bankTransaction.amount}), 0)`.mapWith(Number),
        })
        .from(bankTransaction)
        .where(
          lte(bankTransaction.date, new Date(startOfDay.getTime() - 86400000).toISOString().split("T")[0])
        );
      openingBalance = (openingRow?.total || 0) / 100;
    } catch {
      openingBalance = 0;
    }

    // ── 2. Query All Journal Entries for Selected Date ─────────────────────
    const journalEntries = await db.query.journalEntry.findMany({
      where: and(
        eq(journalEntry.organizationId, ctx.organizationId),
        gte(journalEntry.date, dateOnlyStr),
        lte(journalEntry.date, dateOnlyStr)
      ),
      with: {
        lines: {
          with: {
            account: true,
          },
        },
      },
      orderBy: (j, { desc }) => [desc(j.entryNumber)],
    });

    // ── 3. Normalize Journal Entries into Day Book Records ──────────────────
    const records: any[] = [];

    for (const ent of journalEntries) {
      const isVoid = ent.status === "void";

      let totalDebit = 0;
      let totalCredit = 0;

      const items = (ent.lines || []).map((l: any) => {
        const dAmt = (l.debitAmount || 0) / 100;
        const cAmt = (l.creditAmount || 0) / 100;
        totalDebit += dAmt;
        totalCredit += cAmt;

        return {
          accountId: l.accountId,
          accountCode: l.account?.code || "",
          accountName: l.account?.name || "Account",
          description: l.description || l.account?.name || "",
          debit: dAmt,
          credit: cAmt,
        };
      });

      // Tally Standard Voucher Type Classification
      let voucherType = "Journal";
      let link = `/accounting`;

      const descLower = (ent.description || "").toLowerCase();
      const ref = ent.reference || "";

      // Check if it's a Customer Payment / Receipt (Inflow from Customer / Deposit)
      if (
        descLower.includes("payment for pay") ||
        descLower.includes("sales receipt") ||
        descLower.includes("auto-apply customer credit") ||
        descLower.includes("prepayment") ||
        ref === "prepayment" ||
        ent.sourceType === "payment"
      ) {
        voucherType = "Receipt";
        if (ent.sourceId) link = `/sales/payments/${ent.sourceId}`;
      } 
      // Check if it's a Sales Invoice
      else if (descLower.startsWith("invoice inv") || (descLower.includes("invoice") && !descLower.includes("auto-apply")) || ent.sourceType === "invoice") {
        voucherType = "Sales Invoice";
        if (ent.sourceId) link = `/sales/${ent.sourceId}`;
      } 
      // Check if it's a Supplier Payment / Expense (Outflow to Vendor)
      else if (descLower.includes("expense") || ent.sourceType === "expense") {
        voucherType = "Payment"; // Tally calls vendor payouts "Payment"
        if (ent.sourceId) link = `/purchases/expenses/${ent.sourceId}`;
      } 
      // Check if it's a Purchase Bill
      else if (descLower.includes("bill") || ent.sourceType === "bill") {
        voucherType = "Purchase";
        if (ent.sourceId) link = `/purchases/${ent.sourceId}`;
      } 
      // Check Returns & Credits
      else if (descLower.includes("credit note") || ent.sourceType === "credit_note") {
        voucherType = "Credit Note";
        if (ent.sourceId) link = `/sales/credit-notes/${ent.sourceId}`;
      } else if (descLower.includes("debit note") || ent.sourceType === "debit_note") {
        voucherType = "Debit Note";
        if (ent.sourceId) link = `/purchases/debit-notes/${ent.sourceId}`;
      } 
      // Check Cost of Sales / Inventory Stock Journals
      else if (descLower.includes("cost of sales") || descLower.includes("opening stock") || descLower.includes("inventory adjustment")) {
        voucherType = "Stock Journal";
      }

      records.push({
        id: ent.id,
        entryNumber: ent.entryNumber,
        timestamp: new Date(ent.createdAt).getTime(),
        date: ent.date,
        voucherType,
        voucherNo: `#${ent.entryNumber}${ref ? ` (${ref})` : ''}`,
        partyName: ent.description || "Journal Entry",
        debitAmount: isVoid ? 0 : totalDebit,
        creditAmount: isVoid ? 0 : totalCredit,
        status: ent.status || "posted",
        isVoid,
        notes: ent.reference ? `Ref: ${ent.reference}` : null,
        taxDetails: { cgst: 0, sgst: 0, igst: 0 },
        items,
        link,
      });
    }

    // Sort descending by entry number
    records.sort((a, b) => b.entryNumber - a.entryNumber);

    // Calculate Net Daily Totals (excluding voided)
    const activeRecords = records.filter(r => !r.isVoid);
    const totalDebits = activeRecords.reduce((sum, r) => sum + r.debitAmount, 0);
    const totalCredits = activeRecords.reduce((sum, r) => sum + r.creditAmount, 0);
    const closingBalance = openingBalance + totalDebits - totalCredits;

    return NextResponse.json({
      date: dateOnlyStr,
      openingBalance,
      closingBalance,
      summary: {
        totalDebits,
        totalCredits,
        netFlow: totalDebits - totalCredits,
        totalVouchers: records.length,
      },
      records,
    });
  } catch (err) {
    return handleError(err);
  }
}
