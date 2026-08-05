"use client";

import React, { useMemo, useState } from "react";
import { Loader2, Calendar, Truck, ArrowRight, Activity, CheckCircle, Search, X, FileText } from "lucide-react";
import { WorkflowPipelineVisual } from "@/components/pixel/WorkflowPipelineVisual";
import { OrderThumbnail } from "@/components/pixel/OrderThumbnail";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PLACED: { label: 'Order Placed', color: 'bg-blue-50 text-blue-600 border-blue-200', icon: <Activity size={12} /> },
  DESIGNING: { label: 'Designing', color: 'bg-purple-50 text-purple-600 border-purple-200', icon: <Activity size={12} /> },
  DESIGN_READY: { label: 'Design Ready', color: 'bg-indigo-50 text-indigo-600 border-indigo-200', icon: <Activity size={12} /> },
  PAYMENT_PENDING: { label: 'Payment Pending', color: 'bg-yellow-50 text-yellow-600 border-yellow-200', icon: <Activity size={12} /> },
  PAYMENT_VERIFIED: { label: 'Payment Verified', color: 'bg-teal-50 text-teal-600 border-teal-200', icon: <CheckCircle size={12} /> },
  ASSIGNED: { label: 'Assigned to Press', color: 'bg-orange-50 text-orange-600 border-orange-200', icon: <Truck size={12} /> },
  IN_PROGRESS: { label: 'In Production', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Loader2 size={12} className="animate-spin" /> },
  COMPLETED: { label: 'Completed', color: 'bg-green-50 text-green-600 border-green-200', icon: <CheckCircle size={12} /> },
  DISPATCHED: { label: 'Dispatched', color: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: <Truck size={12} /> },
  DELIVERED: { label: 'Delivered', color: 'bg-green-50 text-green-600 border-green-200', icon: <CheckCircle size={12} /> },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-50 text-red-500 border-red-200', icon: <Activity size={12} /> },
};

