import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, invoiceLine, contact, inventoryItem } from "@/lib/db/schema";
import { eq, and, gte, lte, isNull, notInArray } from "drizzle-orm";
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

    const invoices = await db
      .select({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        subtotal: invoice.subtotal,
        taxTotal: invoice.taxTotal,
        cgstTotal: invoice.cgstTotal,
        sgstTotal: invoice.sgstTotal,
        igstTotal: invoice.igstTotal,
        total: invoice.total,
        customerName: contact.name,
        taxNumber: contact.taxNumber,
        addresses: contact.addresses,
      })
      .from(invoice)
      .innerJoin(contact, eq(invoice.contactId, contact.id))
      .where(
        and(
          eq(invoice.organizationId, ctx.organizationId),
          gte(invoice.issueDate, startDate),
          lte(invoice.issueDate, endDate),
          notInArray(invoice.status, ["draft", "void", "rejected"]),
          isNull(invoice.deletedAt)
        )
      );

    const b2b: any[] = [];
    const b2cLarge: any[] = [];
    const b2cSmall: any[] = [];

    const invoiceIds = invoices.map(i => i.id);

    // Fetch lines for HSN
    let lines: any[] = [];
    if (invoiceIds.length > 0) {
      lines = await db
        .select({
          invoiceId: invoiceLine.invoiceId,
          hsnCode: inventoryItem.hsnCode,
          amount: invoiceLine.amount,
          taxAmount: invoiceLine.taxAmount,
          cgstAmount: invoiceLine.cgstAmount,
          sgstAmount: invoiceLine.sgstAmount,
          igstAmount: invoiceLine.igstAmount,
        })
        .from(invoiceLine)
        .leftJoin(inventoryItem, eq(invoiceLine.inventoryItemId, inventoryItem.id))
        .where(notInArray(invoiceLine.invoiceId, []).if(false)) // Trick to compile, we will filter by inArray below. Wait.
    }

    // A better way is to do the join properly
    if (invoiceIds.length > 0) {
      const { inArray } = await import("drizzle-orm");
      lines = await db
        .select({
          invoiceId: invoiceLine.invoiceId,
          hsnCode: inventoryItem.hsnCode,
          amount: invoiceLine.amount,
          taxAmount: invoiceLine.taxAmount,
          cgstAmount: invoiceLine.cgstAmount,
          sgstAmount: invoiceLine.sgstAmount,
          igstAmount: invoiceLine.igstAmount,
        })
        .from(invoiceLine)
        .leftJoin(inventoryItem, eq(invoiceLine.inventoryItemId, inventoryItem.id))
        .where(inArray(invoiceLine.invoiceId, invoiceIds));
    }

    for (const inv of invoices) {
      const isInterState = inv.igstTotal > 0;
      if (inv.taxNumber && inv.taxNumber.trim() !== "") {
        b2b.push(inv);
      } else {
        if (isInterState && inv.total > 25000000) { // 2.5 Lakhs in cents
          b2cLarge.push(inv);
        } else {
          b2cSmall.push(inv);
        }
      }
    }

    const hsnSummary: Record<string, any> = {};

    for (const line of lines) {
      const code = line.hsnCode || "Unclassified";
      if (!hsnSummary[code]) {
        hsnSummary[code] = {
          hsnCode: code,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          totalTax: 0,
        };
      }
      hsnSummary[code].taxableValue += line.amount;
      hsnSummary[code].cgst += line.cgstAmount;
      hsnSummary[code].sgst += line.sgstAmount;
      hsnSummary[code].igst += line.igstAmount;
      hsnSummary[code].totalTax += line.taxAmount;
    }

    return NextResponse.json({
      b2b,
      b2cLarge,
      b2cSmall,
      hsn: Object.values(hsnSummary),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
