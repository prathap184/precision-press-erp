import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { voucherSetting } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const settingSchema = z.object({
  voucherType: z.enum(["JOURNAL", "CONTRA", "SALES", "PURCHASE", "RECEIPT", "PAYMENT"]),
  prefix: z.string().min(1).max(20),
  paddingLength: z.number().int().min(1).max(10).default(6),
});

const bodySchema = z.object({
  settings: z.array(settingSchema),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const settings = await db.query.voucherSetting.findMany({
      where: eq(voucherSetting.organizationId, ctx.organizationId),
    });

    return NextResponse.json({ settings });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const { settings } = bodySchema.parse(body);

    const updated = await db.transaction(async (tx) => {
      const results = [];
      for (const setting of settings) {
        const [upserted] = await tx
          .insert(voucherSetting)
          .values({
            organizationId: ctx.organizationId,
            voucherType: setting.voucherType,
            prefix: setting.prefix,
            paddingLength: setting.paddingLength,
          })
          .onConflictDoUpdate({
            target: [voucherSetting.organizationId, voucherSetting.voucherType],
            set: {
              prefix: setting.prefix,
              paddingLength: setting.paddingLength,
              updatedAt: new Date(),
            },
          })
          .returning();
        
        results.push(upserted);
      }
      return results;
    });

    logAudit({
      ctx,
      action: "update",
      entityType: "voucher_setting",
      entityId: "bulk",
      request,
    });

    return NextResponse.json({ settings: updated });
  } catch (err) {
    return handleError(err);
  }
}
