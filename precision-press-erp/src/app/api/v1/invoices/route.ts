import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, invoiceLine, contact, organization, customerCredit, inventoryItem, member, payment, paymentAllocation } from "@/lib/db/schema";
import { eq, and, desc, asc, gte, lte, ne, inArray, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { getNextNumber } from "@/lib/api/numbering";
import { decimalToMinorUnits } from "@/lib/money";
import { assertNotLocked } from "@/lib/api/period-lock";
import { logAudit } from "@/lib/api/audit";
import { checkMonthlyLimit, checkMultiCurrency } from "@/lib/api/check-limit";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { resolveDocumentCurrency } from "@/lib/currency/resolve-currency";
import { resolvePrice } from "@/lib/api/pricing";
import {
  checkApprovalRequired,
  createApprovalRequest,
} from "@/lib/approvals/engine";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().default(1),
  // Decimal unit price (e.g. 12.50). When omitted for an inventory-item line,
  // the price is resolved from the line/document price list (falling back to the
  // item's default sale price). An explicit value here always wins.
  unitPrice: z.number().optional(),
  accountId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
  discountPercent: z.number().int().min(0).max(10000).default(0),
  projectId: z.string().nullable().optional(),
  costCenterId: z.string().nullable().optional(),
  // New proxy order fields
  billingMode: z.enum(['A', 'B']).nullable().optional(),
  pcsNo: z.number().nullable().optional(),
  width: z.number().nullable().optional(),
  length: z.number().nullable().optional(),
  sqFt: z.number().nullable().optional(),
  finishAmount: z.number().nullable().optional(),
  deliveryMode: z.string().nullable().optional(),
  deliveryAmount: z.number().nullable().optional(),
  // When set, sending this invoice relieves inventory and posts COGS for the item.
  inventoryItemId: z.string().nullable().optional(),
  warehouseId: z.string().nullable().optional(),
  // Per-line price list override; falls back to the document-level priceListId.
  priceListId: z.string().nullable().optional(),
});

