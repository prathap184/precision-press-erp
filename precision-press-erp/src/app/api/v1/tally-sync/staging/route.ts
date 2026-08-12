import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const organizationId = searchParams.get("organizationId");

  if (!organizationId) {
    return NextResponse.json(
      { success: false, error: "Missing organizationId" },
      { status: 400 }
    );
  }

  try {
    const [contactsRes, banksRes, accountsRes] = await Promise.all([
      supabaseServer
        .from("contact_tally")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("import_status", "pending"),
      supabaseServer
        .from("bank_account_tally")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("import_status", "pending"),
      supabaseServer
        .from("chart_account_tally")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("import_status", "pending"),
    ]);

    if (contactsRes.error) throw contactsRes.error;
    if (banksRes.error) throw banksRes.error;
    if (accountsRes.error) throw accountsRes.error;

    return NextResponse.json({
      success: true,
      contacts: contactsRes.data.map(c => ({
        id: c.staging_id,
        name: c.name,
        parent: c.tally_ledger_group,
        openingBalance: c.tally_opening_balance || "0",
        closingBalance: c.tally_opening_balance || "0", // Staging doesn't differentiate currently
        gstin: c.tax_number,
        type: c.type,
      })),
      banks: banksRes.data.map(b => ({
        id: b.staging_id,
        name: b.account_name,
        parent: b.tally_ledger_group,
        openingBalance: b.balance || "0",
        closingBalance: b.balance || "0",
        type: b.account_type,
      })),
      accounts: accountsRes.data.map(a => ({
        id: a.staging_id,
        name: a.name,
        parent: a.tally_group,
        openingBalance: "0",
        closingBalance: "0",
        type: a.type,
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
