import { NextRequest, NextResponse } from 'next/server';
import { generateInvoiceFromChildOrders } from '@/lib/actions/documents';
import { getAuthorizedUser } from '@/lib/actions/accounts';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA', 'SUPER_ADMIN']);

    const body = await req.json();
    const { childOrderIds, parentOrderId, customerId, invoiceDate } = body;

    if (!childOrderIds || !Array.isArray(childOrderIds) || childOrderIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No child order IDs provided.' }, { status: 400 });
    }
    if (!parentOrderId || !customerId) {
      return NextResponse.json({ success: false, error: 'Missing parentOrderId or customerId.' }, { status: 400 });
    }

    const actorId   = authUser.id;
    const actorName = authUser.name || 'Staff';

    const result = await generateInvoiceFromChildOrders(
      childOrderIds,
      parentOrderId,
      customerId,
      actorId,
      actorName,
      invoiceDate
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 422 });
    }

    return NextResponse.json({
      success:       true,
      invoiceId:     result.invoiceId,
      invoiceNumber: result.invoiceNumber,
    });

  } catch (err: any) {
    console.error('[POST /api/invoices/generate]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
