import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contact, invoice, bill, customerCredit } from "@/lib/db/schema";
import { eq, and, or, ilike, desc, asc, gte, lte, inArray, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { checkResourceLimit, checkMultiCurrency } from "@/lib/api/check-limit";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  taxNumber: z.string().nullable().optional(),
  type: z.enum(["customer", "supplier", "both"]).default("customer"),
  paymentTermsDays: z.number().int().min(0).default(30),
  addresses: z.any().optional(),
  notes: z.string().nullable().optional(),
  currencyCode: currencyCodeSchema.default("INR"),
  openingBalance: z.union([z.number(), z.string()]).optional().transform((v) => (v !== undefined && v !== null ? String(v) : undefined)),
  openingBalanceType: z.enum(["Dr", "Cr"]).optional().default("Dr"),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const search = url.searchParams.get("search");
    const type = url.searchParams.get("type");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const sortBy = url.searchParams.get("sortBy") || "created";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SORT_COLUMNS: Record<string, any> = {
      name: contact.name,
      type: contact.type,
      terms: contact.paymentTermsDays,
      creditLimit: contact.creditLimit,
      created: contact.createdAt,
    };

    const conditions = [
      eq(contact.organizationId, ctx.organizationId),
      notDeleted(contact.deletedAt),
    ];

    if (search) {
      conditions.push(
        or(
          ilike(contact.name, `%${search}%`),
          ilike(contact.email, `%${search}%`),
          ilike(contact.phone, `%${search}%`),
          ilike(contact.taxNumber, `%${search}%`)
        )!
      );
    }
    if (type && ["customer", "supplier", "both"].includes(type)) {
      if (type === "customer") {
        conditions.push(inArray(contact.type, ["customer", "both"]));
      } else if (type === "supplier") {
        conditions.push(inArray(contact.type, ["supplier", "both"]));
      } else {
        conditions.push(eq(contact.type, "both"));
      }
    }
    if (from) conditions.push(gte(contact.createdAt, new Date(from)));
    if (to) conditions.push(lte(contact.createdAt, new Date(to + "T23:59:59")));

    const sortCol = SORT_COLUMNS[sortBy] || contact.createdAt;
    const orderFn = sortOrder === "asc" ? asc : desc;

    const contacts = await db.query.contact.findMany({
      where: and(...conditions),
      orderBy: orderFn(sortCol),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(contact)
      .where(and(...conditions));

    // Outstanding balance + overdue per contact (for the current page only, org-scoped).
    // Customer balance = unpaid invoices ("Owes you"); supplier balance = unpaid bills ("You owe").
    const contactIds = contacts.map((c) => c.id);
    const owedByCustomer = new Map<string, { outstanding: number; overdue: number }>();
    const owedToSupplier = new Map<string, { outstanding: number; overdue: number }>();

    if (contactIds.length > 0) {
      // Invoices the org has issued -> what customers owe the org.
      const invoiceRows = await db
        .select({
          contactId: invoice.contactId,
          outstanding: sql<number>`coalesce(sum(${invoice.amountDue}), 0)::int`,
          overdue: sql<number>`coalesce(sum(case when ${invoice.dueDate} < current_date then ${invoice.amountDue} else 0 end), 0)::int`,
        })
        .from(invoice)
        .where(
          and(
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt),
            inArray(invoice.contactId, contactIds),
            inArray(invoice.status, ["sent", "partial", "overdue"]),
          )
        )
        .groupBy(invoice.contactId);
      // Customer credits (advance payments / unapplied credits) -> reduces what customers owe
      const creditRows = await db
        .select({
          contactId: customerCredit.contactId,
          creditRemaining: sql<number>`coalesce(sum(${customerCredit.amountRemaining}), 0)::int`,
        })
        .from(customerCredit)
        .where(
          and(
            eq(customerCredit.organizationId, ctx.organizationId),
            inArray(customerCredit.contactId, contactIds),
            eq(customerCredit.status, "open"),
          )
        )
        .groupBy(customerCredit.contactId);

      const creditByCustomer = new Map<string, number>();
      for (const row of creditRows) {
        creditByCustomer.set(row.contactId, row.creditRemaining);
      }

      for (const row of invoiceRows) {
        const credit = creditByCustomer.get(row.contactId) || 0;
        owedByCustomer.set(row.contactId, { outstanding: row.outstanding - credit, overdue: row.overdue });
        creditByCustomer.delete(row.contactId);
      }

      for (const [contactId, credit] of creditByCustomer.entries()) {
        owedByCustomer.set(contactId, { outstanding: -credit, overdue: 0 });
      }

      // Bills the org has received -> what the org owes suppliers.
      const billRows = await db
        .select({
          contactId: bill.contactId,
          outstanding: sql<number>`coalesce(sum(${bill.amountDue}), 0)::int`,
          overdue: sql<number>`coalesce(sum(case when ${bill.dueDate} < current_date then ${bill.amountDue} else 0 end), 0)::int`,
        })
        .from(bill)
        .where(
          and(
            eq(bill.organizationId, ctx.organizationId),
            notDeleted(bill.deletedAt),
            inArray(bill.contactId, contactIds),
            inArray(bill.status, ["received", "partial", "overdue"]),
          )
        )
        .groupBy(bill.contactId);
      for (const row of billRows) {
        owedToSupplier.set(row.contactId, { outstanding: row.outstanding, overdue: row.overdue });
      }
    }

    const contactsWithBalance = contacts.map((c) => {
      const customer = owedByCustomer.get(c.id) || { outstanding: 0, overdue: 0 };
      const supplier = owedToSupplier.get(c.id) || { outstanding: 0, overdue: 0 };
      
      const opBalRaw = Number(c.openingBalance || 0);
      const opBalCents = Math.round(opBalRaw * 100);
      const isCust = c.type === "customer" || c.type === "both";
      const isSupp = c.type === "supplier" || c.type === "both";

      let owesYou = customer.outstanding;
      let youOwe = supplier.outstanding;

      if (isCust) {
        const signedCustOpBal = c.openingBalanceType === "Cr" ? -opBalCents : opBalCents;
        owesYou += signedCustOpBal;
      }
      if (isSupp && c.type === "supplier") {
        const signedSuppOpBal = c.openingBalanceType === "Dr" ? -opBalCents : opBalCents;
        youOwe += signedSuppOpBal;
      }

      // If customer has a net credit (negative outstanding), it means we owe them
      if (owesYou < 0) {
        youOwe += Math.abs(owesYou);
        owesYou = 0;
      }
      
      // If supplier has a net debit (negative outstanding), it means they owe us
      if (youOwe < 0) {
        owesYou += Math.abs(youOwe);
        youOwe = 0;
      }

      return {
        ...c,
        owesYou, // customer net outstanding (cents)
        youOwe, // supplier net outstanding (cents)
        overdue: customer.overdue + supplier.overdue, // total overdue across both (cents)
      };
    });

    return NextResponse.json(
      paginatedResponse(contactsWithBalance, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contacts");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await checkResourceLimit(ctx.organizationId, contact, contact.organizationId, "contacts", contact.deletedAt);
    await checkMultiCurrency(ctx.organizationId, parsed.currencyCode);

    const [created] = await db
      .insert(contact)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    logAudit({ ctx, action: "create", entityType: "contact", entityId: created.id, request });

    return NextResponse.json({ contact: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