const createSchema = z.object({
  contactId: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  currencyCode: currencyCodeSchema.optional(),
  // Default price list applied to inventory-item lines that don't carry their own.
  priceListId: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1),
  // When true, exceeding the customer's credit limit hard-blocks the create
  // (HTTP 403) instead of returning a soft warning. Wired from an org policy.
  enforceCreditLimit: z.boolean().optional(),
  // Document flavour. Deposit/retainer invoices post as normal AR documents
  // (no special GL); they are just flagged for downstream display/workflows.
  invoiceType: z.enum(["standard", "deposit", "retainer"]).default("standard"),
  // For deposit invoices: the deposit percentage in basis points (e.g. 2500 = 25%).
  depositPercent: z.number().int().min(0).max(10000).nullable().optional(),
  // When true, create the invoice in 'pending_approval' rather than 'sent' so it
  // enters the approval workflow immediately (and is not posted/sent).
  submitForApproval: z.boolean().optional().default(false),
  // Default to 'sent' (finalized & active) unless explicitly set to 'draft'
  status: z.enum(["draft", "sent"]).optional().default("sent"),
  // Bill-Wise reference type (mirrors TallyPrime New Ref / Agst Ref semantics).
  // NEW_REF (default) = normal outstanding invoice.
  // AGST_REF = settle against an existing customer advance at invoice creation time.
  referenceType: z.enum(["NEW_REF", "AGST_REF"]).optional().default("NEW_REF"),
  // The customer_credit UUID to settle against (required when referenceType === 'AGST_REF').
  advanceCreditId: z.string().nullable().optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SORT_COLUMNS: Record<string, any> = {
  date: invoice.issueDate,
  due: invoice.dueDate,
  total: invoice.total,
  amountDue: invoice.amountDue,
  number: invoice.invoiceNumber,
  created: invoice.createdAt,
};

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");
    const contactId = url.searchParams.get("contactId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const sortBy = url.searchParams.get("sortBy") || "created";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";

    const conditions = [
      eq(invoice.organizationId, ctx.organizationId),
      notDeleted(invoice.deletedAt),
    ];

    if (status) {
      conditions.push(eq(invoice.status, status as typeof invoice.status.enumValues[number]));
    }
    if (contactId) {
      conditions.push(eq(invoice.contactId, contactId));
    }
    if (from) {
      conditions.push(gte(invoice.issueDate, from));
    }
    if (to) {
      conditions.push(lte(invoice.issueDate, to));
    }

    const sortCol = SORT_COLUMNS[sortBy] || invoice.createdAt;
    const orderFn = sortOrder === "asc" ? asc : desc;

    const invoices = await db.query.invoice.findMany({
      where: and(...conditions),
      orderBy: orderFn(sortCol),
      limit,
      offset,
      with: { contact: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(invoice)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(invoices, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await assertNotLocked(ctx.organizationId, parsed.issueDate);
    await checkMonthlyLimit(ctx.organizationId, invoice, invoice.organizationId, invoice.createdAt, "invoicesPerMonth", invoice.deletedAt);

    // Resolve currency: explicit request > contact default > org default > USD.
    const currencyCode = await resolveDocumentCurrency(
      ctx.organizationId,
      parsed.currencyCode,
      parsed.contactId
    );
    await checkMultiCurrency(ctx.organizationId, currencyCode);

    // Auto-calculate due date if not provided
    let dueDate = parsed.dueDate;
    if (!dueDate) {
      const contactRecord = await db.query.contact.findFirst({
        where: eq(contact.id, parsed.contactId),
        columns: { paymentTermsDays: true },
      });
      let termsDays = contactRecord?.paymentTermsDays;
      if (termsDays == null) {
        const org = await db.query.organization.findFirst({
          where: eq(organization.id, ctx.organizationId),
          columns: { defaultPaymentTerms: true },
        });
        termsDays = org?.defaultPaymentTerms ? parseInt(org.defaultPaymentTerms) : 30;
      }
      const d = new Date(parsed.issueDate + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + (termsDays || 30));
      dueDate = d.toISOString().split("T")[0];
    }

    const invoiceNumber = await getNextNumber(ctx.organizationId, "invoice", "invoice_number", "INV");

    // Preload tax rates
    const taxRateIds = parsed.lines.map((l) => l.taxRateId).filter(Boolean) as string[];
    const ratesMap = await preloadTaxRates(taxRateIds);

    // Resolve default unit prices (integer cents) for inventory-item lines that
    // don't carry an explicit unitPrice: prefer the line/document price list,
    // then fall back to the item's default sale price. Lines with an explicit
    // unitPrice are unaffected. Item default prices are preloaded in one query.
    const itemIds = [
      ...new Set(
        parsed.lines
          .filter((l) => l.inventoryItemId && l.unitPrice === undefined)
          .map((l) => l.inventoryItemId as string)
      ),
    ];
    const itemPriceMap = new Map<string, number>();
    if (itemIds.length > 0) {
      const items = await db.query.inventoryItem.findMany({
        where: and(
          eq(inventoryItem.organizationId, ctx.organizationId),
          inArray(inventoryItem.id, itemIds)
        ),
        columns: { id: true, salePrice: true },
      });
      for (const it of items) itemPriceMap.set(it.id, it.salePrice);
    }

    // unitPriceCents per line, in the same order as parsed.lines.
    const unitPricesCents = await Promise.all(
      parsed.lines.map(async (l) => {
        // Explicit price always wins (caller override).
        if (l.unitPrice !== undefined) return decimalToMinorUnits(l.unitPrice, currencyCode);
        if (l.inventoryItemId) {
          const listId = l.priceListId || parsed.priceListId || null;
          if (listId) {
            const resolved = await resolvePrice(
              ctx.organizationId,
              l.inventoryItemId,
              listId,
              l.quantity || 1,
              parsed.issueDate
            );
            if (resolved) return resolved.unitPrice;
          }
          // Fall back to the item's default sale price.
          return itemPriceMap.get(l.inventoryItemId) ?? 0;
        }
        return 0;
      })
    );

    // Calculate totals
    let subtotal = 0;
    const processedLines = parsed.lines.map((l, i) => {
      const unitPriceCents = unitPricesCents[i];
      
      const width = l.width || 0;
      const length = l.length || 0;
      const sqFt = l.sqFt || ((width > 0 && length > 0) ? width * length : 1);
      
      const finishAmount = Math.round((l.finishAmount || 0) * 100);
      const deliveryAmount = Math.round((l.deliveryAmount || 0) * 100);

      const baseAmount = Math.round(sqFt * l.quantity * unitPriceCents);
      const grossAmount = baseAmount + finishAmount + deliveryAmount;
      
      const discountAmount = l.discountPercent ? Math.round(grossAmount * l.discountPercent / 10000) : 0;
      const amount = grossAmount - discountAmount;
      subtotal += amount;
      
      const taxRateId = l.taxRateId || null;
      const taxAmount = taxRateId ? calcTax(amount, ratesMap.get(taxRateId) ?? 0) : 0;
      
      // Auto-split tax into CGST/SGST explicitly
      const cgstAmount = Math.round(taxAmount / 2);
      const sgstAmount = taxAmount - cgstAmount;
      const igstAmount = 0; // Default for now, can be overridden by state logic later

      return {
        description: l.description,
        quantity: Math.round(l.quantity * 100),
        unitPrice: unitPriceCents,
        accountId: l.accountId || null,
        taxRateId,
        discountPercent: l.discountPercent,
        taxAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        amount,
        width,
        length,
        sqFt,
        finishAmount,
        deliveryMode: l.deliveryMode || null,
        deliveryAmount,
        costCenterId: l.costCenterId || null,
        projectId: l.projectId || null,
        inventoryItemId: l.inventoryItemId || null,
        warehouseId: l.warehouseId || null,
        sortOrder: i,
      };
    });

    const taxTotal = processedLines.reduce((sum, l) => sum + l.taxAmount, 0);
    const cgstTotal = processedLines.reduce((sum, l) => sum + l.cgstAmount, 0);
    const sgstTotal = processedLines.reduce((sum, l) => sum + l.sgstAmount, 0);
    const igstTotal = processedLines.reduce((sum, l) => sum + l.igstAmount, 0);
    const total = subtotal + taxTotal;

    // Credit-limit check: outstanding = sum of non-void invoice.amountDue, less
    // any unapplied customer credit, plus the invoice being created. Compared to
    // the contact's creditLimit (null = no limit). Soft-warning by default; the
    // caller may pass enforceCreditLimit:true (e.g. an org policy) to hard-block.
    let creditLimitWarning: {
      creditLimit: number;
      currentOutstanding: number;
      projectedOutstanding: number;
      exceededBy: number;
    } | null = null;
    {
      const contactRecord = await db.query.contact.findFirst({
        where: and(
          eq(contact.id, parsed.contactId),
          eq(contact.organizationId, ctx.organizationId)
        ),
        columns: { creditLimit: true },
      });
      const creditLimit = contactRecord?.creditLimit ?? null;
      if (creditLimit != null) {
        const [dueRow] = await db
          .select({
            total: sql<number>`coalesce(sum(${invoice.amountDue}), 0)`.mapWith(Number),
          })
          .from(invoice)
          .where(
            and(
              eq(invoice.organizationId, ctx.organizationId),
              eq(invoice.contactId, parsed.contactId),
              ne(invoice.status, "void"),
              notDeleted(invoice.deletedAt)
            )
          );
        const [creditRow] = await db
          .select({
            total: sql<number>`coalesce(sum(${customerCredit.amountRemaining}), 0)`.mapWith(Number),
          })
          .from(customerCredit)
          .where(
            and(
              eq(customerCredit.organizationId, ctx.organizationId),
              eq(customerCredit.contactId, parsed.contactId),
              ne(customerCredit.status, "void"),
              notDeleted(customerCredit.deletedAt)
            )
          );
        const currentOutstanding =
          Number(dueRow?.total || 0) - Number(creditRow?.total || 0);
        const projectedOutstanding = currentOutstanding + total;
        if (projectedOutstanding > creditLimit) {
          creditLimitWarning = {
            creditLimit,
            currentOutstanding,
            projectedOutstanding,
            exceededBy: projectedOutstanding - creditLimit,
          };
          if (parsed.enforceCreditLimit) {
            return NextResponse.json(
              {
                error: `Credit limit exceeded: this invoice would put the customer at ${projectedOutstanding} cents against a limit of ${creditLimit} cents`,
                creditLimitWarning,
              },
              { status: 403 }
            );
          }
        }
      }
    }

    const [created] = await db
      .insert(invoice)
      .values({
        organizationId: ctx.organizationId,
        contactId: parsed.contactId,
        invoiceNumber,
        issueDate: parsed.issueDate,
        dueDate,
        reference: parsed.reference || null,
        notes: parsed.notes || null,
        subtotal,
        taxTotal,
        cgstTotal,
        sgstTotal,
        igstTotal,
        total,
        amountPaid: 0,
        amountDue: total,
        currencyCode,
        invoiceType: parsed.invoiceType,
        depositPercent: parsed.depositPercent ?? null,
        status: parsed.submitForApproval ? "draft" : parsed.status,
        createdBy: ctx.userId,
      })
      .returning();

    await db.insert(invoiceLine).values(
      processedLines.map((l) => ({
        invoiceId: created.id,
        ...l,
      }))
    );

    // If created directly as 'sent', automatically post to General Ledger (DR AR 1200, CR Revenue 4000, CR GST)
    if (created.status === "sent") {
      try {
        const { createInvoiceJournalEntry } = await import("@/lib/api/journal-automation");
        const entry = await createInvoiceJournalEntry(
          { organizationId: ctx.organizationId, userId: ctx.userId },
          {
            invoiceNumber: created.invoiceNumber,
            total: created.total,
            taxTotal: created.taxTotal,
            cgstTotal: created.cgstTotal,
            sgstTotal: created.sgstTotal,
            igstTotal: created.igstTotal,
            subtotal: created.subtotal,
            lines: processedLines.map((l) => ({
              accountId: l.accountId || null,
              amount: l.amount,
              taxAmount: l.taxAmount,
            })),
            date: created.issueDate,
            currencyCode: created.currencyCode,
          }
        );
        if (entry) {
          await db
            .update(invoice)
            .set({ journalEntryId: entry.id })
            .where(eq(invoice.id, created.id));
        }
      } catch (err) {
        console.warn("Failed to create initial invoice journal entry", err);
      }
    }

    // ── AGST REF: settle against an existing customer advance at creation time ──
    if (parsed.referenceType === "AGST_REF" && parsed.advanceCreditId) {
      try {
        const credit = await db.query.customerCredit.findFirst({
          where: and(
            eq(customerCredit.id, parsed.advanceCreditId),
            eq(customerCredit.organizationId, ctx.organizationId)
          ),
          with: { journalEntry: { columns: { reference: true, entryNumber: true } } },
        });

        if (credit && credit.amountRemaining > 0) {
          const applyAmount = Math.min(credit.amountRemaining, created.total);
          const newRemaining = credit.amountRemaining - applyAmount;
          const newAmountDue = created.total - applyAmount;
          const newStatus = newAmountDue === 0 ? "paid" : "partial";
          const creditStatus = newRemaining === 0 ? "applied" : "open";
          const advRefName =
            credit.journalEntry?.reference ||
            credit.journalEntry?.entryNumber ||
            credit.notes ||
            "Advance";

          // 1. Decrement the advance balance
          await db
            .update(customerCredit)
            .set({ amountRemaining: newRemaining, status: creditStatus })
            .where(eq(customerCredit.id, credit.id));

          // 2. Mark the invoice as paid / partial immediately
          await db
            .update(invoice)
            .set({ amountPaid: applyAmount, amountDue: newAmountDue, status: newStatus })
            .where(eq(invoice.id, created.id));

          // 3. Create carrier payment record so it appears in Payment History & statements
          try {
            const paymentNumber = await getNextNumber(
              ctx.organizationId,
              "payment",
              "payment_number",
              "PAY"
            );
            const [createdPayment] = await db
              .insert(payment)
              .values({
                organizationId: ctx.organizationId,
                contactId: created.contactId,
                paymentNumber,
                type: "received",
                date: created.issueDate,
                amount: applyAmount,
                method: "other",
                reference: advRefName,
                notes: `Settled against Advance Receipt ${advRefName}`,
                currencyCode: created.currencyCode,
                journalEntryId: entryId,
                createdBy: ctx.userId,
              })
              .returning();

            if (createdPayment) {
              await db.insert(paymentAllocation).values([
                {
                  paymentId: createdPayment.id,
                  documentType: "prepayment",
                  documentId: credit.id,
                  amount: applyAmount,
                },
                {
                  paymentId: createdPayment.id,
                  documentType: "invoice",
                  documentId: created.id,
                  amount: applyAmount,
                },
              ]);
            }
          } catch (payErr) {
            console.warn("Agst Ref carrier payment row failed (non-fatal):", payErr);
          }
        }
      } catch (settleErr) {
        console.warn("Agst Ref settlement failed (non-fatal):", settleErr);
      }
    }

    logAudit({ ctx, action: "create", entityType: "invoice", entityId: created.id, request });

    // Mark invoice generated in shared Supabase orders table
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && supabaseKey && parsed.reference) {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseKey);
        const refIds = parsed.reference.split(",").map((s) => s.trim()).filter(Boolean);
        for (const refId of refIds) {
          // Update order matching id, parent_order_id, or baseOrderId
          await supabase
            .from("orders")
            .update({
              is_invoice_generated: true,
              invoice_number: invoiceNumber,
              invoice_id: created.id,
            })
            .or(`id.eq.${refId},parent_order_id.eq.${refId},baseOrderId.eq.${refId}`);
        }
      }
    } catch (err) {
      console.warn("Failed to update orders status in Supabase", err);
    }

    // Submit-for-approval on create: mirror the dedicated submit route. Resolve
    // the creating user's member record, find a matching active workflow, create
    // the approval_request, then flip the invoice to 'pending_approval'. If there
    // is no active workflow (with steps) for invoices, approval cannot be
    // required, so fall back to leaving the invoice as a normal 'draft'.
    let result = created;
    if (parsed.submitForApproval) {
      const requester = await db.query.member.findFirst({
        where: and(
          eq(member.userId, ctx.userId),
          eq(member.organizationId, ctx.organizationId)
        ),
      });

      const workflow = requester
        ? await checkApprovalRequired(
            ctx.organizationId,
            "invoice",
            created as unknown as Record<string, unknown>
          )
        : null;

      if (requester && workflow && workflow.steps.length > 0) {
        await createApprovalRequest(
          ctx.organizationId,
          workflow.id,
          "invoice",
          created.id,
          requester.id
        );

        const [updated] = await db
          .update(invoice)
          .set({ status: "pending_approval", updatedAt: new Date() })
          .where(
            and(
              eq(invoice.id, created.id),
              eq(invoice.organizationId, ctx.organizationId)
            )
          )
          .returning();

        if (updated) {
          result = updated;
          logAudit({
            ctx,
            action: "submit_for_approval",
            entityType: "invoice",
            entityId: created.id,
            changes: { previousStatus: created.status },
            request,
          });
        }
      }
    }

    // Auto-enqueue to tally_sync_queue for seamless TallyPrime synchronization
    try {
      const { enqueueTallySync, getTallySettings } = await import("@/lib/actions/tally-sync");
      const settings = await getTallySettings();

      // Fetch customer details
      const customer = await db.query.contact.findFirst({
        where: and(eq(contact.id, result.contactId), eq(contact.organizationId, ctx.organizationId)),
      });

      const customerLedgerName = customer?.displayName || customer?.businessName || customer?.name || "Cash Customer";

      // ── Determine bill allocation type ──────────────────────────────────────
      // NEW_REF (default) → standard "New Ref" — customer pays later.
      // AGST_REF → "Agst Ref" against the advance name — invoice is pre-paid.
      // For Agst Ref we also need the advance reference name (ADV-XXXX).
      let billType = "New Ref";
      let billAllocationName = result.invoiceNumber;

      if (parsed.referenceType === "AGST_REF") {
        let advRef = parsed.advanceReference || "";
        if (!advRef && parsed.advanceCreditId) {
          const [advCredit] = await db
            .select()
            .from(customerCredit)
            .where(eq(customerCredit.id, parsed.advanceCreditId));
          if (advCredit?.notes) {
            const match = advCredit.notes.match(/ADV-\d+/i);
            if (match) advRef = match[0].toUpperCase();
          }
          if (!advRef && advCredit?.journalEntryId) {
            const je = await db.query.journalEntry.findFirst({
              where: eq(journalEntry.id, advCredit.journalEntryId),
            });
            if (je?.referenceNumber) advRef = je.referenceNumber;
          }
        }
        if (!advRef) advRef = "ADV-0001";

        billType = "Agst Ref";
        billAllocationName = advRef;
      }

      // Prepare payload matching Sales_HS7547.xml / Memory Section 15
      const payload = {
        tallyCompanyName: settings.companyName || process.env.TALLY_COMPANY_NAME || "Website Testing Hindustan",
        voucherType: "1.GST HO CS",
        voucherClass: "GST Sale",
        invoiceNumber: result.invoiceNumber,
        invoiceDate: result.issueDate ? result.issueDate.replace(/-/g, "") : new Date().toISOString().slice(0, 10).replace(/-/g, ""),
        date: result.issueDate || new Date().toISOString().slice(0, 10),
        partyLedgerName: customerLedgerName,
        customerName: customerLedgerName,
        partyGstin: customer?.taxNumber || "",
        placeOfSupply: customer?.state || "Karnataka",
        isCreditSale: true,
        billAllocations: {
          name: billAllocationName,
          billType,
          amount: -(result.total / 100),
        },
        items: processedLines.map((l) => ({
          productName: l.description || "Printing Services",
          hsnCode: l.hsnCode || "32141000",
          quantity: l.quantity,
          unit: "N",
          rate: (l.unitPrice || 0) / 100,
          taxableAmount: l.amount / 100,
          godownName: "B1",
          cgstRate: l.cgstRate || 9,
          sgstRate: l.sgstRate || 9,
          cgstAmount: (l.cgstAmount || 0) / 100,
          sgstAmount: (l.sgstAmount || 0) / 100,
        })),
        ledgers: {
          salesLedger: "GST SALES",
          cgstLedger: "CGST",
          sgstLedger: "SGST",
          freightLedger: "zForwarding Charge- Sale",
          roundOffLedger: "Round Off",
        },
        subTotal: result.subtotal / 100,
        cgst: (result.cgstTotal || 0) / 100,
        sgst: (result.sgstTotal || 0) / 100,
        igst: (result.igstTotal || 0) / 100,
        grandTotal: result.total / 100,
        commonGodown: "B1",
      };

      await enqueueTallySync({
        syncType: "SALES_INVOICE",
        orderId: result.id,
        customerId: result.contactId,
        payload,
        createdBy: ctx.userId,
        voucherId: result.invoiceNumber,
        voucherType: "1.GST HO CS",
        refId: result.invoiceNumber,
        customerName: customerLedgerName,
        amountSnap: result.total / 100,
      });

      // ── AGST REF: also enqueue a Journal Voucher for the advance settlement ──
      // In Tally:  DR Customer Deposits (Advance) / CR Customer Ledger (AR)
      // This mirrors the GL adjustment we already posted in ERP.
      // Memory Section 15, Row 2: "Full Advance Prepayment" → JOURNAL_VOUCHER.
      if (parsed.referenceType === "AGST_REF" && parsed.advanceCreditId) {
        try {
          const [advCredit] = await db
            .select()
            .from(customerCredit)
            .where(eq(customerCredit.id, parsed.advanceCreditId));

          if (advCredit) {
            const applyAmt = Math.min(advCredit.originalAmount ?? advCredit.amountRemaining, result.total) / 100;
            // Fetch Customer Deposits ledger name from chart of accounts (GL 2410)
            const depositAccount = await db.query.chartAccount.findFirst({
              where: and(
                eq(chartAccount.code, "2410"),
                eq(chartAccount.organizationId, ctx.organizationId)
              ),
            });
            const depositLedger = depositAccount?.name || "Customer Deposits";

            await enqueueTallySync({
              syncType: "JOURNAL_VOUCHER",
              orderId: result.id,
              customerId: result.contactId,
              createdBy: ctx.userId,
              voucherId: `JV-${result.invoiceNumber}`,
              voucherType: "Journal",
              refId: advCredit.referenceNumber || parsed.advanceCreditId,
              customerName: customerLedgerName,
              amountSnap: applyAmt,
              payload: {
                tallyCompanyName: settings.companyName || process.env.TALLY_COMPANY_NAME || "Website Testing Hindustan",
                voucherNumber: `JV-${result.invoiceNumber}`,
                voucherDate: result.issueDate || new Date().toISOString().slice(0, 10),
                narration: `Advance settlement: ${advCredit.referenceNumber || "ADV"} applied against ${result.invoiceNumber} for ${customerLedgerName}`,
                // DR: Customer Deposits (debit = reduces the advance liability)
                // CR: Customer Ledger / AR (credit = clears invoice)
                entries: [
                  {
                    ledgerName: depositLedger,
                    isDeemedPositive: true,   // Debit
                    amount: applyAmt,
                  },
                  {
                    ledgerName: customerLedgerName,
                    isDeemedPositive: false,  // Credit
                    amount: applyAmt,
                    // Bill allocation: Agst Ref closes the advance (ADV-XXXX)
                    billAllocations: [
                      {
                        name: advCredit.referenceNumber || "ADV",
                        billType: "Agst Ref",
                        amount: applyAmt,
                      },
                    ],
                  },
                ],
              },
            });
          }
        } catch (jvErr) {
          console.warn("[TallySync] Agst Ref Journal Voucher enqueue failed (non-fatal):", jvErr);
        }
      }
    } catch (tallyErr) {
      console.warn("[TallySync] Failed to auto-enqueue invoice:", tallyErr);
    }

    return NextResponse.json({ invoice: result, creditLimitWarning }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
