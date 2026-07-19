// Centralized Pricing Engine for ERP V2.0
// Guarantees all financial calculations (GST, totals, discounts) are uniform across the system.

export interface PricingInputItem {
  productTotal: number;
  designCharges: number;
  finishCharges: number;
  packingCharges: number;
  gstRate?: number;
}

export interface PricingInput {
  items: PricingInputItem[];
  transport: number;       // door / courier / transport rate
  discount: number;        // manual discount
  voucherDiscount: number; // voucher-applied discount
  gstRate?: number;        // default: 0.18
  isInterstate?: boolean;  // true = IGST, false = CGST/SGST
}

export interface PricingResult {
  productTotal: number;
  designCharges: number;
  finishCharges: number;
  packingCharges: number;
  transport: number;
  discount: number;
  voucherDiscount: number;
  subtotal: number;        // before GST
  gst: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
}

export function calculateOrderTotals(input: PricingInput): PricingResult {
  const gstRate = input.gstRate ?? 0.18;
  const isInterstate = input.isInterstate ?? false;

  let productTotal = 0;
  let designCharges = 0;
  let finishCharges = 0;
  let packingCharges = 0;

  for (const item of input.items) {
    productTotal += item.productTotal || 0;
    designCharges += item.designCharges || 0;
    finishCharges += item.finishCharges || 0;
    packingCharges += item.packingCharges || 0;
  }

  // Calculate gross before discounts (INCLUDING transport)
  const grossTotal = productTotal + designCharges + finishCharges + packingCharges + (input.transport || 0);

  // Calculate net subtotal (before tax) (INCLUDING transport)
  const totalDiscounts = (input.discount || 0) + (input.voucherDiscount || 0);
  const subtotal = Math.max(0, grossTotal - totalDiscounts);

  // Calculate taxable subtotal (EXCLUDING transport)
  const totalGrossForItems = productTotal + designCharges + finishCharges + packingCharges;
  const taxableSubtotal = Math.max(0, totalGrossForItems - totalDiscounts);

  // Calculate GST
  let totalGst = 0;
  if (totalGrossForItems > 0) {
    for (const item of input.items) {
      const itemGross = (item.productTotal || 0) + (item.designCharges || 0) + (item.finishCharges || 0) + (item.packingCharges || 0);
      const itemDiscountRatio = itemGross / totalGrossForItems;
      const itemDiscount = totalDiscounts * itemDiscountRatio;
      const itemTaxable = Math.max(0, itemGross - itemDiscount);
      const itemGstRate = item.gstRate ?? gstRate;
      totalGst += itemTaxable * itemGstRate;
    }
  }

  const gst = Number(totalGst.toFixed(2));
  
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (isInterstate) {
    igst = gst;
  } else {
    // Standard integer rounding approach for splitting GST
    cgst = Number((gst / 2).toFixed(2));
    sgst = Number((gst - cgst).toFixed(2));
  }

  // Calculate Grand Total
  const grandTotal = Number((subtotal + gst).toFixed(2));

  return {
    productTotal: Number(productTotal.toFixed(2)),
    designCharges: Number(designCharges.toFixed(2)),
    finishCharges: Number(finishCharges.toFixed(2)),
    packingCharges: Number(packingCharges.toFixed(2)),
    transport: Number((input.transport || 0).toFixed(2)),
    discount: Number((input.discount || 0).toFixed(2)),
    voucherDiscount: Number((input.voucherDiscount || 0).toFixed(2)),
    subtotal: Number(subtotal.toFixed(2)),
    gst: gst,
    cgst: cgst,
    sgst: sgst,
    igst: igst,
    grandTotal: grandTotal
  };
}
