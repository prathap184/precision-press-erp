'use client';

import React, { useEffect, useState } from 'react';
import { Order, OrderItem } from '@/types/models';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from '@/lib/supabase-firestore-shim';
import { getFileNameFromPath, normalizeTiffPathToFileUrl, openTiffInSystem, resolvePrintWorkflow } from '@/lib/tiff-utils';
import { ExternalLink, FileText, Printer, Truck, IndianRupee, ChevronDown } from 'lucide-react';

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

  return (
    <div className={`w-full space-y-6 text-slate-800 ${className || ''}`}>
      {/* Top Grid: 3 Boxes in a Row (Customer, Logistics, Customer Notes) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Box 1: Customer Card */}
        <div className="w-full rounded-[2rem] bg-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Customer</h3>
            {order.proxyExecutor && (
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">
                Placed By: {order.proxyExecutor.name}
              </span>
            )}
          </div>
          
          <div className="space-y-3">
            <div className="flex h-12 w-full items-center rounded-xl bg-white px-4 border border-slate-200/80 shadow-2xs">
              <span className="material-symbols-outlined text-slate-400 text-lg mr-2">search</span>
              <span className="text-sm font-bold text-slate-800 w-full truncate">
                {customer?.displayName || customer?.name || 'Walk-in Customer'}
              </span>
            </div>
            
            <div className="rounded-xl bg-white/80 p-3 text-xs font-medium text-slate-600 border border-slate-200/80 flex items-center justify-between gap-2 shadow-2xs">
              <span className="truncate"><strong className="text-slate-400 font-bold uppercase text-[10px] mr-1">Phone:</strong> {customer?.phone || 'No phone'}</span>
              <span className="border-l border-slate-200/60 pl-2 truncate"><strong className="text-slate-400 font-bold uppercase text-[10px] mr-1">Biz:</strong> {(customer as any)?.businessName || 'None'}</span>
            </div>
          </div>
        </div>

        {/* Box 2: Logistics Configuration */}
        <div className="w-full rounded-[2rem] bg-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Logistics Configuration</h3>
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
            
            <div className="rounded-xl bg-white p-3 text-xs font-bold text-blue-600 border border-slate-200/80 text-center uppercase shadow-2xs truncate">
              {delivery?.address || 'Self Pickup'}
            </div>
          </div>
        </div>

        {/* Box 3: Customer Notes */}
        <div className="w-full rounded-[2rem] bg-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Customer Notes</h3>
            <span className="material-symbols-outlined text-amber-600 text-base">sticky_note_2</span>
          </div>

          <div className="flex-1 min-h-[92px] rounded-xl bg-white p-3 border border-slate-200/80 shadow-2xs flex flex-col justify-center">
            <p className={`text-xs leading-relaxed ${notesContent ? 'font-bold text-slate-900' : 'font-medium text-slate-400 italic'}`}>
              {notesContent || 'No special notes or instructions.'}
            </p>
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
                <th className="py-3 px-2 text-center">GST%</th>
                <th className="py-3 px-2">WIDTH</th>
                <th className="py-3 px-2">LENGTH</th>
                <th className="py-3 px-2 text-center">SQ.FT.</th>
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
                  <td colSpan={13} className="py-8 text-center text-slate-500 font-bold tabular-nums">Loading items...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-slate-500 font-bold tabular-nums">No items found</td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const w = (item as any).width ?? item.specs?.width ?? 0;
                  const h = (item as any).height ?? item.specs?.height ?? 0;
                  const wUnit = (item as any).widthUnit ?? item.specs?.widthUnit ?? 'FT';
                  const hUnit = (item as any).heightUnit ?? item.specs?.heightUnit ?? 'FT';
                  const qty = (item as any).quantity ?? item.specs?.quantity ?? 1;
                  const rate = (item as any).rate ?? item.pricingSnapshot?.baseRate ?? 0;
                  const sqft = (item as any).subTotal && rate
                    ? Number(((item as any).subTotal / rate).toFixed(2))
                    : item.specs?.sqft
                    ? Number(item.specs.sqft.toFixed(2))
                    : '—';
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
                  
                  return (
                    <tr key={item.id || idx} className="group transition-colors hover:bg-white/40">
                      <td className="py-3 px-2 text-center text-xs font-black text-slate-900 tabular-nums">{idx + 1}</td>
                      <td className="py-3 px-2 tabular-nums min-w-[170px]">
                        <div className="flex h-10 w-full items-center justify-between rounded-xl bg-white px-3 border border-slate-200/80 shadow-2xs">
                          <span className="text-xs font-black text-slate-900 truncate max-w-[150px]">
                            {(item as any).productName || item.productName || '—'}
                          </span>
                          <ChevronDown size={14} className="text-slate-500 shrink-0 ml-1" />
                        </div>
                      </td>
                      <td className="py-3 px-2 tabular-nums min-w-[130px]">
                        <div className="flex h-10 w-full items-center rounded-xl bg-white px-3 border border-slate-200/80 shadow-2xs">
                          <span className="text-xs font-bold text-slate-800 italic truncate">
                            {(item as any).projectName || item.projectName || 'Project (optional)'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center font-black text-slate-900 tabular-nums">
                        {gstPct}
                      </td>
                      <td className="py-3 px-2 tabular-nums">
                        <div className="flex h-10 w-[84px] items-center justify-between rounded-xl bg-white px-2.5 border border-slate-200/80 shadow-2xs">
                          <span className="text-xs font-black text-slate-900">{w}</span>
                          <span className="rounded bg-blue-50 px-1 py-0.5 text-[10px] font-black uppercase text-blue-700 border border-blue-200/60">{wUnit.toLowerCase()}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 tabular-nums">
                        <div className="flex h-10 w-[84px] items-center justify-between rounded-xl bg-white px-2.5 border border-slate-200/80 shadow-2xs">
                          <span className="text-xs font-black text-slate-900">{h}</span>
                          <span className="rounded bg-blue-50 px-1 py-0.5 text-[10px] font-black uppercase text-blue-700 border border-blue-200/60">{hUnit.toLowerCase()}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center text-xs font-black text-slate-900 tabular-nums">
                        {sqft}
                      </td>
                      <td className="py-3 px-2 text-center tabular-nums">
                        <div className="flex h-10 w-11 mx-auto items-center justify-center rounded-xl bg-white px-2 border border-slate-200/80 shadow-2xs">
                          <span className="text-xs font-black text-slate-900">{qty}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center text-xs font-black text-slate-900 tabular-nums">
                        {rate ? Number(rate).toFixed(2) : '0.00'}
                      </td>
                      <td className="py-3 px-2 text-center text-xs font-black text-slate-900 tabular-nums">
                        0.00
                      </td>
                      <td className="py-3 px-2 tabular-nums">
                        <div className="flex h-10 w-[88px] items-center justify-between rounded-xl bg-white px-2.5 border border-slate-200/80 shadow-2xs">
                          <span className="text-xs font-black text-slate-900 truncate">{eyeletType === 'NONE' ? 'None' : eyeletType || 'None'}</span>
                          <ChevronDown size={14} className="text-slate-500 shrink-0 ml-0.5" />
                        </div>
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
                                const isWebUrl = /^https?:\/\//i.test(filePath) || filePath.startsWith('/') || filePath.startsWith('blob:');
                                if (isWebUrl) {
                                  window.open(filePath, '_blank', 'noopener,noreferrer');
                                } else {
                                  try {
                                    await navigator.clipboard.writeText(filePath);
                                  } catch {}
                                  await openTiffInSystem(filePath);
                                }
                              }}
                              className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors ml-1 p-1 hover:bg-blue-50 rounded"
                              title={`Open: ${filePath}`}
                            >
                              <ExternalLink size={12} />
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

      {/* Payment Terminal Card (Wider, Slim-Height Horizontal Layout) */}
      <div className="flex justify-end mt-6">
        <div className="w-full max-w-2xl rounded-[2rem] bg-white/60 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200/60">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Payment Terminal</h3>
            {order.paymentMode && (
              <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white shadow-2xs">
                {order.paymentMode}
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            {/* Left: Itemized & Logistics Details (Compact horizontal lines) */}
            <div className="flex-1 w-full space-y-2 text-xs">
              {items?.map((item: any, idx: number) => {
                const itemName = (item as any).productName || (item as any).specs?.material || (item as any).materialName || item.name || item.itemName || `Item ${idx + 1}`;
                const itemBase = Number(item.subTotal || item.amount || item.price || 0);
                const gstPct = Number(item.gst || item.gstRate || 18);
                const gstMultiplier = gstPct > 1 ? gstPct / 100 : gstPct;
                const itemTax = itemBase * gstMultiplier;
                const halfGst = ((gstMultiplier * 100) / 2).toFixed(0);
                const halfTax = itemTax / 2;

                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between font-semibold text-slate-800">
                      <span className="truncate pr-2">{itemName}</span>
                      <span>Rs. {itemBase.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10.5px] font-medium text-slate-500">
                      <div className="flex items-center gap-2">
                        <span>CGST ({halfGst}%): Rs. {halfTax.toFixed(2)}</span>
                        <span>•</span>
                        <span>SGST ({halfGst}%): Rs. {halfTax.toFixed(2)}</span>
                      </div>
                      <span className="font-semibold text-slate-600">Item Total: Rs. {(itemBase + itemTax).toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}

              {/* Logistics */}
              <div className="flex justify-between text-xs font-semibold text-slate-600 pt-1.5 border-t border-slate-200/60">
                <span>Logistics</span>
                <span>Rs. {Number(delivery?.charge || (order as any).deliveryCharge || (order as any).amounts?.deliveryCharges || (method !== 'PICKUP' ? 50 : 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Right: Grand Total (Frameless clean semi-bold text) */}
            <div className="w-full sm:w-auto shrink-0 flex flex-col justify-center items-center sm:items-end text-right pl-6 sm:border-l border-slate-200/60">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Grand Total</span>
              <span className="text-lg font-semibold text-slate-900 tracking-tight mt-0.5">
                Rs. {Number(order.amounts?.grandTotal || order.amounts?.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[9px] font-semibold text-emerald-600 uppercase tracking-widest mt-0.5">
                {order.paymentStatus === 'PAID' ? 'Fully Paid' : 'Tax Included'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
