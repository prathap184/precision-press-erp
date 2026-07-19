'use client';

import React, { useEffect, useRef, useState } from 'react';
import { db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy,
  limit 
} from '@/lib/supabase-firestore-shim';
import { Order } from '@/types/models';
import { startWorkflowStep, advanceOrderWorkflow } from '@/lib/workflow';
import { 
  Play, 
  CheckCircle, 
  Timer, 
  ChevronRight, 
  Loader2,
  AlertCircle,
  Package,
  ArrowRight,
  ClipboardList,
  Zap
} from 'lucide-react';
import { format } from 'date-fns';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface WorkflowTaskQueueProps {
  role: string | string[];
  title: string;
  icon: React.ReactNode;
  renderActions?: (order: Order, isProcessing: boolean) => React.ReactNode;
  renderExpanded?: (order: Order) => React.ReactNode;
  onTasksChange?: (tasks: Order[]) => void;
  /** Message shown when there are no tasks in the queue */
  emptyMessage?: string;
  /** If provided, this order row will be highlighted and scrolled into view automatically */
  highlightOrderId?: string | null;
  /** If provided, clicking a row opens this href for the given order */
  orderHrefBuilder?: (order: Order) => string | null | undefined;
  /** Restrict orders to a specific printer category if role is PRINTER */
  printerCategory?: string;
}

