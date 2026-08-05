import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const res = await db.execute(sql`
      SELECT DISTINCT ON (m.hsn_code)
        m.hsn_code as code, 
        m.description, 
        r.gst_rate as gst
      FROM hsn_master m
      JOIN LATERAL (
        SELECT gst_rate 
        FROM hsn_gst_rates 
        WHERE hsn_id = m.id 
        ORDER BY effective_from DESC NULLS LAST 
        LIMIT 1
      ) r ON true
      WHERE m.is_active = true
      ORDER BY m.hsn_code ASC, r.gst_rate DESC
    `);

    return NextResponse.json({ hsns: res.rows });
  } catch (error: any) {
    console.error("Error fetching HSNs:", error);
    return NextResponse.json(
      { error: "Failed to fetch HSN list" },
      { status: 500 }
    );
  }
}
