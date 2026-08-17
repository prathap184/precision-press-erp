'use client';

import React, { useEffect, useState } from 'react';
import { Order, OrderItem } from '@/types/models';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from '@/lib/supabase-firestore-shim';
import { normalizeTiffPathToFileUrl, openTiffInSystem, resolvePrintWorkflow } from '@/lib/tiff-utils';
import { ExternalLink, FileText, Printer, Truck, IndianRupee } from 'lucide-react';

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

  return (
    <div className={className || "space-y-8 text-slate-800"}>
      {/* Top Grid: Customer & Logistics (No separate background cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Customer Column */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Customer</h3>
            {order.proxyExecutor && (
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">
                Placed By: {order.proxyExecutor.name}
              </span>
            )}
          </div>
          
          <div className="space-y-3">
            <div className="flex h-12 w-full items-center rounded-xl bg-slate-50/80 px-4 border border-slate-200/80">
              <span className="material-symbols-outlined text-slate-400 text-lg mr-2">search</span>
              <span className="text-sm font-bold text-slate-800 w-full truncate">
                {customer?.displayName || customer?.name || 'Walk-in Customer'}
              </span>
            </div>
            
            <div className="rounded-xl bg-slate-50/80 p-3 text-xs font-medium text-slate-600 border border-slate-200/80 flex items-center gap-4">
              <span><strong className="text-slate-400 font-bold uppercase text-[10px] mr-1">Phone:</strong> {customer?.phone || 'No phone'}</span>
              <span className="border-l border-slate-200 pl-4"><strong className="text-slate-400 font-bold uppercase text-[10px] mr-1">Business:</strong> {(customer as any)?.businessName || 'No business'}</span>
            </div>
          </div>
        </div>

        {/* Logistics Column */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Logistics Configuration</h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex gap-2">
              {['PICKUP', 'DOOR', 'COURIER', 'TRANSPORT'].map((type) => {
                const isSelected = 
                  (type === 'PICKUP' && method === 'PICKUP') ||
                  (type === 'DOOR' && method === 'DOOR_DELIVERY') ||
                  (type === 'COURIER' && method === 'COURIER') ||
                  (type === 'TRANSPORT' && method === 'TRANSPORT');

                return (
                  <div
                    key={type}
                    className={`flex-1 rounded-xl py-2.5 text-center text-[10px] font-black uppercase tracking-widest transition-all ${
                      isSelected
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-50 text-slate-500 border border-slate-200/80'
                    }`}
                  >
                    {type}
                  </div>
                );
              })}
            </div>
            
            <div className="rounded-xl bg-slate-50/80 p-3 text-xs font-bold text-blue-600 border border-slate-200 border-dashed text-center uppercase">
              {delivery?.address || 'Self Pickup'}
            </div>
          </div>
        </div>
      </div>

      {/* Order Items Table Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Order Items</h3>
        </div>

      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-[#E4DECE] text-[#5C5542] border-b border-[#D4CEBE]">
              <th className="px-3 py-2 font-bold w-10 text-center border-r border-[#D4CEBE]">#</th>
              <th className="px-3 py-2 font-bold border-r border-[#D4CEBE]">NAME OF ITEM</th>
              <th className="px-3 py-2 font-bold border-r border-[#D4CEBE]">PROJECT</th>
              <th className="px-2 py-2 font-bold border-r border-[#D4CEBE] text-center">GST%</th>
              <th className="px-3 py-2 font-bold border-r border-[#D4CEBE]">WIDTH</th>
              <th className="px-3 py-2 font-bold border-r border-[#D4CEBE]">LENGTH</th>
              <th className="px-2 py-2 font-bold border-r border-[#D4CEBE] text-center">SQ.FT.</th>
              <th className="px-2 py-2 font-bold border-r border-[#D4CEBE] text-center">QTY</th>
              <th className="px-3 py-2 font-bold border-r border-[#D4CEBE] text-right">RATE/SFT</th>
              <th className="px-3 py-2 font-bold border-r border-[#D4CEBE]">FINISH</th>
              <th className="px-3 py-2 font-bold border-r border-[#D4CEBE]">FILE PATH</th>
              <th className="px-3 py-2 font-bold text-right">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {itemsLoading ? (
              <tr>
                <td colSpan={12} className="px-3 py-4 text-center text-slate-400 italic bg-white tabular-nums">Loading items...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-4 text-center text-slate-400 italic bg-white tabular-nums">No items found</td>
              </tr>
            ) : (
              items.map((item, idx) => {
                // DB stores flat: {width, height, rate, quantity, widthUnit, subTotal, eyeletType}
                // Older records may use nested specs/pricingSnapshot/materialMetadata — fallback to both
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
                  <tr key={item.id || idx} className="border-b border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-3 text-center text-slate-500 border-r border-slate-200 tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-3 font-bold text-slate-800 border-r border-slate-200 tabular-nums">{(item as any).productName || item.productName || '—'}</td>
                    <td className="px-3 py-3 text-slate-400 border-r border-slate-200 italic tabular-nums">{(item as any).projectName || item.projectName || '—'}</td>
                    <td className="px-2 py-3 text-center font-medium border-r border-slate-200 text-slate-600 tabular-nums">
                      {gstPct}
                    </td>
                    <td className="px-3 py-3 border-r border-slate-200 tabular-nums">
                      <div className="flex justify-between items-center text-slate-700">
                        <span>{w}</span>
                        <span className="text-[9px] text-slate-400 font-bold">{wUnit}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 border-r border-slate-200 tabular-nums">
                      <div className="flex justify-between items-center text-slate-700">
                        <span>{h}</span>
                        <span className="text-[9px] text-slate-400 font-bold">{hUnit}</span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center text-slate-400 border-r border-slate-200 tabular-nums">
                      {sqft}
                    </td>
                    <td className="px-2 py-3 text-center font-medium border-r border-slate-200 tabular-nums">
                      {qty}
                    </td>
                    <td className="px-3 py-3 text-right font-medium border-r border-slate-200 text-slate-600 tabular-nums">
                      {rate ? Number(rate).toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-3 border-r border-slate-200 text-slate-500 tabular-nums">
                      {eyeletType === 'NONE' ? 'None' : eyeletType || 'None'}
                    </td>
                    <td className="px-3 py-3 border-r border-slate-200 tabular-nums">
                      <div className="text-[10px] text-slate-600 font-mono break-all max-w-[300px]">
                        {filePath}
                      </div>
                      {filePath !== 'No file' && (
                        <button
                          type="button"
                          onClick={() => {
                            const isWebUrl = filePath.startsWith('/') || filePath.startsWith('http://') || filePath.startsWith('https://');
                            if (isWebUrl) {
                              window.open(filePath, '_blank');
                            } else {
                              const fileUrl = normalizeTiffPathToFileUrl(filePath);
                              openTiffInSystem(fileUrl) || window.open(fileUrl, '_blank');
                            }
                          }}
                          className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          <ExternalLink size={12} /> Open File
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-800 bg-slate-50 tabular-nums">
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
      <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Order Total: ₹{order.amounts?.grandTotal?.toLocaleString('en-IN') || '0'}
        </div>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Dense Ledger View with per-item print routing
        </div>
      </div>
    </div>
    </div>
  );
}
