import { NextResponse } from "next/server";
import { enqueueTallySync } from "@/lib/actions/tally-sync";

export async function POST(req: Request) {
  try {
    const { organizationId } = await req.json();

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "Missing organizationId" },
        { status: 400 }
      );
    }

    // This creates an event in tally_sync_queue
    const res = await enqueueTallySync({
      syncType: "FETCH_MASTERS",
      payload: { organizationId }, // Pass organizationId in payload so connector/mark-result can use it
      createdBy: "system", // We can use the user's ID here if we have it
    });

    if (!res.success) {
      return NextResponse.json(
        { success: false, error: res.reason },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      eventId: res.eventId,
    });
  } catch (error: any) {
    console.error("Trigger Fetch Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
