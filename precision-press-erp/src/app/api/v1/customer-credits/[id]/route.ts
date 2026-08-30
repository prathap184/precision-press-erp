import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customerCredit, paymentAllocation, invoice } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
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

    const found = await db.query.customerCredit.findFirst({
      where: and(
        eq(customerCredit.id, id),
        eq(customerCredit.organizationId, ctx.organizationId),
        notDeleted(customerCredit.deletedAt)
      ),
      with: { contact: true, journalEntry: true },
    });

    if (!found) return notFound("Customer credit");

    // Fetch all allocations where this prepayment was used
    const prepaymentAllocations = await db.query.paymentAllocation.findMany({
      where: and(
        eq(paymentAllocation.documentType, "prepayment"),
        eq(paymentAllocation.documentId, id)
      ),
      with: { payment: true },
    });

    const paymentIds = prepaymentAllocations.map((a) => a.paymentId);

    // Find the paired invoice allocations for these payments
    const invoiceAllocations = paymentIds.length > 0
      ? await db.query.paymentAllocation.findMany({
          where: and(
            eq(paymentAllocation.documentType, "invoice"),
            inArray(paymentAllocation.paymentId, paymentIds)
          ),
        })
      : [];

    const invoiceIds = invoiceAllocations.map((a) => a.documentId);
    const invoiceRecords = invoiceIds.length > 0
      ? await db.query.invoice.findMany({
          where: inArray(invoice.id, invoiceIds),
          columns: { id: true, invoiceNumber: true, issueDate: true, total: true, status: true },
        })
      : [];

    const invoiceMap = new Map(invoiceRecords.map((inv) => [inv.id, inv]));

    const timeline = prepaymentAllocations.map((alloc) => {
      const invAlloc = invoiceAllocations.find((ia) => ia.paymentId === alloc.paymentId);
      const inv = invAlloc ? invoiceMap.get(invAlloc.documentId) : null;
      return {
        id: alloc.id,
        paymentId: alloc.paymentId,
        paymentNumber: alloc.payment?.paymentNumber,
        date: alloc.payment?.date || found.date,
        amountApplied: alloc.amount,
        invoiceId: inv?.id || null,
        invoiceNumber: inv?.invoiceNumber || alloc.payment?.reference || "Invoice",
        invoiceTotal: inv?.total || null,
        notes: alloc.payment?.notes || null,
      };
    });

    return NextResponse.json({ customerCredit: found, timeline });
  } catch (err) {
    return handleError(err);
  }
}
