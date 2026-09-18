'use client';

import React, { useEffect, useState } from 'react';
import { Order, OrderItem } from '@/types/models';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from '@/lib/supabase-firestore-shim';
import { getFileNameFromPath, normalizeTiffPathToFileUrl, openTiffInSystem, resolvePrintWorkflow, sanitizeTiffPath } from '@/lib/tiff-utils';
import { ExternalLink, FileText, Printer, Truck, IndianRupee, ChevronDown, Copy } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface OrderDetailsPanelProps {
  order: Order;
  role?: string;
  items?: OrderItem[];
  className?: string;
}

export function OrderDetailsPanel({ order, role, items: propItems, className }: OrderDetailsPanelProps) {
  const [items, setItems] = useState<OrderItem[]>(propItems || []);
  const [itemsLoading, setItemsLoading] = useState(!propItems);

  useEffect(() => {
    let parsedOrderItems: OrderItem[] = [];
    if (Array.isArray(order?.items)) {
      parsedOrderItems = order.items;
    } else if (typeof order?.items === 'string') {
      try {
        parsedOrderItems = JSON.parse(order.items);
      } catch (e) {
        console.error('Failed to parse order.items string in OrderDetailsPanel');
      }
    }

    if (propItems && propItems.length > 0) {
      // Merge with parsedOrderItems to fill any missing data (like specs, projectName)
      const mergedPropItems = propItems.map(pItem => {
        const matching = parsedOrderItems.find(o => o.id === pItem.id);
        if (matching) {
          return {
            ...matching,
            ...pItem,
            specs: typeof pItem.specs === 'object' && Object.keys(pItem.specs || {}).length > 0 ? { ...matching.specs, ...pItem.specs } : matching.specs,
            materialMetadata: typeof pItem.materialMetadata === 'object' && Object.keys(pItem.materialMetadata || {}).length > 0 ? { ...matching.materialMetadata, ...pItem.materialMetadata } : matching.materialMetadata,
            pricingSnapshot: typeof pItem.pricingSnapshot === 'object' && Object.keys(pItem.pricingSnapshot || {}).length > 0 ? { ...matching.pricingSnapshot, ...pItem.pricingSnapshot } : matching.pricingSnapshot,
            projectName: pItem.projectName || matching.projectName,
            productName: pItem.productName || matching.productName,
          } as OrderItem;
        }
        return pItem;
      });
      setItems(mergedPropItems);
      setItemsLoading(false);
      return;
    }


    if (!order?.id) return;
    let cancelled = false;
    (async () => {
      if (!propItems) setItemsLoading(true);
      try {
        console.log('OrderDetailsPanel fetching items for order:', order.id);
        const subColRef = collection(db, 'orders', order.id, 'items');
        const subSnap = await getDocs(subColRef);
        console.log('OrderDetailsPanel subSnap empty?', subSnap.empty, 'size:', subSnap.size);
        if (!cancelled) {
          if (!subSnap.empty) {
            const subItems = subSnap.docs.map(d => ({ id: d.id, ...d.data() } as OrderItem));
            const merged = subItems.map(subItem => {
              const matching = parsedOrderItems.find(o => o.id === subItem.id);
              if (matching) {
                return {
                  ...matching,
                  ...subItem,
                  specs: { ...matching.specs, ...(subItem.specs || {}) },
                  materialMetadata: { ...matching.materialMetadata, ...(subItem.materialMetadata || {}) },
                  pricingSnapshot: { ...matching.pricingSnapshot, ...(subItem.pricingSnapshot || {}) },
                  projectName: subItem.projectName || matching.projectName,
                  productName: subItem.productName || matching.productName,
                } as OrderItem;
              }
              return subItem;
            });
            setItems(merged);
          } else if (parsedOrderItems.length > 0) {
            console.log('OrderDetailsPanel using parsed order.items', parsedOrderItems.length);
            setItems(parsedOrderItems);
          } else {
            console.log('OrderDetailsPanel falling back to order_items query...');
            const q = query(collection(db, 'order_items'), where('orderId', '==', order.id));
            const snap = await getDocs(q);
            console.log('OrderDetailsPanel fallback snap empty?', snap.empty, 'size:', snap.size);
            if (!snap.empty) {
              const queryItems = snap.docs.map(d => ({ id: d.id, ...d.data() } as OrderItem));
              const merged = queryItems.map(qItem => {
                const matching = parsedOrderItems.find(o => o.id === qItem.id);
                if (matching) {
                  return {
                    ...matching,
                    ...qItem,
                    specs: { ...matching.specs, ...(qItem.specs || {}) },
                    materialMetadata: { ...matching.materialMetadata, ...(qItem.materialMetadata || {}) },
                    pricingSnapshot: { ...matching.pricingSnapshot, ...(qItem.pricingSnapshot || {}) },
                    projectName: qItem.projectName || matching.projectName,
                    productName: qItem.productName || matching.productName,
                  } as OrderItem;
                }
                return qItem;
              });
              setItems(merged);
            } else if (parsedOrderItems.length > 0) {
               setItems(parsedOrderItems);
            }
          }
        }
      } catch (err) {
        console.error('OrderDetailsPanel Error fetching items:', err);
        if (!cancelled && parsedOrderItems.length > 0) setItems(parsedOrderItems);
      } finally {
        if (!cancelled) setItemsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [order.id, order.items, propItems]);

  const customer = typeof order.customerSnapshot === 'string' ? JSON.parse(order.customerSnapshot as any) : order.customerSnapshot;
  const delivery = typeof order.delivery === 'string' ? JSON.parse(order.delivery as any) : order.delivery;
  const method = delivery?.choice || 'PICKUP';
  const notesContent = order.productionNotes || (order as any).production_notes || (order as any).notes || (order as any).customerNotes || (order as any).customer_notes || (order as any).remarks || (order as any).metadata?.notes || (order as any).metadata?.productionNotes || (order as any).additionalNotes;

  const firstItemImage = items?.[0]?.fileUrl || items?.[0]?.tiffPath || (order as any)?.tiffPath || (order as any)?.artworkUrl;
  const formattedOrderDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-GB').replace(/\//g, '-') : '17-09-2026';

  return (
    <div className={`w-full space-y-6 text-slate-800 ${className || ''}`}>
      {/* Top Row: Preview Thumbnail Image, Order # & Date, Customer Card */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-[180px_240px_1fr] xl:grid-cols-[200px_260px_1fr] items-stretch">
        {/* Box 1: Artwork / Preview Thumbnail Card */}
        <div className="relative z-10 rounded-[2rem] bg-white/60 p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 flex flex-col justify-center min-h-[120px]">
          <div className="w-full h-full rounded-[1.5rem] overflow-hidden relative bg-white flex items-center justify-center border border-slate-200/60">
            {firstItemImage && typeof firstItemImage === 'string' && /^https?:\/\//i.test(firstItemImage) ? (
              <img src={firstItemImage} className="absolute inset-0 w-full h-full object-cover" alt="Product preview" />
            ) : (
              <div className="w-full h-full bg-gradient-to-tr from-sky-400 via-amber-300 to-pink-400 flex items-center justify-center p-3 text-center">
                <span className="text-[11px] font-black uppercase text-white tracking-widest drop-shadow-xs">
                  {(order as any).orderNumber || (order as any).order_number || order.id || 'ORDER'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Box 2: Order # & Date Card */}
        <div className="relative z-10 rounded-[2rem] bg-white/60 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 flex flex-col justify-center shrink-0">
          <div className="flex items-center gap-3 justify-center">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 leading-tight">
                Order #
              </span>
              <div className="h-10 w-28 bg-slate-50 text-slate-800 font-mono font-black text-xs px-3 rounded-xl border-2 border-slate-200/80 flex items-center justify-center select-all shadow-2xs">
                {(order as any).orderNumber || (order as any).order_number || order.id || 'ORD-0001'}
              </div>
            </div>

            <div className="h-9 w-[1px] bg-slate-200/80 self-end mb-0.5" />

            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 leading-tight flex items-center justify-between gap-1">
                <span>Date</span>
              </span>
              <div className="h-10 w-28 text-center bg-slate-50 text-slate-800 font-bold text-xs px-2 rounded-xl border-2 border-slate-200/80 flex items-center justify-center tabular-nums shadow-2xs">
                {formattedOrderDate}
              </div>
            </div>
          </div>
        </div>

        {/* Box 3: Customer Card */}
        <div className="relative z-10 rounded-[2rem] bg-white/60 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Customer</h3>
            {order.proxyExecutor && (
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                Placed By: {order.proxyExecutor.name}
              </span>
            )}
          </div>
          
          <div className="space-y-2">
            <div className="flex h-10 w-full items-center rounded-xl bg-white px-3 border border-slate-200/80 shadow-2xs">
              <span className="material-symbols-outlined text-slate-400 text-base mr-2">search</span>
              <span className="text-xs font-bold text-slate-800 w-full truncate">
                {customer?.displayName || customer?.name || 'Walk-in Customer'}
              </span>
            </div>
            
            <div className="rounded-xl bg-white/80 p-2.5 text-xs font-medium text-slate-600 border border-slate-200/80 flex items-center justify-between gap-2 shadow-2xs">
              <span className="truncate"><strong className="text-slate-400 font-bold uppercase text-[10px] mr-1">Phone:</strong> {customer?.phone || 'No phone'}</span>
              <span className="border-l border-slate-200/60 pl-2 truncate"><strong className="text-slate-400 font-bold uppercase text-[10px] mr-1">Biz:</strong> {(customer as any)?.businessName || 'None'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stage Proof Photos Section (Designer, Pasting, Finishing, Dispatch, Delivery) */}
      {(() => {
        const wf = (order?.workflow || {}) as Record<string, any>;
        const dispatch = (order?.dispatchInfo || {}) as Record<string, any>;
        const proofList = [
          {
            stage: 'Design Artwork',
            url: wf.designUrl || wf.designerProofs?.[0]?.url || (typeof wf.designerProof === 'string' ? wf.designerProof : wf.designerProof?.url) || wf.artworkUrl,
            time: wf.designerProofs?.[0]?.uploadedAt || wf.designApprovedAt,
            uploader: wf.designerProofs?.[0]?.uploadedByName,
            badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
          },
          {
            stage: 'Pasting Proof',
            url: wf.pastingProofUrl || wf.pastingProof || wf.pasting_proof_url,
            time: wf.pastingProofUploadedAt || wf.pastingCompletedAt,
            uploader: wf.pastingProofUploadedBy,
            badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
          },
          {
            stage: 'Finishing Proof',
            url: wf.finishingProofUrl || wf.finishingProof || wf.finishing_proof_url,
            time: wf.finishingProofUploadedAt || wf.finishingCompletedAt,
            uploader: wf.finishingProofUploadedBy,
            badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
          },
          {
            stage: 'Dispatch Proof',
            url: wf.dispatchProofUrl || dispatch.proofUrl || (order as any).dispatch_proof_url,
            time: wf.dispatchProofUploadedAt || dispatch.dispatchedAt,
            uploader: dispatch.transporter_name,
            badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          },
          {
            stage: 'Delivery Proof',
            url: (typeof wf.deliveryProof === 'object' ? wf.deliveryProof?.url : wf.deliveryProof) || wf.deliveryProofUrl || (order as any).delivery_proof_url,
            time: typeof wf.deliveryProof === 'object' ? wf.deliveryProof?.uploadedAt : wf.deliveredAt,
            uploader: typeof wf.deliveryProof === 'object' ? wf.deliveryProof?.uploadedByName : undefined,
            badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
          },
        ].filter(p => Boolean(p.url) && typeof p.url === 'string');

        if (proofList.length === 0) return null;

        return (
          <div className="relative z-10 w-full mt-6 rounded-[2rem] bg-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-blue-600">photo_library</span>
                  Stage Proof Photos & Verification ({proofList.length})
                </h3>
                <p className="text-[10px] text-slate-500 font-bold mt-0.5">Uploaded stage photos from Pasting, Finishing, Dispatch, and Delivery</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {proofList.map((p, i) => (
                <div key={i} className="rounded-2xl bg-white/90 border border-slate-200/80 p-3 shadow-2xs space-y-2 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${p.badgeColor}`}>
                      {p.stage}
                    </span>
                    <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-black text-blue-600 hover:underline">
                      <ExternalLink size={10} /> Full
                    </a>
                  </div>
                  <div className="relative rounded-xl overflow-hidden bg-slate-100 h-44 flex items-center justify-center border border-slate-100 group">
                    <img 
                      src={p.url} 
                      alt={p.stage} 
                      className="h-full w-full object-contain transition-transform group-hover:scale-105" 
                    />
                  </div>
                  {p.time && (
                    <p className="text-[9px] text-slate-400 font-semibold truncate">
                      Uploaded: {new Date(p.time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Order Items Table Section inside Dedicated Card */}
      <div className="relative z-10 w-full mt-6 rounded-[2rem] bg-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">Order Items</h3>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[950px]">
            <thead>
              <tr className="border-b-2 border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-800">
                <th className="py-3 px-2 w-8 text-center">#</th>
                <th className="py-3 px-2">NAME OF ITEM</th>
                <th className="py-3 px-2">PROJECT <span className="normal-case font-bold text-slate-500 tracking-normal italic">(optional)</span></th>
                <th className="py-3 px-2 text-center">HSN CODE</th>
                <th className="py-3 px-2 text-center">T</th>
                <th className="py-3 px-2 text-center">GST%</th>
                <th className="py-3 px-2">WIDTH</th>
                <th className="py-3 px-2">LENGTH</th>
                <th className="py-3 px-2 text-center">SQ.FT.</th>
                <th className="py-3 px-2 text-center">PCS/NO</th>
                <th className="py-3 px-2 text-center">QTY</th>
                <th className="py-3 px-2 text-center">RATE/SFT</th>
                <th className="py-3 px-2 text-center">RATE PER</th>
                <th className="py-3 px-2">FINISH</th>
                <th className="py-3 px-2">FILE PATH <span className="normal-case font-bold text-slate-500 tracking-normal italic">(optional)</span></th>
                <th className="py-3 px-2 text-right">AMOUNT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {itemsLoading ? (
                <tr>
                  <td colSpan={16} className="py-8 text-center text-slate-500 font-bold tabular-nums">Loading items...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-8 text-center text-slate-500 font-bold tabular-nums">No items found</td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const w = (item as any).width ?? item.specs?.width ?? 0;
                  const h = (item as any).height ?? item.specs?.height ?? 0;
                  const wUnit = (item as any).widthUnit ?? item.specs?.widthUnit ?? 'FT';
                  const hUnit = (item as any).heightUnit ?? item.specs?.heightUnit ?? 'FT';
                  const qty = (item as any).quantity ?? item.specs?.quantity ?? 1;
                  const pcsNo = (item as any).pcsNo ?? (item as any).pcs_no ?? (item as any).pcs ?? (item.specs as any)?.pcsNo ?? (item as any).pieces ?? qty;
                  const hsnCode = (item as any).hsnCode ?? (item as any).hsn_code ?? (item as any).hsn ?? (item.specs as any)?.hsnCode ?? '—';
                  const billingMode = (item as any).billingMode ?? (item as any).tallyBillingMode ?? (item as any).tally_billing_mode ?? (item as any).mode ?? (item.specs as any)?.billingMode ?? 'B';
                  const itemNote = (item as any).description ?? (item as any).notes ?? (item as any).item_notes ?? (item as any).remarks ?? (item.specs as any)?.description ?? (item.specs as any)?.notes ?? '';
                  const rate = (item as any).rate ?? item.pricingSnapshot?.baseRate ?? 0;
                  const wInFt = wUnit === 'IN' ? Number(w) / 12 : (wUnit === 'MTR' ? Number(w) * 3.28084 : Number(w));
                  const hInFt = hUnit === 'IN' ? Number(h) / 12 : (hUnit === 'MTR' ? Number(h) * 3.28084 : Number(h));
                  const calculatedSqft = (wInFt > 0 && hInFt > 0) ? (wInFt * hInFt) : 0;
                  const sqft = calculatedSqft > 0
                    ? Number(calculatedSqft.toFixed(2))
                    : (item.specs?.sqft ? Number(item.specs.sqft.toFixed(2)) : '—');
                  const subTotal = (item as any).subTotal ?? item.pricingSnapshot?.subTotal ?? 0;
                  const eyeletType = (item as any).eyeletType ?? item.materialMetadata?.eyeletType ?? 'NONE';
                  const gstPct = item.pricingSnapshot?.tax ? item.pricingSnapshot.tax * 100 : 18;
                  
                  let filePath = (item as any).tiffPath || item.tiffPath || (item as any).fileUrl || item.fileUrl || '';
                  if (!filePath) {
                    const printWorkflow = resolvePrintWorkflow(order);
                    const assignment = printWorkflow?.itemAssignments?.find((a: any) => a.itemId === item.id);
                    if (assignment?.tiffPath) {
                      filePath = assignment.tiffPath;
                    } else {
                      filePath = 'No file';
                    }
                  }
                  
                  const rawUom = String((item as any).unit || (item.specs as any)?.unit || (item as any).tally_uom || 'N').trim();
                  const cleanUom = rawUom.toLowerCase().replace(/[\s\._-]/g, '');
                  const hasMultipleSizes = Boolean(
                    (Number(w) > 0 && Number(h) > 0) ||
                    (item as any).hasMultipleSizes ?? 
                    (item as any).has_multiple_sizes ?? 
                    (item.specs as any)?.hasMultipleSizes ?? 
                    (item as any).hasSingleDefaultSize ??
                    (item as any).has_single_default_size ??
                    (item.specs as any)?.hasSingleDefaultSize
                  );
                  const isModeA = billingMode === 'A';
                  const isModeB = billingMode === 'B';

                  return (
                    <tr key={item.id || idx} className="group transition-colors hover:bg-white/40">
                      <td className="py-3 px-2 text-center text-xs font-black text-slate-900 tabular-nums">{idx + 1}</td>
                      <td className="py-3 px-2 tabular-nums min-w-[170px]">
                        <div className="flex flex-col gap-1">
                          <div className="flex h-10 w-full items-center justify-between rounded-xl bg-white px-3 border border-slate-200/80 shadow-2xs">
                            <span className="text-xs font-black text-slate-900 truncate max-w-[150px]">
                              {(item as any).productName || item.productName || '—'}
                            </span>
                            <ChevronDown size={14} className="text-slate-500 shrink-0 ml-1" />
                          </div>
                          {itemNote ? (
                            <span className="text-[10px] text-slate-500 font-semibold italic truncate max-w-[170px] pl-1">
                              Note: {itemNote}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3 px-2 tabular-nums min-w-[130px]">
                        <div className="flex h-10 w-full items-center rounded-xl bg-white px-3 border border-slate-200/80 shadow-2xs">
                          <span className="text-xs font-bold text-slate-800 italic truncate">
                            {(item as any).projectName || item.projectName || 'Project (optional)'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center font-bold text-slate-700 tabular-nums text-xs">
                        {hsnCode}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-black uppercase border ${
                          isModeA 
                            ? 'bg-blue-100 text-blue-700 border-blue-300' 
                            : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                        }`}>
                          {isModeA ? 'A' : 'B'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center font-black text-slate-900 tabular-nums">
                        {gstPct}%
                      </td>
                      <td className="py-3 px-2 tabular-nums">
                        {hasMultipleSizes && Number(w) > 0 ? (
                          <div className="flex h-10 w-[84px] items-center justify-between rounded-xl bg-white px-2.5 border border-slate-200/80 shadow-2xs">
                            <span className="text-xs font-black text-slate-900">{w}</span>
                            <span className="rounded bg-blue-50 px-1 py-0.5 text-[10px] font-black uppercase text-blue-700 border border-blue-200/60">{wUnit.toLowerCase()}</span>
                          </div>
                        ) : (
                          <div className="flex h-10 w-[84px] items-center justify-center text-xs font-bold text-slate-400 bg-white/60 rounded-xl border border-slate-200/60 shadow-2xs">—</div>
                        )}
                      </td>
                      <td className="py-3 px-2 tabular-nums">
                        {hasMultipleSizes && Number(h) > 0 ? (
                          <div className="flex h-10 w-[84px] items-center justify-between rounded-xl bg-white px-2.5 border border-slate-200/80 shadow-2xs">
                            <span className="text-xs font-black text-slate-900">{h}</span>
                            <span className="rounded bg-blue-50 px-1 py-0.5 text-[10px] font-black uppercase text-blue-700 border border-blue-200/60">{hUnit.toLowerCase()}</span>
                          </div>
                        ) : (
                          <div className="flex h-10 w-[84px] items-center justify-center text-xs font-bold text-slate-400 bg-white/60 rounded-xl border border-slate-200/60 shadow-2xs">—</div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center text-xs font-black tabular-nums">
                        {hasMultipleSizes && sqft !== '—' && Number(sqft) > 0 ? sqft : <span className="text-slate-400 font-bold">—</span>}
                      </td>
                      <td className="py-3 px-2 text-center tabular-nums">
                        {isModeB && pcsNo && pcsNo !== '—' ? (
                          <div className="flex h-10 w-11 mx-auto items-center justify-center rounded-xl bg-white px-2 border border-slate-200/80 shadow-2xs">
                            <span className="text-xs font-black text-slate-900">{pcsNo}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-bold text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center tabular-nums">
                        <div className="flex h-10 min-w-[48px] px-2.5 mx-auto items-center justify-center gap-1 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                          <span className="text-xs font-black text-slate-900">{qty}</span>
                          <span className="text-[10px] font-bold text-slate-500">{isModeB ? 'sqft' : (rawUom || 'N')}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center text-xs font-bold tabular-nums">
                        {hasMultipleSizes && isModeA 
                          ? (rate ? Number(rate).toFixed(2) : '0.00') 
                          : <span className="text-slate-400 font-bold">—</span>}
                      </td>
                      <td className="py-3 px-2 text-center text-xs font-black text-slate-900 tabular-nums">
                        {hasMultipleSizes && isModeA
                          ? (typeof sqft === 'number' && rate ? `${(sqft * rate).toFixed(2)} N` : (rate ? `${Number(rate).toFixed(2)} N` : '0.00 N'))
                          : (rate ? (isModeB ? `${Number(rate).toFixed(2)} sqft` : Number(rate).toFixed(2)) : '0.00')}
                      </td>
                      <td className="py-3 px-2 tabular-nums text-center">
                        {eyeletType && eyeletType !== 'NONE' ? (
                          <div className="flex h-10 w-[88px] items-center justify-between rounded-xl bg-white px-2.5 border border-slate-200/80 shadow-2xs">
                            <span className="text-xs font-black text-slate-900 truncate">{eyeletType}</span>
                            <ChevronDown size={14} className="text-slate-500 shrink-0 ml-0.5" />
                          </div>
                        ) : (
                          <span className="text-slate-400 font-bold text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-2 tabular-nums min-w-[160px]">
                        <div className="flex h-10 w-full items-center justify-between rounded-xl bg-white px-3 border border-slate-200/80 shadow-2xs">
                          <span className="text-[11px] text-slate-900 font-bold font-mono truncate max-w-[140px] block" title={filePath}>
                            {filePath && filePath !== 'No file' ? getFileNameFromPath(filePath) : '\\\\server\\path\\file (optional)'}
                          </span>
                          {filePath && filePath !== 'No file' && (
                            <button
                              type="button"
                              onClick={async () => {
                                const cleanedPath = sanitizeTiffPath(filePath);
                                try {
                                  await navigator.clipboard.writeText(cleanedPath);
                                } catch {}
                                const isWebUrl = /^https?:\/\//i.test(cleanedPath) || cleanedPath.startsWith('/') || cleanedPath.startsWith('blob:');
                                if (isWebUrl) {
                                  window.open(cleanedPath, '_blank', 'noopener,noreferrer');
                                  toast.success('File opened in browser.');
                                } else {
                                  toast.custom(
                                    (t) => (
                                      <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-slate-900 shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-white/20 p-4 text-white`}>
                                        <div className="flex-1">
                                          <p className="text-xs font-black text-emerald-400 flex items-center gap-1">
                                            ✓ PATH COPIED TO CLIPBOARD
                                          </p>
                                          <p className="mt-1 text-[11px] text-slate-300 font-medium leading-relaxed">
                                            Press <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-cyan-300 font-mono font-bold">Win + R</kbd>, then press <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-cyan-300 font-mono font-bold">Ctrl + V</kbd> and hit <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-white font-mono font-bold">Enter</kbd> to open instantly!
                                          </p>
                                          <p className="mt-1.5 text-[9.5px] font-mono text-slate-400 truncate bg-slate-950 px-2 py-1 rounded border border-slate-800">
                                            {cleanedPath}
                                          </p>
                                        </div>
                                      </div>
                                    ),
                                    { duration: 6000 }
                                  );
                                }
                              }}
                              className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors ml-1 p-1 hover:bg-blue-50 rounded"
                              title={`Copy path & Open: ${filePath}`}
                            >
                              <Copy size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right text-sm font-black text-slate-900 tabular-nums">
                        {subTotal != null ? Number(subTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                      </td>
                    </tr>
                  );
                })
              )}

              {items.length > 0 && (
                <>
                  {/* SUB TOTAL */}
                  <tr className="border-t-2 border-slate-200 bg-slate-100/50">
                    <td className="py-1 px-2"></td>
                    <td colSpan={14} className="py-1.5 px-2 text-[10px] font-black uppercase tracking-widest text-slate-700">
                      SUB TOTAL
                    </td>
                    <td className="py-1.5 px-2 text-right font-black tabular-nums text-slate-900 text-xs">
                      {items.reduce((acc, item: any) => acc + Number(item.subTotal ?? item.pricingSnapshot?.subTotal ?? item.amount ?? 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* SGST / CGST or IGST */}
                  {Boolean((order as any).isInterstate || (order as any).is_interstate) ? (
                    <tr className="border-t border-slate-100 bg-slate-50/30 text-xs font-bold text-slate-800">
                      <td className="py-1 px-2"></td>
                      <td colSpan={14} className="py-1 px-2 font-bold text-slate-800 text-[11px]">
                        IGST
                      </td>
                      <td className="py-1 px-2 text-right font-black tabular-nums text-slate-900 text-xs">
                        {items.reduce((acc, item: any) => {
                          const base = Number(item.subTotal ?? item.pricingSnapshot?.subTotal ?? item.amount ?? 0);
                          const gstPct = item.pricingSnapshot?.tax ? item.pricingSnapshot.tax * 100 : (item as any).gstRate ? (item as any).gstRate * 100 : 18;
                          return acc + (base * (gstPct / 100));
                        }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ) : (
                    <>
                      <tr className="border-t border-slate-100 bg-slate-50/30 text-xs font-bold text-slate-800">
                        <td className="py-1 px-2"></td>
                        <td colSpan={14} className="py-1 px-2 font-bold text-slate-800 text-[11px]">
                          SGST
                        </td>
                        <td className="py-1 px-2 text-right font-black tabular-nums text-slate-900 text-xs">
                          {(items.reduce((acc, item: any) => {
                            const base = Number(item.subTotal ?? item.pricingSnapshot?.subTotal ?? item.amount ?? 0);
                            const gstPct = item.pricingSnapshot?.tax ? item.pricingSnapshot.tax * 100 : (item as any).gstRate ? (item as any).gstRate * 100 : 18;
                            return acc + (base * (gstPct / 100));
                          }, 0) / 2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                      <tr className="border-t border-slate-100 bg-slate-50/30 text-xs font-bold text-slate-800">
                        <td className="py-1 px-2"></td>
                        <td colSpan={14} className="py-1 px-2 font-bold text-slate-800 text-[11px]">
                          CGST
                        </td>
                        <td className="py-1 px-2 text-right font-black tabular-nums text-slate-900 text-xs">
                          {(items.reduce((acc, item: any) => {
                            const base = Number(item.subTotal ?? item.pricingSnapshot?.subTotal ?? item.amount ?? 0);
                            const gstPct = item.pricingSnapshot?.tax ? item.pricingSnapshot.tax * 100 : (item as any).gstRate ? (item as any).gstRate * 100 : 18;
                            return acc + (base * (gstPct / 100));
                          }, 0) / 2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </>
                  )}

                  {/* Round Off */}
                  <tr className="border-t border-slate-100 bg-slate-50/30 text-xs font-bold text-slate-800">
                    <td className="py-1 px-2"></td>
                    <td colSpan={14} className="py-1 px-2 font-bold text-slate-800 text-[11px]">
                      Round Off
                    </td>
                    <td className="py-1 px-2 text-right font-black tabular-nums text-slate-900 text-xs">
                      {(() => {
                        const sub = items.reduce((acc, item: any) => acc + Number(item.subTotal ?? item.pricingSnapshot?.subTotal ?? item.amount ?? 0), 0);
                        const tax = items.reduce((acc, item: any) => {
                          const base = Number(item.subTotal ?? item.pricingSnapshot?.subTotal ?? item.amount ?? 0);
                          const gstPct = item.pricingSnapshot?.tax ? item.pricingSnapshot.tax * 100 : (item as any).gstRate ? (item as any).gstRate * 100 : 18;
                          return acc + (base * (gstPct / 100));
                        }, 0);
                        const del = Number(delivery?.charge || (order as any).deliveryCharge || (order as any).amounts?.deliveryCharges || (method !== 'PICKUP' ? 50 : 0));
                        const raw = sub + tax + del;
                        const rounded = Math.round(raw);
                        const ro = rounded - raw;
                        return ro.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      })()}
                    </td>
                  </tr>

                  {/* TOTAL */}
                  <tr className="border-t-2 border-slate-300 bg-slate-200/60 font-black text-slate-900 text-xs">
                    <td className="py-2 px-2"></td>
                    <td colSpan={14} className="py-2 px-2 uppercase tracking-widest text-slate-900 font-extrabold">
                      TOTAL
                    </td>
                    <td className="py-2 px-2 text-right font-black tabular-nums text-slate-900 text-sm">
                      Rs. {Number(order.amounts?.grandTotal || (order.amounts as any)?.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Footer Row */}
        <div className="pt-4 mt-4 border-t border-slate-200/80 flex justify-between items-center">
          <div className="text-[11px] font-black text-slate-700 uppercase tracking-widest">
            Order Items Summary • {items?.length || 0} Items
          </div>
          <div className="text-[11px] font-black text-slate-700 uppercase tracking-widest">
            Dense Ledger View with per-item print routing
          </div>
        </div>
      </div>

      {/* Bottom 2-Column Grid: Logistics Card (Left) & Payment Terminal / Additional Notes Card (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch mt-6">
        {/* Left Box: Logistics Card */}
        <div className="w-full rounded-[2rem] bg-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Logistics</h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex gap-1.5">
              {['PICKUP', 'DOOR', 'COURIER', 'TRANSPORT'].map((type) => {
                const isSelected = 
                  (type === 'PICKUP' && method === 'PICKUP') ||
                  (type === 'DOOR' && method === 'DOOR_DELIVERY') ||
                  (type === 'COURIER' && method === 'COURIER') ||
                  (type === 'TRANSPORT' && method === 'TRANSPORT');

                return (
                  <div
                    key={type}
                    className={`flex-1 rounded-xl py-2.5 text-center text-[9.5px] font-black uppercase tracking-wider transition-all ${
                      isSelected
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-white text-slate-600 border border-slate-200/80 shadow-2xs'
                    }`}
                  >
                    {type}
                  </div>
                );
              })}
            </div>
            
            <div className="rounded-xl bg-white p-3.5 text-xs font-bold text-slate-800 border border-slate-200/80 text-center uppercase shadow-2xs truncate">
              {delivery?.address || (order as any).shippingAddress || 'Self Pickup'}
            </div>
          </div>
        </div>

        {/* Right Box: Payment Terminal & Additional Notes Card */}
        <div className="w-full rounded-[2rem] bg-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Payment Terminal</h3>
            {(order as any).paymentMode || order.paymentMethod ? (
              <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-2xs">
                {(order as any).paymentMode || order.paymentMethod}
              </span>
            ) : null}
          </div>

          <div className="space-y-3">
            {/* Additional / Customer Notes */}
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Additional Notes</span>
                <span className="material-symbols-outlined text-amber-600 text-sm">sticky_note_2</span>
              </span>
              <div className="rounded-xl bg-white p-3 border border-slate-200/80 shadow-2xs text-xs font-medium text-slate-700 leading-relaxed min-h-[50px]">
                {notesContent || 'No specific color needs or hardware requirements.'}
              </div>
            </div>

            {/* Breakdown & Grand Total */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-200/60">
              <div className="flex-1 w-full space-y-1 text-xs">
                {items?.map((item: any, idx: number) => {
                  const itemName = (item as any).productName || (item as any).specs?.material || (item as any).materialName || item.name || item.itemName || `Item ${idx + 1}`;
                  const itemBase = Number(item.subTotal || item.amount || item.price || 0);
                  const gstPct = Number(item.gst || item.gstRate || 18);
                  const gstMultiplier = gstPct > 1 ? gstPct / 100 : gstPct;
                  const itemTax = itemBase * gstMultiplier;
                  const halfGst = ((gstMultiplier * 100) / 2).toFixed(0);
                  const halfTax = itemTax / 2;

                  return (
                    <div key={idx} className="space-y-0.5">
                      <div className="flex justify-between font-bold text-slate-800 text-[11px]">
                        <span className="truncate pr-2">{itemName}</span>
                        <span>Rs. {itemBase.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center justify-between text-[9.5px] font-semibold text-slate-500">
                        <span>CGST ({halfGst}%): Rs. {halfTax.toFixed(2)} • SGST ({halfGst}%): Rs. {halfTax.toFixed(2)}</span>
                        <span>Total: Rs. {(itemBase + itemTax).toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}

                <div className="flex justify-between text-xs font-bold text-slate-600 pt-1 border-t border-slate-200/60">
                  <span>Logistics</span>
                  <span>Rs. {Number(delivery?.charge || (order as any).deliveryCharge || (order as any).amounts?.deliveryCharges || (method !== 'PICKUP' ? 50 : 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="w-full sm:w-auto shrink-0 flex flex-col justify-center items-center sm:items-end text-right pl-4 sm:border-l border-slate-200/60">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Grand Total</span>
                <span className="text-lg font-black text-slate-900 tracking-tight mt-0.5">
                  Rs. {Number(order.amounts?.grandTotal || (order.amounts as any)?.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mt-0.5">
                  {order.paymentStatus === 'PAID' ? 'Fully Paid' : 'Tax Included'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
