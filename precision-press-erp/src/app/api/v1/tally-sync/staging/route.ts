import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { auth } from "@/lib/auth";

export const dynamic = 'force-dynamic';

async function getOrgId(req: Request) {
  const { searchParams } = new URL(req.url);
  let orgId = searchParams.get("organizationId");
  if (orgId) return orgId;

  try {
    const session = await auth();
    if (session?.user?.organizationId) return session.user.organizationId;
  } catch (e) {
    // Ignore auth error
  }

  const { data: org } = await supabaseServer
    .from('organization')
    .select('id')
    .limit(1)
    .maybeSingle();

  return org?.id || '00000000-0000-0000-0000-000000000002';
}

export async function GET(req: Request) {
  try {
    const organizationId = await getOrgId(req);

    const [contactsRes, banksRes, accountsRes] = await Promise.all([
      supabaseServer
        .from("contact_tally")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabaseServer
        .from("bank_account_tally")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabaseServer
        .from("chart_account_tally")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
    ]);

    if (contactsRes.error) throw contactsRes.error;
    if (banksRes.error) throw banksRes.error;
    if (accountsRes.error) throw accountsRes.error;

    return NextResponse.json({
      success: true,
      contacts: contactsRes.data || [],
      banks: banksRes.data || [],
      accounts: accountsRes.data || [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { table, stagingId, updates } = await req.json();

    if (!table || !stagingId || !updates) {
      return NextResponse.json(
        { success: false, error: "table, stagingId, and updates are required" },
        { status: 400 }
      );
    }

    const validTables = ['contact_tally', 'bank_account_tally', 'chart_account_tally'];
    if (!validTables.includes(table)) {
      return NextResponse.json(
        { success: false, error: "Invalid staging table name" },
        { status: 400 }
      );
    }

    const { error } = await supabaseServer
      .from(table)
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('staging_id', stagingId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