export function PixelOrdersClient({ initialOrders }: { initialOrders: any[] }) {
  const { open: openDrawer } = useCreateDrawer();
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<{ start: Date | null, end: Date | null }>({ start: null, end: null });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [siblingsModal, setSiblingsModal] = useState<{ orders: any[]; parentId: string } | null>(null);
  const [selectedSiblingIds, setSelectedSiblingIds] = useState<Set<string>>(new Set());
  const [modalProcessing, setModalProcessing] = useState(false);

  const handleAction = async (order: any, type: "invoice" | "salesReceipt") => {
    try {
      setProcessingOrderId(order.id);
      
      const orgId = typeof window !== 'undefined' ? localStorage.getItem("activeOrgId") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (orgId) headers["x-organization-id"] = orgId;

      let dubblContactId = undefined;
      const contactName = order.customerSnapshot?.name;
      
      if (contactName && contactName !== 'Guest') {
        // Find existing contact by name
        const searchRes = await fetch(`/api/v1/contacts?search=${encodeURIComponent(contactName)}&limit=1`, { headers });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.data && searchData.data.length > 0) {
            dubblContactId = searchData.data[0].id;
          }
        }
        // If not found, create a new contact
        if (!dubblContactId) {
          const createRes = await fetch("/api/v1/contacts", {
            method: "POST",
            headers,
            body: JSON.stringify({
              name: contactName,
              phone: order.customerSnapshot?.phone || null,
              type: "customer"
            })
          });
          if (createRes.ok) {
            const createData = await createRes.json();
            if (createData.contact) {
              dubblContactId = createData.contact.id;
            }
          }
        }
      }

      // ── Fetch Dubbl tax rates to auto-match product GST rate ──
      let dubblTaxRates: any[] = [];
      try {
        const taxRes = await fetch("/api/v1/tax-rates", { headers });
        if (taxRes.ok) {
          const taxData = await taxRes.json();
          dubblTaxRates = taxData.taxRates || [];
        }
      } catch { /* best-effort */ }

      // ── Fetch Dubbl inventory to auto-match product for COGS tracking ──
      let dubblInventory: any[] = [];
      try {
        const invRes = await fetch("/api/v1/inventory?limit=1000", { headers });
        if (invRes.ok) {
          const invData = await invRes.json();
          dubblInventory = invData.data || [];
        }
      } catch { /* best-effort */ }

      // ── Parse stringified JSON fields if necessary ──
      const parseJson = (val: any) => {
        if (typeof val === 'string') {
          try { return JSON.parse(val); } catch { return null; }
        }
        return val;
      };
      
      const parsedItems = parseJson(order.items) || [];
      const parsedAmounts = parseJson(order.amounts) || {};
      const parsedDelivery = parseJson(order.delivery) || {};
      
      // Order-level GST fallback (e.g. cgst 9 + sgst 9 = 18%)
      const orderGstDecimal = ((Number(order.cgst_percentage || 0) + Number(order.sgst_percentage || 0)) || Number(order.igst_percentage || 0)) / 100;

      const mappedLines = parsedItems.map((i: any) => {
        // ── 1. Convert W/L to feet (proxy order may store inches) ──
        const rawWidth  = Number(i.specs?.width  ?? i.width  ?? 0);
        const rawHeight = Number(i.specs?.height ?? i.height ?? 0);
        const widthUnit  = i.specs?.widthUnit  ?? "FT";
        const heightUnit = i.specs?.heightUnit ?? "FT";
        const widthFt  = widthUnit  === "IN" ? rawWidth  / 12 : rawWidth;
        const heightFt = heightUnit === "IN" ? rawHeight / 12 : rawHeight;

        // ── 2. Eyelet finish = eyeletCount × eyeletRate (matches proxy engine) ──
        const qty         = Number(i.specs?.quantity ?? i.quantity ?? 1);
        const pricingSnap = parseJson(i.pricingSnapshot ?? i.pricing_snapshot) || {};
        const eyeletType  = pricingSnap.selectedEyeletType ?? "NONE";
        const eyeletRate  = Number(pricingSnap.eyeletRate ?? 0);
        const eyeletCount = eyeletType !== "NONE" ? qty : 0;
        const finishAmount = (eyeletCount * eyeletRate).toFixed(2);

        // ── 3. Auto-match GST: pricingSnapshot.tax is decimal (0.18 = 18%) ──
        let gstDecimal = Number(pricingSnap.tax ?? 0);
        if (gstDecimal === 0 && orderGstDecimal > 0) {
          gstDecimal = orderGstDecimal; // fallback to order-level GST if item says 0
        } else if (gstDecimal === 0) {
          gstDecimal = 0.18; // final fallback
        }
        
        const gstBasisPts = Math.round(gstDecimal * 10000); // 0.18 → 1800
        const matchedTax  = dubblTaxRates.find((t: any) => t.rate === gstBasisPts);

        // ── 4. Build descriptive text for final PDF & calculate final amount ──
        let desc = i.productName || "Custom Print";
        const baseSqFt = widthFt > 0 && heightFt > 0 ? (widthFt * heightFt) : 1;
        
        // Auto-match inventory item based on product name (case-insensitive)
        const matchedInventory = dubblInventory.find(
          (invItem: any) => invItem.name.toLowerCase() === (i.productName || "").toLowerCase()
        );
        
        if (widthFt > 0 && heightFt > 0) {
          desc += ` (${widthFt} FT x ${heightFt} FT)`;
        }
        if (eyeletCount > 0) {
          desc += ` + ${eyeletCount} ${eyeletType.toLowerCase()} eyelets`;
        }

        const baseRate = parseFloat((pricingSnap.baseRate ?? i.unitPrice ?? i.price ?? i.rate ?? 0).toString()) || 0;
        const totalFinish = parseFloat(finishAmount || "0");

        return {
          description:  desc,
          quantity:     qty.toString(),
          unitPrice:    baseRate.toFixed(2),
          accountId:    "",
          taxRateId:    matchedTax?.id ?? "",
          inventoryItemId: matchedInventory?.id ?? "",
          width:        widthFt > 0 ? widthFt.toString() : "",
          length:       heightFt > 0 ? heightFt.toString() : "",
          sqFt:         widthFt > 0 && heightFt > 0 ? baseSqFt.toFixed(2) : "",
          finishAmount: totalFinish > 0 ? totalFinish.toFixed(2) : ""
        };
      });
      
      if (mappedLines.length === 0) {
        mappedLines.push({
          description: "Custom Print Order",
          quantity: "1",
          unitPrice: (parsedAmounts.grandTotal ?? order.grandTotal ?? 0).toString(),
          accountId: "",
          taxRateId: ""
        });
      }

      // ── Add order-level logistics/delivery charge as a separate tax-free line ──
      const deliveryCharge = Number(
        order.allocated_logistics_amount ?? 
        parsedAmounts.transport ?? 
        parsedAmounts.deliveryCharges ?? 
        0
      );
      
      if (deliveryCharge > 0) {
        mappedLines.push({
          description:    "Logistics / Shipping",
          quantity:       "1",
          unitPrice:      deliveryCharge.toFixed(2), // Use unitPrice so PDF displays correctly
          accountId:      "",
          taxRateId:      "", // No tax applied to logistics
        });
      }

      let orderDelivery: any = {};
      if (order.delivery) {
        try {
          orderDelivery = typeof order.delivery === "string" ? JSON.parse(order.delivery) : order.delivery;
        } catch(e) {
          console.warn("Failed to parse delivery JSON", e);
        }
      }

      openDrawer(type, {
        reference: order.id,
        contactId: dubblContactId,
        lines: type === "invoice" ? mappedLines : undefined,
        deliveryMode: orderDelivery.choice || undefined,
        deliveryAddress: orderDelivery.address || undefined
      });
    } catch (err) {
      console.error("Failed to handle action", err);
      openDrawer(type, { reference: order.id });
    } finally {
      setProcessingOrderId(null);
    }
  };

  // Handle invoicing multiple sibling orders together
  const handleActionMultiple = async (orders: any[], type: "invoice" | "salesReceipt") => {
    if (orders.length === 0) return;
    if (orders.length === 1) { handleAction(orders[0], type); return; }
    setModalProcessing(true);
    try {
      const firstOrder = orders[0];
      const orgId = typeof window !== 'undefined' ? localStorage.getItem("activeOrgId") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (orgId) headers["x-organization-id"] = orgId;

      // Contact lookup from first order
      let dubblContactId: string | undefined;
      const contactName = firstOrder.customerSnapshot?.name;
      if (contactName && contactName !== 'Guest') {
        const searchRes = await fetch(`/api/v1/contacts?search=${encodeURIComponent(contactName)}&limit=1`, { headers });
        if (searchRes.ok) {
          const sd = await searchRes.json();
          if (sd.data && sd.data.length > 0) dubblContactId = sd.data[0].id;
        }
        if (!dubblContactId) {
          const cr = await fetch("/api/v1/contacts", { method: "POST", headers, body: JSON.stringify({ name: contactName, phone: firstOrder.customerSnapshot?.phone || null, type: "customer" }) });
          if (cr.ok) { const cd = await cr.json(); if (cd.contact) dubblContactId = cd.contact.id; }
        }
      }

      let dubblTaxRates: any[] = [];
      try { const tr = await fetch("/api/v1/tax-rates", { headers }); if (tr.ok) { const td = await tr.json(); dubblTaxRates = td.taxRates || []; } } catch {}

      let dubblInventory: any[] = [];
      try { const ir = await fetch("/api/v1/inventory?limit=1000", { headers }); if (ir.ok) { const id2 = await ir.json(); dubblInventory = id2.data || []; } } catch {}

      const parseJson = (val: any) => { if (typeof val === 'string') { try { return JSON.parse(val); } catch { return null; } } return val; };

      // Merge line items from all selected orders
      const allLines: any[] = [];
      for (const order of orders) {
        const parsedItems = parseJson(order.items) || [];
        const parsedAmounts = parseJson(order.amounts) || {};
        const orderGstDecimal = ((Number(order.cgst_percentage || 0) + Number(order.sgst_percentage || 0)) || Number(order.igst_percentage || 0)) / 100;

        const lines = parsedItems.map((i: any) => {
          const rawWidth = Number(i.specs?.width ?? i.width ?? 0);
          const rawHeight = Number(i.specs?.height ?? i.height ?? 0);
          const widthUnit = i.specs?.widthUnit ?? "FT";
          const heightUnit = i.specs?.heightUnit ?? "FT";
          const widthFt = widthUnit === "IN" ? rawWidth / 12 : rawWidth;
          const heightFt = heightUnit === "IN" ? rawHeight / 12 : rawHeight;
          const qty = Number(i.specs?.quantity ?? i.quantity ?? 1);
          const pricingSnap = parseJson(i.pricingSnapshot ?? i.pricing_snapshot) || {};
          const eyeletType = pricingSnap.selectedEyeletType ?? "NONE";
          const eyeletRate = Number(pricingSnap.eyeletRate ?? 0);
          const eyeletCount = eyeletType !== "NONE" ? qty : 0;
          const finishAmount = (eyeletCount * eyeletRate).toFixed(2);
          let gstDecimal = Number(pricingSnap.tax ?? 0);
          if (gstDecimal === 0 && orderGstDecimal > 0) gstDecimal = orderGstDecimal;
          else if (gstDecimal === 0) gstDecimal = 0.18;
          const gstBasisPts = Math.round(gstDecimal * 10000);
          const matchedTax = dubblTaxRates.find((t: any) => t.rate === gstBasisPts);
          const matchedInventory = dubblInventory.find((inv: any) => inv.name.toLowerCase() === (i.productName || "").toLowerCase());
          let desc = i.productName || "Custom Print";
          if (widthFt > 0 && heightFt > 0) desc += ` (${widthFt} FT x ${heightFt} FT)`;
          if (eyeletCount > 0) desc += ` + ${eyeletCount} ${eyeletType.toLowerCase()} eyelets`;
          const baseRate = parseFloat((pricingSnap.baseRate ?? i.unitPrice ?? i.price ?? i.rate ?? 0).toString()) || 0;
          const totalFinish = parseFloat(finishAmount || "0");
          return { description: desc, quantity: qty.toString(), unitPrice: baseRate.toFixed(2), accountId: "", taxRateId: matchedTax?.id ?? "", inventoryItemId: matchedInventory?.id ?? "", width: widthFt > 0 ? widthFt.toString() : "", length: heightFt > 0 ? heightFt.toString() : "", finishAmount: totalFinish > 0 ? totalFinish.toFixed(2) : "" };
        });
        if (lines.length === 0) lines.push({ description: "Custom Print Order", quantity: "1", unitPrice: (parseJson(order.amounts)?.grandTotal ?? 0).toString(), accountId: "", taxRateId: "" });
        allLines.push(...lines);

        // Logistics per order
        const deliveryCharge = Number(order.allocated_logistics_amount ?? parseJson(order.amounts)?.transport ?? 0);
        if (deliveryCharge > 0) allLines.push({ description: "Logistics / Shipping", quantity: "1", unitPrice: deliveryCharge.toFixed(2), accountId: "", taxRateId: "" });
      }

      let orderDelivery: any = {};
      if (firstOrder.delivery) { try { orderDelivery = typeof firstOrder.delivery === "string" ? JSON.parse(firstOrder.delivery) : firstOrder.delivery; } catch {} }

      // Reference = parent order ID
      const parentRef = firstOrder.parent_order_id || orders.map(o => o.id).join(",");

      openDrawer(type, { reference: parentRef, contactId: dubblContactId, lines: type === "invoice" ? allLines : undefined, deliveryMode: orderDelivery.choice || undefined, deliveryAddress: orderDelivery.address || undefined });
      setSiblingsModal(null);
    } catch (err) {
      console.error("Failed multi-order action", err);
      openDrawer(type, { reference: orders[0].id });
      setSiblingsModal(null);
    } finally {
      setModalProcessing(false);
    }
  };

  // Filter out umbrella parent orders when child items exist
  const baseOrders = useMemo(() => {
    const parentIdSet = new Set(
      initialOrders
        .map((o: any) => o.parent_order_id || o.parentOrderId || o.baseOrderId)
        .filter(Boolean)
    );
    return initialOrders.filter((o: any) => {
      const isParentOfChildren = parentIdSet.has(o.id);
      const hasGroupChildren = Array.isArray(o.workflow?.groupOrderIds) && o.workflow.groupOrderIds.length > 0;
      if (isParentOfChildren || hasGroupChildren) return false; // Hide parent order if children exist
      return true;
    });
  }, [initialOrders]);

  const filtered = useMemo(() => {
    let result = baseOrders;
    
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((o: any) => 
        o.id.toLowerCase().includes(q) ||
        o.customerSnapshot?.name?.toLowerCase().includes(q) ||
        o.customerSnapshot?.phone?.includes(q)
      );
    }
    
    if (dateRange.start) {
      result = result.filter((o: any) => {
        const d = new Date(o.createdAt);
        return d >= dateRange.start!;
      });
    }
    if (dateRange.end) {
      result = result.filter((o: any) => {
        const d = new Date(o.createdAt);
        const endDay = new Date(dateRange.end!);
        endDay.setHours(23, 59, 59, 999);
        return d <= endDay;
      });
    }

    return result;
  }, [baseOrders, search, dateRange]);

  const totalActive = baseOrders.filter((o: any) => o.status !== 'COMPLETED' && o.status !== 'DELIVERED').length;
  const totalCompleted = baseOrders.length - totalActive;

  return (
    <>
    <div className="min-h-screen bg-slate-100 rounded-3xl overflow-hidden relative border border-slate-200">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 via-purple-50/50 to-blue-50/50 opacity-50"></div>
      
      <div className="relative z-10 p-6 flex flex-col gap-6">
        <div className="bg-white/70 backdrop-blur-xl border border-white rounded-3xl p-4 shadow-sm flex flex-col lg:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-md">
              <Activity size={20} />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-widest uppercase text-slate-900">GLOBAL ORDER REGISTRY</h1>
              <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">UNIFIED PRINT OPERATIONS OVERSIGHT</p>
            </div>
          </div>
          
          <div className="flex gap-2 bg-slate-900/5 p-1 rounded-xl">
            <button className="px-4 py-1.5 rounded-lg text-[10px] font-black tracking-widest uppercase bg-white shadow-sm text-slate-900">
              GLOBAL ORDERS ({baseOrders.length})
            </button>
            <div className="flex gap-4 items-center px-4 bg-white rounded-lg shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Total</span>
                <span className="text-xs font-black">{baseOrders.length}</span>
              </div>
              <div className="w-px h-4 bg-slate-200" />
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-blue-400 uppercase">Active</span>
                <span className="text-xs font-black text-blue-600">{totalActive}</span>
              </div>
              <div className="w-px h-4 bg-slate-200" />
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-emerald-400 uppercase">Done</span>
                <span className="text-xs font-black text-emerald-600">{totalCompleted}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white/60 backdrop-blur-md rounded-2xl p-3 border border-white/80 shadow-sm flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-[300px] relative">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search manifest by ID, Customer, Phone..."
              className="w-full h-11 pl-10 pr-4 bg-white border-none rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 shadow-sm placeholder:text-slate-400 placeholder:font-medium"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="relative">
            <button 
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`px-4 h-11 bg-white border rounded text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:border-slate-900 transition-all flex items-center gap-2 ${dateRange.start || dateRange.end ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-slate-200'}`}
            >
              <Calendar size={14} />
              {dateRange.start && dateRange.end 
                ? `${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}` 
                : dateRange.start ? `From ${dateRange.start.toLocaleDateString()}`
                : dateRange.end ? `Until ${dateRange.end.toLocaleDateString()}`
                : 'Time Range'}
            </button>

            {showDatePicker && (
              <div className="absolute right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl p-4 z-50 w-72 flex flex-col gap-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Select Range</span>
                  <button onClick={() => { setDateRange({start: null, end: null}); setShowDatePicker(false); }} className="text-[10px] text-slate-400 hover:text-red-500 uppercase font-bold tracking-widest transition-colors">Clear</button>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Start Date</label>
                  <input 
                    type="date" 
                    className="w-full border border-slate-200 rounded p-2 text-sm outline-none focus:border-indigo-500"
                    value={dateRange.start ? dateRange.start.toISOString().split('T')[0] : ''}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value ? new Date(e.target.value) : null }))}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">End Date</label>
                  <input 
                    type="date" 
                    className="w-full border border-slate-200 rounded p-2 text-sm outline-none focus:border-indigo-500"
                    value={dateRange.end ? dateRange.end.toISOString().split('T')[0] : ''}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value ? new Date(e.target.value) : null }))}
                  />
                </div>
                <button 
                  onClick={() => setShowDatePicker(false)}
                  className="mt-2 w-full bg-slate-900 text-white rounded py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-colors"
                >
                  Apply Filter
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="relative z-30 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60">
          <div className="bg-white/40 rounded-2xl border border-white/60 shadow-sm overflow-hidden backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-2 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Node ID</th>
                    <th className="px-2 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Identity</th>
                    <th className="px-2 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Operational Status</th>
                    <th className="px-2 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Dispatch</th>
                    <th className="px-2 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Settlement</th>
                    <th className="px-2 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center tabular-nums">
                        <p className="text-xs font-bold text-slate-400 uppercase italic tracking-widest">No matching records found</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((order: any, index: number) => {
                      const statusKey = order.status && STATUS_CONFIG[order.status] ? order.status : 'PLACED';
                      const cfg = STATUS_CONFIG[statusKey];
                      let date = '—';
                      if (order.createdAt) {
                        const parsed = new Date(order.createdAt);
                        if (!Number.isNaN(parsed.getTime())) {
                          date = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(parsed);
                        }
                      }
                      const amount = (order.amounts?.grandTotal ?? order.grandTotal ?? 0);
                      const thumbnail = <OrderThumbnail order={order} size="sm" />;

                      return (
                        <tr key={`${order.id}-${index}`} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-2 py-3 tabular-nums">
                            <div className="flex items-center gap-2">
                              {thumbnail}
                              <div>
                                <p className="text-[11px] font-black text-slate-900 leading-none mb-0.5 font-mono">#{order.id.replace('ORD-', '')}</p>
                                <p className="text-[9px] font-bold text-slate-400 tracking-tighter uppercase">{date}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-3 tabular-nums">
                            <p className="text-xs font-bold text-slate-800 leading-none mb-0.5 max-w-[120px] truncate" title={order.customerSnapshot?.name || 'Guest'}>{order.customerSnapshot?.name || 'Guest'}</p>
                            <p className="text-[10px] font-medium text-slate-400">{order.customerSnapshot?.phone || 'No phone'}</p>
                            {order.proxyExecutor && (
                              <div className="mt-1">
                                <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-[8px] font-black text-indigo-600 uppercase tracking-widest break-all">
                                  Proxy: {(() => {
                                    const proxy = typeof order.proxyExecutor === 'string' ? JSON.parse(order.proxyExecutor) : order.proxyExecutor;
                                    return order.proxyName || proxy?.name || (proxy?.role === 'ACDEMA' ? 'AcDema Support' : 'Admin');
                                  })()}
                                </span>
                              </div>
                            )}
                            <div className="text-[9px] font-medium text-slate-500 mt-1 line-clamp-2">
                              {order.items?.map((i: any) => i.productName).join(', ') || order.workflow?.printWorkflow?.tiffFileName || 'Custom Print'}
                            </div>
                          </td>
                          <td className="px-2 py-3 tabular-nums">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-tight ${cfg.color.split(' shadow')[0]}`}>
                                  {React.isValidElement(cfg.icon) ? React.cloneElement(cfg.icon as any, { size: 10 }) : cfg.icon}
                                  {cfg.label}
                                </span>
                                {order.currentWorkflowLabel && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                                    <span className="text-[8px] text-slate-400">Current Role:</span>
                                    <span className="text-slate-700">{order.currentWorkflowLabel}</span>
                                  </span>
                                )}
                              </div>
                              <div className="mt-1">
                                  <WorkflowPipelineVisual
                                    snapshot={(() => {
                                      const dispatchMethodKey = order.dispatchInfo?.method || order.delivery?.choice || 'COUNTER';
                                      const isDeliverySkipped = ['pickup', 'transport', 'courier', 'counter'].includes((dispatchMethodKey || '').toLowerCase());
                                      if (isDeliverySkipped && order.workflowSnapshot?.steps) {
                                        return {
                                          ...order.workflowSnapshot,
                                          steps: order.workflowSnapshot.steps.filter((s: any) => s.role !== 'DELIVERY')
                                        };
                                      }
                                      return order.workflowSnapshot;
                                    })()}
                                    orderId={order.id}
                                    detailed={false}
                                  />
                                {((order.status === 'DELIVERED') || (order.workflow?.['deliveredAt']) || (order.currentWorkflowLabel === 'COMPLETED') || ((order.workflowSnapshot?.currentStepIndex ?? -1) >= (order.workflowSnapshot?.steps?.length ?? 0))) && (
                                  <div className="mt-3 rounded-md bg-emerald-50 border border-emerald-100 p-3 text-emerald-700">
                                    <p className="text-sm font-black">ORDER COMPLETED</p>
                                    <p className="text-xs">All workflow stages are completed. No further actions are required.</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-3 tabular-nums">
                            <div className="flex items-center gap-1.5">
                              <Truck size={10} className="text-slate-400" />
                              <p className="text-[10px] font-bold text-slate-600 uppercase">{order.dispatchInfo?.method || 'Standard'}</p>
                            </div>
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums">
                            <p className="text-xs font-black text-slate-900 tracking-tight">₹{amount.toLocaleString()}</p>
                            <div className="flex items-center justify-end gap-1">
                              <div className={`w-1 h-1 rounded-full ${order.paymentStatus === 'VERIFIED' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                              <p className={`text-[9px] font-black uppercase ${order.paymentStatus === 'VERIFIED' ? 'text-emerald-600' : 'text-amber-500'}`}>
                                {order.paymentStatus === 'VERIFIED' ? 'Verified' : 'Pending'}
                              </p>
                            </div>
                          </td>
                          <td className="px-2 py-3 text-center tabular-nums">
                            <div className="flex flex-col items-center gap-1.5">
                              <button
                                disabled
                                className="inline-flex items-center justify-center w-7 h-7 rounded border border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed shadow-sm"
                                title="View Order Details (Restricted)"
                              >
                                <ArrowRight size={14} />
                              </button>
                              <div className="flex flex-col gap-1 w-full max-w-[80px]">
                                {order.is_invoice_generated || order.invoice_number || order.invoice_id ? (
                                   <span
                                     className="w-full text-center text-[9px] font-black uppercase tracking-widest text-emerald-700 border border-emerald-300 bg-emerald-50 rounded py-1 inline-flex items-center justify-center gap-1 shadow-sm"
                                     title={`Invoice #${order.invoice_number || 'Generated'}`}
                                   >
                                     <CheckCircle size={9} className="text-emerald-600" />
                                     {order.invoice_number ? order.invoice_number : 'Invoiced'}
                                   </span>
                                 ) : (
                                   <button
                                     disabled={processingOrderId === order.id || modalProcessing}
                                     onClick={() => {
                                       const parentId = order.parent_order_id || order.baseOrderId;
                                       if (parentId) {
                                         const siblings = initialOrders.filter((o: any) =>
                                           o.parent_order_id === parentId || o.baseOrderId === parentId
                                         );
                                         if (siblings.length > 1) {
                                           setSiblingsModal({ orders: siblings, parentId });
                                           setSelectedSiblingIds(new Set([order.id]));
                                           return;
                                         }
                                       }
                                       handleAction(order, "invoice");
                                     }}
                                     className="w-full text-center text-[9px] font-bold uppercase tracking-widest text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:bg-indigo-100 bg-indigo-50 rounded py-1 cursor-pointer whitespace-nowrap transition-colors disabled:opacity-50"
                                     title="Generate Invoice"
                                   >
                                     {processingOrderId === order.id ? <Loader2 size={10} className="animate-spin inline mr-1" /> : null}
                                     Invoice
                                   </button>
                                 )}
                                <button
                                   disabled={processingOrderId === order.id}
                                   onClick={async () => {
                                     if (order.invoice_id) {
                                       window.location.href = `/sales/${order.invoice_id}`;
                                       return;
                                     }
                                     const refId = order.parent_order_id || order.baseOrderId || order.id;
                                     setProcessingOrderId(order.id);
                                     try {
                                       const orgId = typeof window !== 'undefined' ? localStorage.getItem("activeOrgId") : null;
                                       const headers: Record<string, string> = { "Content-Type": "application/json" };
                                       if (orgId) headers["x-organization-id"] = orgId;
                                       const res = await fetch(`/api/v1/invoices?limit=100`, { headers });
                                       if (res.ok) {
                                         const data = await res.json();
                                         const match = data.data?.find((inv: any) => inv.reference && inv.reference.includes(refId));
                                         if (match) {
                                           window.location.href = `/sales/${match.id}`;
                                           return;
                                         }
                                       }
                                     } catch (e) {
                                       console.warn("Failed lookup invoice", e);
                                     } finally {
                                       setProcessingOrderId(null);
                                     }
                                     handleAction(order, "salesReceipt");
                                   }}
                                   className="w-full text-center text-[9px] font-bold uppercase tracking-widest text-emerald-600 hover:text-emerald-700 border border-emerald-200 hover:bg-emerald-100 bg-emerald-50 rounded py-1 cursor-pointer whitespace-nowrap transition-colors disabled:opacity-50"
                                   title="Record Receipt / View Sales"
                                 >
                                   {processingOrderId === order.id ? <Loader2 size={10} className="animate-spin inline mr-1" /> : null}
                                   Receipt
                                 </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* ── Sibling Selection Modal ── */}
    {siblingsModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center">
                <FileText size={16} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-xs font-black text-slate-900 uppercase tracking-widest">Select Items to Invoice</p>
                <p className="text-[10px] text-slate-400 font-medium">Parent: {siblingsModal.parentId}</p>
              </div>
            </div>
            <button onClick={() => setSiblingsModal(null)} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors">
              <X size={14} />
            </button>
          </div>

          {/* Items list */}
          <div className="px-5 py-3 flex flex-col gap-2 max-h-72 overflow-y-auto">
            {siblingsModal.orders.map((o: any) => {
              const parsedItems = (() => { try { return typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []); } catch { return []; } })();
              const parsedAmounts = (() => { try { return typeof o.amounts === 'string' ? JSON.parse(o.amounts) : (o.amounts || {}); } catch { return {}; } })();
              const grandTotal = o.grand_total_snapshot || parsedAmounts.grandTotal || 0;
              const productName = o.productName || parsedItems[0]?.productName || 'Custom Print';
              const isSelected = selectedSiblingIds.has(o.id);
              return (
                <label key={o.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      setSelectedSiblingIds(prev => {
                        const next = new Set(prev);
                        if (next.has(o.id)) next.delete(o.id); else next.add(o.id);
                        return next;
                      });
                    }}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-800 truncate">{productName}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{o.id}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-black text-slate-900">₹{Number(grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                    <p className="text-[9px] text-slate-400 uppercase">{o.gst_type || 'GST'}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Summary footer */}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
            {(() => {
              const selectedOrders = siblingsModal.orders.filter((o: any) => selectedSiblingIds.has(o.id));
              const total = selectedOrders.reduce((sum: number, o: any) => {
                const pa = (() => { try { return typeof o.amounts === 'string' ? JSON.parse(o.amounts) : (o.amounts || {}); } catch { return {}; } })();
                return sum + Number(o.grand_total_snapshot || pa.grandTotal || 0);
              }, 0);
              return (
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500">{selectedSiblingIds.size} item{selectedSiblingIds.size !== 1 ? 's' : ''} selected</span>
                  <span className="text-sm font-black text-slate-900">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              );
            })()}
            <div className="flex gap-2">
              <button onClick={() => setSiblingsModal(null)} className="flex-1 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
              <button
                disabled={selectedSiblingIds.size === 0 || modalProcessing}
                onClick={() => {
                  const selected = siblingsModal.orders.filter((o: any) => selectedSiblingIds.has(o.id));
                  handleActionMultiple(selected, "invoice");
                }}
                className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {modalProcessing ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                Generate Invoice
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
