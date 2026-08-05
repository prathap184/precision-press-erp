import { db } from "@/lib/db";
import { member, users, organization } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { MemberRole } from "@/lib/plans";

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: MemberRole;
  customRoleId?: string;
  permissions?: string[];
  isAdvisor?: boolean;
  advisorRole?: string;
}

export async function getAuthContext(
  request: Request,
  organizationId?: string
): Promise<AuthContext> {
  const reqOrgId = organizationId || request.headers.get("x-organization-id");

  // 1. Try to find active org membership directly if orgId is passed
  if (reqOrgId) {
    const mem = await db.query.member.findFirst({
      where: eq(member.organizationId, reqOrgId),
    });
    if (mem) {
      return {
        userId: mem.userId,
        organizationId: mem.organizationId,
        role: (mem.role || "owner") as MemberRole,
      };
    }
  }

  // 2. Resolve admin@gmail.com user or first active user
  const adminUser = await db.query.users.findFirst({
    where: eq(users.email, "admin@gmail.com"),
  }) || await db.query.users.findFirst();

  if (adminUser) {
    const mem = await db.query.member.findFirst({
      where: eq(member.userId, adminUser.id),
    });

    if (mem) {
      return {
        userId: adminUser.id,
        organizationId: mem.organizationId,
        role: (mem.role || "owner") as MemberRole,
      };
    }
  }

  // 3. Fallback: resolve first active organization
  const firstOrg = await db.query.organization.findFirst();
  if (firstOrg) {
    return {
      userId: adminUser?.id || "system-user",
      organizationId: firstOrg.id,
      role: "owner" as MemberRole,
    };
  }

  throw new AuthError("No active organization found", 401);
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}
