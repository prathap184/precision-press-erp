import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryItem, hsnMaster, hsnGstRates } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  sku: z.string().nullable().optional(),
  purchasePrice: z.number().int().min(0).optional(),
  salePrice: z.number().int().min(0).optional(),
  costAccountId: z.string().nullable().optional(),
  revenueAccountId: z.string().nullable().optional(),
  inventoryAccountId: z.string().nullable().optional(),
  reorderPoint: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  hsnCode: z.string().nullable().optional(),
  gstRate: z.number().int().nullable().optional(),
  metadata: z.any().optional(),
  workflowSteps: z.any().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.inventoryItem.findFirst({
      where: and(
        eq(inventoryItem.id, id),
        eq(inventoryItem.organizationId, ctx.organizationId),
        notDeleted(inventoryItem.deletedAt)
      ),
    });

    if (!found) return notFound("Inventory item");
    return NextResponse.json({ inventoryItem: found });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.inventoryItem.findFirst({
      where: and(
        eq(inventoryItem.id, id),
        eq(inventoryItem.organizationId, ctx.organizationId),
        notDeleted(inventoryItem.deletedAt)
      ),
    });

    if (!existing) return notFound("Inventory item");

    let finalGstRate = parsed.gstRate;
    if (parsed.hsnCode && typeof finalGstRate !== "number" && parsed.hsnCode !== (existing as any).hsnCode) {
      // Look up the rate if HSN changed and GST rate isn't explicitly provided
      const hsn = await db.query.hsnMaster.findFirst({
        where: eq(hsnMaster.hsnCode, parsed.hsnCode),
      });
      if (hsn) {
        const rateRec = await db.query.hsnGstRates.findFirst({
          where: eq(hsnGstRates.hsnId, hsn.id),
          orderBy: desc(hsnGstRates.effectiveFrom),
        });
        if (rateRec) {
          finalGstRate = rateRec.gstRate;
        }
      }
    }

    const [updated] = await db
      .update(inventoryItem)
      .set({ 
        ...parsed, 
        ...(finalGstRate !== undefined ? { gstRate: finalGstRate } : {}),
        updatedAt: new Date() 
      })
      .where(eq(inventoryItem.id, id))
      .returning();

    logAudit({ ctx, action: "update", entityType: "inventory_item", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    // Notify Pixel Marketing (precision-press-erp) to invalidate its products cache
    fetch("http://localhost:3000/api/cache/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "products" }),
    }).catch(err => console.error("Failed to revalidate Pixel Marketing cache:", err));

    return NextResponse.json({ inventoryItem: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const existing = await db.query.inventoryItem.findFirst({
      where: and(
        eq(inventoryItem.id, id),
        eq(inventoryItem.organizationId, ctx.organizationId),
        notDeleted(inventoryItem.deletedAt)
      ),
    });

    if (!existing) return notFound("Inventory item");

    await db
      .update(inventoryItem)
      .set(softDelete())
      .where(eq(inventoryItem.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "inventory_item",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    // Notify Pixel Marketing (precision-press-erp) to invalidate its products cache
    fetch("http://localhost:3000/api/cache/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "products" }),
    }).catch(err => console.error("Failed to revalidate Pixel Marketing cache:", err));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
