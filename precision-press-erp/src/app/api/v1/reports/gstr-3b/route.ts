import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, bill } from "@/lib/db/schema";
import { eq, and, gte, lte, isNull, notInArray, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate") || "";
    const endDate = url.searchParams.get("endDate") || "";

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
    }

    // 3.1 Outward supplies (Sales)
    const outwardSupplies = await db
      .select({
        taxableValue: sql<number>`COALESCE(SUM(${invoice.subtotal}), 0)`.mapWith(Number),
        cgst: sql<number>`COALESCE(SUM(${invoice.cgstTotal}), 0)`.mapWith(Number),
        sgst: sql<number>`COALESCE(SUM(${invoice.sgstTotal}), 0)`.mapWith(Number),
        igst: sql<number>`COALESCE(SUM(${invoice.igstTotal}), 0)`.mapWith(Number),
      })
      .from(invoice)
      .where(
        and(
          eq(invoice.organizationId, ctx.organizationId),
          gte(invoice.issueDate, startDate),
          lte(invoice.issueDate, endDate),
          notInArray(invoice.status, ["draft", "void", "rejected"]),
          isNull(invoice.deletedAt)
        )
      );

    // 4. Eligible ITC (Purchases/Bills)
    const inwardSupplies = await db
      .select({
        taxableValue: sql<number>`COALESCE(SUM(${bill.subtotal}), 0)`.mapWith(Number),
        cgst: sql<number>`COALESCE(SUM(${bill.cgstTotal}), 0)`.mapWith(Number),
        sgst: sql<number>`COALESCE(SUM(${bill.sgstTotal}), 0)`.mapWith(Number),
        igst: sql<number>`COALESCE(SUM(${bill.igstTotal}), 0)`.mapWith(Number),
      })
      .from(bill)
      .where(
        and(
          eq(bill.organizationId, ctx.organizationId),
          gte(bill.issueDate, startDate),
          lte(bill.issueDate, endDate),
          notInArray(bill.status, ["draft", "void", "pending_approval"]),
          isNull(bill.deletedAt)
        )
      );

    return NextResponse.json({
      outward: outwardSupplies[0],
      inward: inwardSupplies[0],
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
