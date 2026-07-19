import { NextRequest, NextResponse } from 'next/server';
import { generateQuotationFromChildOrders } from '@/lib/actions/quotations';
import { getAuthorizedUser } from '@/lib/actions/accounts';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA', 'SUPER_ADMIN']);

    const body = await req.json();
    const { childOrderIds, parentOrderId, customerId, quotationDate } = body;

    if (!childOrderIds || !Array.isArray(childOrderIds) || childOrderIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No child order IDs provided.' }, { status: 400 });
    }
    if (!parentOrderId || !customerId) {
      return NextResponse.json({ success: false, error: 'Missing parentOrderId or customerId.' }, { status: 400 });
    }

    const actorId   = authUser.id;
    const actorName = authUser.name || 'Staff';

    const result = await generateQuotationFromChildOrders(
      childOrderIds,
      parentOrderId,
      customerId,
      actorId,
      actorName,
      quotationDate
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 422 });
    }

    return NextResponse.json({
      success:       true,
      quotationId:     result.quotationId,
      quotationNumber: result.quotationNumber,
    });

  } catch (err: any) {
    console.error('[POST /api/quotations/generate]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
