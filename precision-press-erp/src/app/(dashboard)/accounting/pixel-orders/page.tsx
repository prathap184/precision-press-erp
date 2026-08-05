import { createClient } from "@supabase/supabase-js";
import { PixelOrdersClient } from "./pixel-orders-client";
import { db } from "@/lib/db";
import { invoice } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";

export const dynamic = "force-dynamic";

export default async function PixelOrdersPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return <div className="p-6">Supabase credentials missing.</div>;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch orders from the shared Supabase DB
  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .order("createdAt", { ascending: false });

  if (error) {
    return <div className="p-6">Failed to load orders: {error.message}</div>;
  }

  // Fetch existing Dubbl invoices to automatically mark invoiced orders
  let existingInvoices: any[] = [];
  try {
    existingInvoices = await db.query.invoice.findMany({
      where: notDeleted(invoice.deletedAt),
      columns: { id: true, invoiceNumber: true, reference: true },
    });
  } catch (e) {
    console.warn("Failed to fetch invoices for order status mapping", e);
  }

  // Enrich orders with invoice info
  const enrichedOrders = (orders || []).map((o: any) => {
    const refId = o.id;
    const parentRefId = o.parent_order_id || o.parentOrderId || o.baseOrderId;

    const matchedInvoice = existingInvoices.find((inv: any) => {
      if (!inv.reference) return false;
      return (
        inv.reference === refId ||
        inv.reference.includes(refId) ||
        (parentRefId && (inv.reference === parentRefId || inv.reference.includes(parentRefId)))
      );
    });

    if (matchedInvoice) {
      return {
        ...o,
        is_invoice_generated: true,
        invoice_number: matchedInvoice.invoiceNumber,
        invoice_id: matchedInvoice.id,
      };
    }
    return o;
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pixel Orders</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Read-only view of Global Orders from Pixel Marketing.
        </p>
      </div>
      <PixelOrdersClient initialOrders={enrichedOrders} />
    </div>
  );
}
