'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { RoleGuard } from '@/lib/role-guard';
import { 
  Printer, 
  CheckCircle, 
  Loader2,
  Package,
  ChevronRight,
  FileType
} from 'lucide-react';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import { db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy,
  limit 
} from '@/lib/supabase-firestore-shim';
import { Order } from '@/types/models';
import { } from '@/lib/workflow';
import { STATUS_LABELS, STATUS_COLORS } from '@/types/workflow';
import { resolvePrintWorkflow } from '@/lib/tiff-utils';

export default function PrinterDashboard() {
  const { user, profile } = useAuth();
  const [jobs, setJobs] = useState<Order[]>([]); 
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Listen for recent active orders and filter client-side for precision
    const q = query(
      collection(db, 'orders'),
      where('status', 'not-in', ['COMPLETED', 'DISPATCHED', 'CANCELLED']),
      orderBy('status'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];

      orders = orders.filter(o => {
        // Normalize categories to handle ECOSOLVENT vs ECO_SOLVENT mismatches
        const normalizeCat = (cat?: string | null) => {
          let c = (cat || '').toUpperCase().replace(/[^A-Z_]/g, '').replace('ECOSOLVENT', 'ECO_SOLVENT');
          if (c === 'IDCARDS' || c === 'ID_CARDS') return 'ID_CARDS';
    if (c === 'DIGITAL' || c === 'DIGITAL_PRINT') return 'DIGITAL_PRINT';
          return c;
        };

        // Must match printer category if set (strict check)
        if (profile?.printerCategory && profile.printerCategory !== 'MAIN_PRINTER') {
          const userCat = normalizeCat(profile.printerCategory);
          const orderCat = normalizeCat(o.printerCategory);
          
          // If the order has a category, it must match.
          // If it doesn't have a category, we still need to filter it out if the user is a specific printer, 
          // but we can try to guess from paper type as a fallback.
          let finalOrderCat = orderCat;
          const firstItem = o.items?.[0] as any;
          const firstItemName = firstItem?.productName || firstItem?.name;
          if (!finalOrderCat && firstItemName) {
             const itemName = firstItemName.toLowerCase();
             if (itemName.includes('eco')) finalOrderCat = 'ECO_SOLVENT';
             else if (itemName.includes('uv')) finalOrderCat = 'UV_PRINT';
             else if (itemName.includes('sol') || itemName.includes('solvent')) finalOrderCat = 'SOLVENT_PRINT';
             else if (itemName.includes('latex')) finalOrderCat = 'LATEX_PRINT';
             else if (itemName.includes('id card') || itemName.includes('visitor pass') || itemName.includes('membership') || itemName.includes('loyalty') || itemName.includes('access card') || itemName.includes('proximity') || itemName.includes('lanyard') || itemName.includes('holder') || itemName.includes('yo-yo')) finalOrderCat = 'ID_CARDS';
        else if (itemName.includes('dig') || itemName.includes('digital') || itemName.includes('vinyl') || itemName.includes('art paper') || itemName.includes('art card') || itemName.includes('sticker paper') || itemName.includes('envelope') || itemName.includes('invitation card') || itemName.includes('menu card') || itemName.includes('calendar sheet')) finalOrderCat = 'DIGITAL_PRINT';
        else if (itemName.includes('flex')) finalOrderCat = 'FLEX_PRINT';
          }

          if (finalOrderCat !== userCat) return false;
        }
        
        // It's a job for the printer if the current role is PRINTER or status dictates it
        if (o.currentWorkflowRole === 'PRINTER') return true;
        if (o.status === 'ASSIGNED' || o.status === 'IN_PROGRESS') return true;
        
        // Check if any workflow step pending for printer
        if (o.workflowSnapshot?.steps?.some(s => s.role === 'PRINTER' && s.status === 'PENDING')) return true;

        return false;
      });

      setJobs(orders);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, profile?.printerCategory]);

  return (
    <RoleGuard allowedRoles={['PRINTER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
            <Printer size={14} />
            Live Production Queue
          </h3>
          <span className="bg-secondary/10 text-secondary px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
            {loading ? 'Polling...' : `${jobs.length} Active`}
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 space-y-4">
            <Loader2 className="animate-spin text-primary/20" size={40} />
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary/30">Syncing with server...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-surface-container-low p-20 rounded-[3rem] border border-dashed border-primary/10 flex flex-col items-center justify-center text-center space-y-6">
            <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center text-primary/20">
              <CheckCircle size={40} />
            </div>
            <div className="space-y-2">
              <h4 className="text-xl font-black text-primary italic">Queue Clear.</h4>
              <p className="text-xs font-bold text-primary/40 uppercase tracking-widest">Take a breather. New jobs appear here instantly.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const printWorkflow = resolvePrintWorkflow(job);
              return (
                <div
                  key={job.id}
                  onClick={() => router.push(`/printer/orders/${job.id}`)}
                  className="group bg-surface-container-low px-4 py-3 rounded-2xl border border-transparent hover:border-secondary transition-all hover:bg-white shadow-sm hover:shadow-md hover:shadow-secondary/5 flex justify-between items-center gap-3 cursor-pointer"
                >
                  <div className="flex gap-3 items-center flex-1 min-w-0">
                    <div className="w-14 h-14 shrink-0 overflow-hidden rounded-xl shadow-sm group-hover:shadow-md transition-all duration-300">
                      <OrderThumbnail orderId={job.id} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-40">{job.id.replace('ORD-', '').toUpperCase()}</p>
                        <span className={`px-1.5 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest border ${job.orderType === 'CREDIT' ? 'border-primary/10 text-primary/40' : 'border-secondary/20 text-secondary'}`}>
                          {job.orderType}
                        </span>
                      </div>
                      <h4 className="text-sm font-black text-primary tracking-tight leading-none mb-2 truncate">
                        {job.customerSnapshot?.displayName || job.customerSnapshot?.name || 'Unknown Customer'}
                      </h4>
                      <div className="flex gap-1.5 flex-wrap">
                        <span className="px-2 py-1 rounded-full text-[8px] font-black bg-white border border-surface-variant/10 text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[job.status] }} />
                          {STATUS_LABELS[job.status]}
                        </span>
                        <span className="px-2 py-1 rounded-full text-[8px] font-black bg-primary/5 text-primary/60 uppercase tracking-wider flex items-center gap-1">
                          <Package size={9} />
                          ₹{job.amounts?.grandTotal?.toLocaleString()}
                        </span>
                        {printWorkflow?.tiffPath && (
                          <span className="px-2 py-1 rounded-full text-[8px] font-black bg-cyan-50 text-cyan-700 border border-cyan-100 uppercase tracking-wider flex items-center gap-1">
                            <FileType size={9} />
                            TIFF READY
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-primary/40 group-hover:text-primary transition-colors shrink-0">
                    <span className="text-[9px] font-black uppercase tracking-widest">Open</span>
                    <ChevronRight size={14} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}



