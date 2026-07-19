// @ts-nocheck
/**
 * PRICING ENGINE: PIXEL MARKETING ERP
 * Centralized logic for SQFT and Price calculations.
 */

export interface PricingRow {
  name?: string;
  width: number;
  height: number;
  quantity: number;
  rate: number;
  eyelets?: number;
  gstRate?: number;
}

export interface ItemBreakdown {
  name: string;
  baseAmount: number;
  finishAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface OrderPricingSummary {
  baseTotal: number;
  extrasTotal: number;
  eyeletsTotal: number;
  deliveryCharges: number;
  subTotalBeforeGst: number;
  gstAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
  totalSqft: number;
  items: ItemBreakdown[];
  logisticsGstRate: number;
  logisticsGstAmount: number;
  logisticsCgst: number;
  logisticsSgst: number;
  logisticsIgst: number;
}

export const calculateSqft = (width: number, height: number, quantity: number): number => {
  if (!width || !height || !quantity) return 0;
  return Number((width * height * quantity).toFixed(2));
};

export const calculateRowSubtotal = (row: PricingRow & { eyeletCount?: number, eyeletRate?: number }): number => {
  const sqft = calculateSqft(row.width, row.height, row.quantity);
  const basePrice = sqft * row.rate;
  
  const eyeletPrice = (row.eyeletCount || 0) * (row.eyeletRate || 0);
  
  return Number((basePrice + eyeletPrice).toFixed(2));
};

export const calculateOrderSummary = (
  rows: (PricingRow & { eyeletCount?: number, eyeletRate?: number })[], 
  deliveryCharges: number = 0,
  fallbackGstRate: number = 0.18, // 18% GST default fallback
  isInterstate: boolean = false
): OrderPricingSummary => {
  let baseTotal = 0;
  let eyeletsTotal = 0;
  let totalSqft = 0;
  let totalGstAmount = 0;
  
  let maxGstRate = 0;
  const items: ItemBreakdown[] = [];

  rows.forEach(row => {
    const sqft = calculateSqft(row.width, row.height, row.quantity);
    const rowBase = sqft * row.rate;
    const rowEyelets = (row.eyeletCount || 0) * (row.eyeletRate || 0);
    const rowSubtotal = rowBase + rowEyelets;
    
    const currentGstRate = row.gstRate !== undefined ? row.gstRate : fallbackGstRate;
    if (currentGstRate > maxGstRate) maxGstRate = currentGstRate;
    
    const rowGstAmount = rowSubtotal * currentGstRate;
    
    baseTotal += rowBase;
    eyeletsTotal += rowEyelets;
    totalSqft += sqft;
    totalGstAmount += rowGstAmount;
    
    items.push({
      name: row.name || 'Custom Item',
      baseAmount: Number(rowBase.toFixed(2)),
      finishAmount: Number(rowEyelets.toFixed(2)),
      gstRate: currentGstRate,
      gstAmount: Number(rowGstAmount.toFixed(2)),
      totalAmount: Number((rowSubtotal + rowGstAmount).toFixed(2)),
      cgst: isInterstate ? 0 : Number((rowGstAmount / 2).toFixed(2)),
      sgst: isInterstate ? 0 : Number((rowGstAmount - (isInterstate ? 0 : Number((rowGstAmount / 2).toFixed(2)))).toFixed(2)),
      igst: isInterstate ? Number(rowGstAmount.toFixed(2)) : 0
    });
  });

  const subTotalBeforeGst = baseTotal + eyeletsTotal + deliveryCharges;
  
  // Logistics tax is no longer needed per user request
  const logisticsGstRate = 0;
  const logisticsGstAmount = 0;
  
  totalGstAmount += logisticsGstAmount;

  const grandTotal = subTotalBeforeGst + totalGstAmount;

  return {
    baseTotal: Number(baseTotal.toFixed(2)),
    eyeletsTotal: Number(eyeletsTotal.toFixed(2)),
    deliveryCharges: Number(deliveryCharges.toFixed(2)),
    subTotalBeforeGst: Number(subTotalBeforeGst.toFixed(2)),
    extrasTotal: Number((eyeletsTotal + deliveryCharges).toFixed(2)),
    gstAmount: Number(totalGstAmount.toFixed(2)),
    cgst: isInterstate ? 0 : Number((totalGstAmount / 2).toFixed(2)),
    sgst: isInterstate ? 0 : Number((totalGstAmount - (isInterstate ? 0 : Number((totalGstAmount / 2).toFixed(2)))).toFixed(2)),
    igst: isInterstate ? Number(totalGstAmount.toFixed(2)) : 0,
    grandTotal: Number(grandTotal.toFixed(2)),
    totalSqft: Number(totalSqft.toFixed(2)),
    items,
    logisticsGstRate,
    logisticsGstAmount: Number(logisticsGstAmount.toFixed(2)),
    logisticsCgst: 0,
    logisticsSgst: 0,
    logisticsIgst: 0
  };
};