export function WorkflowTaskQueue({ role, title, icon, renderActions, renderExpanded, onTasksChange, emptyMessage, highlightOrderId, orderHrefBuilder, printerCategory }: WorkflowTaskQueueProps) {
  const [tasks, setTasks] = useState<Order[]>([]);
  const [highlightedOrder, setHighlightedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [highlightLoadPending, setHighlightLoadPending] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const router = useRouter();

  // Auto-scroll and flash highlight the target order when tasks load
  useEffect(() => {
    if (!highlightOrderId || loading) return;
    
    // Check if the highlighted order is in tasks or fetched separately
    const isPresent = tasks.some(t => t.id === highlightOrderId) || highlightedOrder?.id === highlightOrderId;
    if (!isPresent) return;

    const el = rowRefs.current[highlightOrderId];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightOrderId, loading, tasks, highlightedOrder, renderExpanded]);

  // Fetch the specific order if highlightOrderId is provided, just in case it's not in the main query
  useEffect(() => {
    if (!highlightOrderId) {
      setHighlightedOrder(null);
      setHighlightLoadPending(false);
      return;
    }

    let isMounted = true;
    const fetchHighlight = async () => {
      setHighlightLoadPending(true);
      try {
        const { getDoc, doc, getDocs, query, where, limit } = await import('firebase/firestore');
        const loadOrder = async () => {
          const directSnap = await getDoc(doc(db, 'orders', highlightOrderId));
          if (directSnap.exists()) return { id: directSnap.id, ...directSnap.data() } as any;

          const fallbackSnap = await getDocs(query(collection(db, 'orders'), where('id', '==', highlightOrderId), limit(1)));
          if (!fallbackSnap.empty) {
            const docSnap = fallbackSnap.docs[0];
            return { id: docSnap.id, ...docSnap.data() } as any;
          }

          return null;
        };

        const orderData = await loadOrder();
        if (orderData && isMounted) {
          // Try to load items stored as a subcollection (common pattern)
          try {
            const itemsSnap = await getDocs(collection(db, 'orders', orderData.id, 'items'));
            const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (items.length) orderData.items = items;
          } catch (err) {
            // non-fatal: some orders store items inline, ignore if subcollection missing
          }

          setHighlightedOrder(orderData as Order);
        }
      } catch (err) {
        console.error('Failed to fetch highlighted order:', err);
      } finally {
        if (isMounted) setHighlightLoadPending(false);
      }
    };
    fetchHighlight();
    return () => {
      isMounted = false;
    };
  }, [highlightOrderId]);

  useEffect(() => {
    // Query tasks for this role(s) in the dynamic workflow
    const q = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];

      const selectedRoles = new Set((Array.isArray(role) ? role : [role]).map((item) => String(item).toUpperCase()));
      const matchingOrders = orders.filter((order) => {
        if (printerCategory && printerCategory !== 'MAIN_PRINTER' && selectedRoles.has('PRINTER')) {
          const normalizeCat = (cat?: string | null) => {
            let c = (cat || '').toUpperCase().replace(/[^A-Z_]/g, '').replace('ECOSOLVENT', 'ECO_SOLVENT');
            if (c === 'IDCARDS' || c === 'ID_CARDS') return 'ID_CARDS';
    if (c === 'DIGITAL' || c === 'DIGITAL_PRINT') return 'DIGITAL_PRINT';
            return c;
          };
          const userCat = normalizeCat(printerCategory);
          let orderCat = normalizeCat(order.printerCategory);
          
          if (!orderCat) {
             order.items?.some(item => {
               const i = item as any;
               const itemName = (i.productName || i.name || '').toLowerCase();
               if (itemName.includes('eco')) orderCat = 'ECO_SOLVENT';
               else if (itemName.includes('uv')) orderCat = 'UV_PRINT';
               else if (itemName.includes('sol') || itemName.includes('solvent')) orderCat = 'SOLVENT_PRINT';
               else if (itemName.includes('latex')) orderCat = 'LATEX_PRINT';
               else if (itemName.includes('id card') || itemName.includes('visitor pass') || itemName.includes('membership') || itemName.includes('loyalty') || itemName.includes('access card') || itemName.includes('proximity') || itemName.includes('lanyard') || itemName.includes('holder') || itemName.includes('yo-yo')) orderCat = 'ID_CARDS';
        else if (itemName.includes('dig') || itemName.includes('digital') || itemName.includes('vinyl') || itemName.includes('art paper') || itemName.includes('art card') || itemName.includes('sticker paper') || itemName.includes('envelope') || itemName.includes('invitation card') || itemName.includes('menu card') || itemName.includes('calendar sheet')) orderCat = 'DIGITAL_PRINT';
        else if (itemName.includes('flex')) orderCat = 'FLEX_PRINT';
               return !!orderCat;
             });
          }

          if (orderCat !== userCat) return false;
        }

        const currentRole = String(order.currentWorkflowRole || '').toUpperCase();
        if (currentRole && selectedRoles.has(currentRole)) return true;

        const snapshotSteps = order.workflowSnapshot?.steps || [];
        const currentIndex = order.workflowSnapshot?.currentStepIndex || 0;
        const currentStep = snapshotSteps[currentIndex];
        
        if (currentStep && selectedRoles.has(String(currentStep.role || '').toUpperCase())) {
          return true;
        }
        
        return false;
      });

      setTasks(matchingOrders);
      if (onTasksChange) onTasksChange(matchingOrders);
      setLoading(false);
    }, (error) => {
      console.error(`Workflow queue listener failed for role ${role}:`, error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [role, onTasksChange]);

  const handleStartStep = async (orderId: string) => {
    setProcessingId(orderId);
    try {
      await startWorkflowStep(orderId);
    } catch (error) {
      console.error('Failed to start workflow step:', error);
      alert('Error starting work. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleCompleteStep = async (orderId: string) => {
    const notes = prompt('Any production notes? (Optional)');
    setProcessingId(orderId);
    try {
      await advanceOrderWorkflow(orderId, notes || '');
    } catch (error) {
      console.error('Failed to complete workflow step:', error);
      alert('Error completing work. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const displayedTasks = tasks.length > 0
    ? tasks
    : (highlightedOrder ? [highlightedOrder] : []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
            {icon}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500">
              {displayedTasks.length} active tasks assigned to {Array.isArray(role) ? 'these departments' : 'your department'}
              {highlightOrderId && ' (Filtered)'}
            </p>
          </div>
        </div>
        {highlightOrderId && (
          <Link href="?" className="text-sm font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-4 py-2 rounded-lg transition-colors">
            Clear Filter
          </Link>
        )}
      </div>

      {displayedTasks.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
          <div className="mx-auto w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <ClipboardList className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">Queue is empty</h3>
          <p className="text-gray-500 mt-1">{emptyMessage || 'Great job! There are no orders waiting for action.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {displayedTasks.map((order) => {
            const currentStep = order.workflowSnapshot?.steps[order.workflowSnapshot.currentStepIndex];
            const isHighlighted = order.id === highlightOrderId;
            const orderHref = orderHrefBuilder?.(order) || null;
            
            return (
              <div
                key={order.id}
                ref={el => { rowRefs.current[order.id] = el; }}
                onClick={() => {
                  if (orderHref) router.push(orderHref);
                }}
                className={`group border rounded-xl overflow-hidden hover:shadow-md transition-all duration-300 bg-white ${
                  isHighlighted
                    ? 'border-indigo-300 ring-1 ring-indigo-200 shadow-sm'
                    : 'border-slate-200'
                } ${orderHref ? 'cursor-pointer' : ''}`}
              >
                {isHighlighted && renderExpanded ? (
                  <div className="p-4 bg-white" onClick={(e) => e.stopPropagation()}>
                    {renderExpanded(order)}
                  </div>
                ) : (
                  <>
                    <div 
                      className="p-4 flex items-center justify-between bg-slate-50"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0">
                          <OrderThumbnail orderId={order.id} order={order as any} size="sm" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-blue-600 tracking-wider uppercase">
                              Order #{order.id.replace('ORD-', '').toUpperCase()}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              currentStep?.status === 'IN_PROGRESS' 
                                ? 'bg-blue-100 text-blue-700' 
                              : currentStep?.status === 'PAUSED' || currentStep?.status === 'ON_HOLD'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}>
                              {currentStep?.status?.replace('_', ' ') || 'Pending'}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-gray-900 truncate">{order.customerSnapshot?.name || order.customerName || 'Unknown Customer'}</h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {renderActions ? (
                          <div onClick={(e) => e.stopPropagation()}>
                            {renderActions(order, processingId === order.id)}
                          </div>
                        ) : (
                          <>
                            {currentStep?.status === 'PENDING' && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleStartStep(order.id); }}
                                disabled={!!processingId}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                              >
                                {processingId === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                                START
                              </button>
                            )}
                            {currentStep?.status === 'IN_PROGRESS' && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleCompleteStep(order.id); }}
                                disabled={!!processingId}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-green-700 disabled:opacity-50 transition-colors"
                              >
                                {processingId === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                COMPLETE
                              </button>
                            )}
                          </>
                        )}

                      </div>
                    </div>

                    {/* Expanded Content */}
                    {renderExpanded && (
                      <div className="border-t border-slate-100 p-4 bg-white" onClick={(e) => e.stopPropagation()}>
                        {renderExpanded(order)}
                      </div>
                    )}
                  </>
                )}

                {!isHighlighted && (
                  <div className="px-5 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
                      {order.workflowSnapshot?.steps.map((step, idx) => (
                        <div key={idx} className="flex items-center shrink-0">
                          <div className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            idx === order.workflowSnapshot?.currentStepIndex
                              ? 'bg-blue-600 text-white shadow-sm'
                              : step.status === 'COMPLETED'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-400'
                          }`}>
                            {step.label}
                          </div>
                          {idx < (order.workflowSnapshot?.steps.length || 0) - 1 && (
                            <ArrowRight className="w-3 h-3 mx-2 text-gray-300" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


