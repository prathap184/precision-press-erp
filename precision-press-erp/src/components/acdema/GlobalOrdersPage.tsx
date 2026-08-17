'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getCountFromServer, limit, onSnapshot, orderBy, query, where, getDoc, doc } from '@/lib/supabase-firestore-shim';
import { db } from '@/lib/firebase';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { Order } from '@/types/models';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import { WorkflowPipelineVisual } from '@/components/orders/WorkflowPipelineVisual';
import {
  AlertCircle,
  Activity,
  ArrowRight,
  Calendar,
  CheckCircle,
  ClipboardList,
  FileText,
  Loader2,
  Package,
  Search,
  Truck,
  Filter,
  ChevronDown,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCreateDrawer } from '@/components/dashboard/create-drawer';

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

export function GlobalOrdersPage() {
  const pathname = usePathname();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [limitCount, setLimitCount] = useState(100);
  const [hasMore, setHasMore] = useState(true);
  const [totalStats, setTotalStats] = useState({ total: 0, active: 0, completed: 0 });
  const [tab, setTab] = useState<'global' | 'stage' | 'completed' | 'completed_by_me' | 'worked_by_me'>('global');
  const [dateRange, setDateRange] = useState<{ start: Date | null, end: Date | null }>({ start: null, end: null });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [parentTotals, setParentTotals] = useState<Record<string, number>>({});
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string | null>(null);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [siblingsModal, setSiblingsModal] = useState<{ orders: any[], parentId: string } | null>(null);
  const [selectedSiblingIds, setSelectedSiblingIds] = useState<Set<string>>(new Set());
  const [modalProcessing, setModalProcessing] = useState(false);
  const [invoicesList, setInvoicesList] = useState<any[]>([]);

  const fetchInvoices = async () => {
    try {
      const orgId = typeof window !== 'undefined' ? localStorage.getItem('activeOrgId') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (orgId) headers['x-organization-id'] = orgId;
      const res = await fetch('/api/v1/invoices?limit=200', { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.data)) {
          setInvoicesList(data.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch invoices list:', err);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const getInvoiceForOrder = (order: any) => {
    const directId = (order as any).invoice_id || (order as any).invoiceId;
    const directNumber = (order as any).invoice_number || (order as any).invoiceNumber;
    if (directId || directNumber) {
      return { id: directId, number: directNumber };
    }

    const cleanId = order.id.replace('ORD-', '');
    const parentId = cleanId.split('-')[0];
    const isChildOrder = cleanId.includes('-item');

    const match = invoicesList.find((inv: any) => {
      if (!inv.reference) return false;
      const ref = String(inv.reference);
      // Comma-separated list of specific order IDs (new format)
      const refParts = ref.split(',').map((r: string) => r.trim());
      // Specific match: check if this exact child order ID is in the reference
      if (refParts.includes(cleanId) || refParts.includes(order.id)) return true;
      // For standalone (non-child) orders: match by direct ID or parent ID
      if (!isChildOrder) {
        return (
          ref === parentId ||
          ref === order.id ||
          ref === cleanId ||
          ref === `ORDER #${parentId}` ||
          ref === `#${parentId}`
        );
      }
      // For child orders: only match if all parts of the reference are siblings of this order
      // (old invoices that stored only parent ID — match only if ref is purely the parent ID)
      if (ref === parentId || ref === `ORDER #${parentId}` || ref === `#${parentId}`) {
        // Old-style: parent reference only — treat as invoiced (backward compat)
        return true;
      }
      return false;
    });

    if (match) {
      return { id: match.id, number: match.number || match.invoice_number || match.code };
    }

    return null;
  };

  const { open: openDrawer } = useCreateDrawer();

  const handleInvoiceMultiple = async (ordersToProcess: any[]) => {
    try {
      if (ordersToProcess.length === 0) return;
      const firstOrder = ordersToProcess[0];
      setProcessingOrderId(firstOrder.id);
      setModalProcessing(true);
      const orgId = typeof window !== 'undefined' ? localStorage.getItem('activeOrgId') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (orgId) headers['x-organization-id'] = orgId;
      let contactId: string | undefined;
      const contactName = firstOrder.customerSnapshot?.name;
      if (contactName && contactName !== 'Guest') {
        const sr = await fetch(`/api/v1/contacts?search=${encodeURIComponent(contactName)}&limit=1`, { headers });
        if (sr.ok) { const sd = await sr.json(); if (sd.data?.length > 0) contactId = sd.data[0].id; }
        if (!contactId) {
          const cr = await fetch('/api/v1/contacts', { method: 'POST', headers, body: JSON.stringify({ name: contactName, phone: firstOrder.customerSnapshot?.phone || null, type: 'customer' }) });
          if (cr.ok) { const cd = await cr.json(); if (cd.contact) contactId = cd.contact.id; }
        }
      }

      let taxRates: any[] = [];
      try { const tr = await fetch('/api/v1/tax-rates', { headers }); if (tr.ok) { const td = await tr.json(); taxRates = td.taxRates || []; } } catch {}

      let inventory: any[] = [];
      try { const ir = await fetch('/api/v1/inventory?limit=1000', { headers }); if (ir.ok) { const id2 = await ir.json(); inventory = id2.data || []; } } catch {}

      let defaultSalesAccountId = '';
      try {
        const ar = await fetch('/api/v1/accounts?type=revenue', { headers });
        if (ar.ok) {
          const ad = await ar.json();
          const accts = ad.data || ad.accounts || [];
          const revenueAccts = accts.filter((a: any) => a.type === 'revenue');
          const salesAcc = revenueAccts.find((a: any) => a.name.toLowerCase().includes('sales') || a.name.toLowerCase().includes('revenue')) || revenueAccts[0];
          if (salesAcc) defaultSalesAccountId = salesAcc.id;
        }
      } catch {}


      const parseJson = (val: any) => { if (typeof val === 'string') { try { return JSON.parse(val); } catch { return null; } } return val; };

      const allMappedLines: any[] = [];
      let totalDeliveryCharge = 0;
      let orderDelivery: any = {};

      for (const order of ordersToProcess) {
        const parsedItems = parseJson(order.items) || (Array.isArray(order.items) ? order.items : []);
        const parsedAmounts = parseJson(order.amounts) || (order.amounts || {});
        const orderGstDecimal = ((Number(order.cgst_percentage || 0) + Number(order.sgst_percentage || 0)) || Number(order.igst_percentage || 0)) / 100;

        const mappedLines = (Array.isArray(parsedItems) ? parsedItems : []).map((i: any) => {
          const rawWidth = Number(i.specs?.width ?? i.width ?? 0);
          const rawHeight = Number(i.specs?.height ?? i.height ?? 0);
          const widthUnit = i.specs?.widthUnit ?? 'FT';
          const heightUnit = i.specs?.heightUnit ?? 'FT';
          const widthFt = widthUnit === 'IN' ? rawWidth / 12 : rawWidth;
          const heightFt = heightUnit === 'IN' ? rawHeight / 12 : rawHeight;
          const qty = Number(i.specs?.quantity ?? i.quantity ?? 1);
          const pricingSnap = parseJson(i.pricingSnapshot ?? i.pricing_snapshot) || {};
          const eyeletType = pricingSnap.selectedEyeletType ?? 'NONE';
          const eyeletRate = Number(pricingSnap.eyeletRate ?? 0);
          const eyeletCount = eyeletType !== 'NONE' ? qty : 0;
          const finishAmount = (eyeletCount * eyeletRate).toFixed(2);
          let gstDecimal = Number(pricingSnap.tax ?? 0);
          if (gstDecimal === 0 && orderGstDecimal > 0) gstDecimal = orderGstDecimal;
          else if (gstDecimal === 0) gstDecimal = 0.18;
          const gstBasisPts = Math.round(gstDecimal * 10000);
          const matchedTax = taxRates.find((t: any) => t.rate === gstBasisPts);
          const matchedInventory = inventory.find((inv: any) => inv.name.toLowerCase() === (i.productName || '').toLowerCase());
          let desc = i.productName || 'Custom Print';
          if (widthFt > 0 && heightFt > 0) desc += ` (${widthFt} FT x ${heightFt} FT)`;
          if (eyeletCount > 0) desc += ` + ${eyeletCount} ${eyeletType.toLowerCase()} eyelets`;
          const baseRate = parseFloat((pricingSnap.baseRate ?? i.unitPrice ?? i.price ?? i.rate ?? 0).toString()) || 0;
          const totalFinish = parseFloat(finishAmount || '0');
          return { description: desc, quantity: qty.toString(), unitPrice: baseRate.toFixed(2), accountId: defaultSalesAccountId, taxRateId: matchedTax?.id ?? '', inventoryItemId: matchedInventory?.id ?? '', width: widthFt > 0 ? widthFt.toString() : '', length: heightFt > 0 ? heightFt.toString() : '', sqFt: widthFt > 0 && heightFt > 0 ? (widthFt * heightFt).toFixed(2) : '', finishAmount: totalFinish > 0 ? totalFinish.toFixed(2) : '' };
        });

        if (mappedLines.length === 0) {
          mappedLines.push({ description: 'Custom Print Order', quantity: '1', unitPrice: (parsedAmounts.grandTotal ?? order.grandTotal ?? 0).toString(), accountId: defaultSalesAccountId, taxRateId: '', inventoryItemId: '', width: '', length: '', sqFt: '', finishAmount: '' });
        }
        allMappedLines.push(...mappedLines);

        totalDeliveryCharge += Number(order.allocated_logistics_amount ?? parsedAmounts.transport ?? parsedAmounts.deliveryCharges ?? 0);

        if (Object.keys(orderDelivery).length === 0 && order.delivery) {
          try { orderDelivery = typeof order.delivery === 'string' ? JSON.parse(order.delivery) : order.delivery; } catch {}
        }
      }

      if (totalDeliveryCharge > 0) allMappedLines.push({ description: 'Logistics / Shipping', quantity: '1', unitPrice: totalDeliveryCharge.toFixed(2), accountId: defaultSalesAccountId, taxRateId: '', inventoryItemId: '', width: '', length: '', sqFt: '', finishAmount: '' });

      // Use specific invoiced order IDs as reference (comma-separated) so only selected items are marked invoiced
      const specificRef = ordersToProcess.map((o: any) => o.id.replace('ORD-', '')).join(',');
      openDrawer('invoice', { reference: specificRef, contactId, lines: allMappedLines, deliveryMode: orderDelivery.choice || undefined, deliveryAddress: orderDelivery.address || undefined });
      setSiblingsModal(null);
      setTimeout(() => fetchInvoices(), 3000);
    } catch (err) {
      console.error('Failed to generate invoice', err);
      openDrawer('invoice', { reference: ordersToProcess[0]?.id });
    } finally {
      setProcessingOrderId(null);
      setModalProcessing(false);
    }
  };

  const handleReceipt = async (order: any) => {
    try {
      setProcessingOrderId(order.id);
      const contactName = order.customerSnapshot?.name || 'Guest';
      const amount = order.amounts?.grandTotal ?? (order as any).grandTotal ?? (order as any).grand_total_snapshot ?? 0;
      
      openDrawer('customerCredit', {
        contactName,
        amount: amount.toString(),
        notes: `Receipt for Order #${order.id.replace('ORD-', '')}`,
        reference: order.id
      });
    } catch (err) {
      console.error('Failed to open receipt', err);
    } finally {
      setProcessingOrderId(null);
    }
  };

  const ALL_WORKFLOW_ROLES = [
    { id: 'ACCOUNTANT', label: 'Accounts Approval', color: 'bg-teal-100' },
    { id: 'DESIGNER',   label: 'Design & Artwork',  color: 'bg-purple-100' },
    { id: 'MANAGER',    label: 'Manager Sign-Off',  color: 'bg-blue-100' },
    { id: 'PRINTER',    label: 'Printing',          color: 'bg-orange-100' },
    { id: 'PASTING',    label: 'Pasting',           color: 'bg-amber-100' },
    { id: 'FINISHING',  label: 'Finishing',         color: 'bg-lime-100' },
    { id: 'DISPATCH',   label: 'Dispatch',          color: 'bg-cyan-100' },
    { id: 'DELIVERY',   label: 'Delivery',          color: 'bg-green-100' },
  ];

  const searchParams = useSearchParams();
  const highlightParam = searchParams.get('highlight');

  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined' && highlightParam) {
      setHighlightedIds(highlightParam.split(','));

      // Use Next.js router to clear the query param without reloading
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('highlight');
      router.replace(newUrl.pathname + newUrl.search, { scroll: false });

      setTimeout(() => {
        setHighlightedIds([]);
      }, 10000);
    }
  }, [highlightParam, router]);

  // Robust auto-scroll when orders load
  useEffect(() => {
    if (highlightedIds.length > 0) {
      const firstId = highlightedIds[0];
      let attempts = 0;
      let interval: NodeJS.Timeout;

      const tryScroll = () => {
        const row = document.getElementById(`order-row-${firstId}`);
        if (row) {
          // Add a slight delay to ensure browser paints before scrolling
          setTimeout(() => {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
          clearInterval(interval);
        } else if (attempts > 50) { // 50 * 200ms = 10 seconds timeout
          clearInterval(interval);
        }
        attempts++;
      };

      interval = setInterval(tryScroll, 200);
      tryScroll(); // Initial try

      return () => clearInterval(interval);
    }
  }, [highlightedIds, orders]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const totalSnap = await getCountFromServer(collection(db, 'orders'));
        const activeQ = query(collection(db, 'orders'), where('status', 'not-in', ['COMPLETED', 'DISPATCHED', 'CANCELLED', 'DELIVERED']));
        const activeSnap = await getCountFromServer(activeQ);
        const completedQ = query(collection(db, 'orders'), where('status', 'in', ['COMPLETED', 'DISPATCHED', 'DELIVERED']));
        const completedSnap = await getCountFromServer(completedQ);
        setTotalStats({
          total: totalSnap.data().count,
          active: activeSnap.data().count,
          completed: completedSnap.data().count,
        });
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    };

    fetchStats();
  }, []);

  useEffect(() => {
    let q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(limitCount));

    if (dateRange.start) {
      q = query(q, where('createdAt', '>=', dateRange.start.toISOString()));
    }
    if (dateRange.end) {
      const endOfDay = new Date(dateRange.end);
      endOfDay.setHours(23, 59, 59, 999);
      q = query(q, where('createdAt', '<=', endOfDay.toISOString()));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Order[];
      // Collect all IDs that appear as a parent/base in any child order
      const parentOrderIdSet = new Set(
        allOrders
          .map(o => {
            const wf = (() => { try { return typeof (o as any).workflow === 'string' ? JSON.parse((o as any).workflow) : ((o as any).workflow || {}); } catch { return {}; } })();
            return (o as any).parent_order_id || (o as any).baseOrderId || wf?.baseOrderId;
          })
          .filter(Boolean)
      );
      const visible = allOrders.filter(o => {
        // baseOrderId lives inside workflow{} in Firestore for child orders
        const wfObj = (() => { try { return typeof (o as any).workflow === 'string' ? JSON.parse((o as any).workflow) : ((o as any).workflow || {}); } catch { return {}; } })();
        const parentId = (o as any).parent_order_id || (o as any).baseOrderId || wfObj?.baseOrderId;
        const hasParent = !!parentId;
        // This order is referenced as a parent by at least one child
        const isUmbrellaParent = parentOrderIdSet.has(o.id);
        
        // Check groupOrderIds on the workflow (the parent stores child IDs here)
        const hasGroupChildren = Array.isArray(wfObj?.groupOrderIds) && wfObj.groupOrderIds.length > 0;
        
        if (hasParent) return true;                           // always show child orders
        if (isUmbrellaParent || hasGroupChildren) return false; // hide parent orders
        return true;                                           // standalone order — show
      });
      setOrders(visible);
      setHasMore(snapshot.docs.length === limitCount);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [limitCount, dateRange]);

  // Fetch parent order grandTotal for child orders (child amounts are zeroed)
  useEffect(() => {
    const fetchParentTotals = async () => {
      const missingBaseIds = orders
        .map(o => (o as any).parent_order_id || (o as any).baseOrderId)
        .filter((id): id is string => !!id && !parentTotals[id]);

      if (missingBaseIds.length === 0) return;

      const uniqueBaseIds = Array.from(new Set(missingBaseIds));
      const newTotals = { ...parentTotals };

      await Promise.all(uniqueBaseIds.map(async (baseId) => {
        try {
          const snap = await getDoc(doc(db, 'orders', baseId));
          if (snap.exists()) {
            const data = snap.data();
            newTotals[baseId] = data?.amounts?.grandTotal ?? 0;
          }
        } catch (e) {
          console.error(e);
        }
      }));

      setParentTotals(newTotals);
    };
    fetchParentTotals();
  }, [orders]);

  const auth = useAuth();
  const viewerRoles = auth?.roles || [];
  const viewerUid = auth?.profile?.uid || auth?.user?.uid || '';

  const operationalRoles = React.useMemo(() => {
    return viewerRoles.filter(r => r !== 'ADMIN' && r !== 'SUPER_ADMIN' && r !== 'ACDEMA');
  }, [viewerRoles]);

  const stageOrders = React.useMemo(() => {
    return orders.filter((order) => {
      if (!order.status || ['COMPLETED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'].includes(order.status.toUpperCase())) return false;

      const currentStep = order.workflowSnapshot?.steps?.[order.workflowSnapshot?.currentStepIndex ?? 0];
      if (!currentStep || currentStep.status === 'COMPLETED') return false;

      const currentRole = (order.currentWorkflowRole || currentStep?.role || '').toUpperCase();
      if (!currentRole) return false;

      const includedByUserRole = viewerRoles.includes(currentRole as any);
      const includedByDirectAssignment = viewerUid && order.workflow?.assignedTo === viewerUid;
      const includedByProxyAssignment = viewerUid && order.proxyExecutor?.uid === viewerUid;

      return includedByUserRole || includedByDirectAssignment || includedByProxyAssignment;
    });
  }, [orders, viewerUid, viewerRoles]);

  const completedStageOrders = React.useMemo(() => {
    return orders.filter((order) => {
      const completedByStep = (order.workflowSnapshot?.steps || []).some(
        (s) => {
          const isUserCompleted = s.completedBy === viewerUid || (s.history || []).some((h) => h.by === viewerUid && h.status === 'COMPLETED');
          const isRoleCompleted = s.status === 'COMPLETED' && operationalRoles.includes(s.role as any);
          return isUserCompleted || isRoleCompleted;
        }
      );
      const completedByCustom =
        (order as any).dispatchCompletedBy === viewerUid ||
        (order.dispatchInfo as any)?.dispatchedBy === viewerUid ||
        (order.workflow?.['deliveredAt'] && order.workflowSnapshot?.steps?.some(s => s.role === 'DELIVERY' && s.completedBy === viewerUid));
      return completedByStep || completedByCustom;
    });
  }, [orders, viewerUid, operationalRoles]);

  const completedByMeOrders = React.useMemo(() => {
    return orders.filter((order) => {
      const completedByStep = (order.workflowSnapshot?.steps || []).some(
        (s) => s.completedBy === viewerUid || (s.history || []).some((h) => h.by === viewerUid && h.status === 'COMPLETED')
      );
      const completedByCustom =
        (order as any).dispatchCompletedBy === viewerUid ||
        (order.dispatchInfo as any)?.dispatchedBy === viewerUid ||
        (order.workflow?.['deliveredAt'] && order.workflowSnapshot?.steps?.some(s => s.role === 'DELIVERY' && s.completedBy === viewerUid));
      return completedByStep || completedByCustom;
    });
  }, [orders, viewerUid]);

  const workedByMeOrders = React.useMemo(() => {
    const matched = orders.filter((order) => {
      const workedInSteps = (order.workflowSnapshot?.steps || []).some(
        (s: any) => s.assignedTo === viewerUid || s.completedBy === viewerUid || (s.history || []).some((h: any) => h.by === viewerUid)
      );
      const isCreator = order.createdBy === viewerUid;
      const workedCustom = (order as any).dispatchCompletedBy === viewerUid || (order.dispatchInfo as any)?.dispatchedBy === viewerUid;
      return workedInSteps || isCreator || workedCustom;
    });

    // Sort by latest action by this user
    return matched.slice().sort((a, b) => {
      const getLatestActionTime = (o: Order) => {
        let maxTime = 0;
        if (o.createdBy === viewerUid && o.createdAt) {
          const ct = typeof o.createdAt === 'string' ? new Date(o.createdAt).getTime() : (o.createdAt as any).seconds ? (o.createdAt as any).seconds * 1000 : 0;
          if (ct > maxTime) maxTime = ct;
        }
        (o.workflowSnapshot?.steps || []).forEach((s: any) => {
          (s.history || []).forEach((h: any) => {
            if (h.by === viewerUid && (h.at || h.timestamp)) {
              const val = h.at || h.timestamp;
              const t = typeof val === 'string' ? new Date(val).getTime() : val.seconds ? val.seconds * 1000 : 0;
              if (t > maxTime) maxTime = t;
            }
          });
        });
        return maxTime;
      };
      return getLatestActionTime(b) - getLatestActionTime(a);
    });
  }, [orders, viewerUid]);

  const activeOrders = React.useMemo(() => {
    if (tab === 'stage') return stageOrders;
    if (tab === 'completed') return completedStageOrders;
    if (tab === 'completed_by_me') return completedByMeOrders;
    if (tab === 'worked_by_me') return workedByMeOrders;
    return orders;
  }, [tab, orders, stageOrders, completedStageOrders, completedByMeOrders, workedByMeOrders]);

  const isViewerAdmin = viewerRoles.includes('ADMIN') || viewerRoles.includes('SUPER_ADMIN');
  const roleFilterOptions = isViewerAdmin
    ? ALL_WORKFLOW_ROLES
    : ALL_WORKFLOW_ROLES.filter(r => viewerRoles.includes(r.id as any));

  const filtered = activeOrders.filter((order) => {
    // Role stage filter
    if (selectedRoleFilter) {
      const currentStep = order.workflowSnapshot?.steps?.[order.workflowSnapshot?.currentStepIndex ?? 0];
      const currentRole = (order.currentWorkflowRole || currentStep?.role || '').toUpperCase();
      if (currentRole !== selectedRoleFilter || order.status === 'CANCELLED') return false;
    }
    const matchesSearch =
      order.id.toLowerCase().includes(search.toLowerCase()) ||
      order.status?.toLowerCase().includes(search.toLowerCase()) ||
      order.currentWorkflowLabel?.toLowerCase().includes(search.toLowerCase()) ||
      order.customerSnapshot?.name?.toLowerCase().includes(search.toLowerCase()) ||
      order.customerSnapshot?.phone?.toLowerCase().includes(search.toLowerCase());
    const isOwnedByAcdema = viewerUid && (order.createdBy === viewerUid || order.proxyExecutor?.uid === viewerUid);
    const isAdmin = viewerRoles.includes('ADMIN') || viewerRoles.includes('SUPER_ADMIN');
    if (isAdmin) return matchesSearch;
    if (viewerRoles.includes('ACDEMA')) {
      if (tab === 'global') return matchesSearch;
      const acdemaDefaults = ['ACCOUNTANT', 'DESIGNER', 'MANAGER'];
      const extra = viewerRoles.filter(r => r !== 'ACDEMA');
      const allowed = new Set([...acdemaDefaults, ...extra]);
      const currentRole = order.currentWorkflowRole || order.currentWorkflowLabel;
      const isAllowedStage = !!currentRole && allowed.has(currentRole as any);
      return matchesSearch && (isOwnedByAcdema || isAllowedStage);
    }
    return matchesSearch;
  });

  return (
    <RoleGuard allowedRoles={['ACDEMA', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="font-sans text-slate-800 bg-[#d4d4d8] -m-4 p-4 md:-m-6 md:p-6 lg:-m-8 lg:p-8 relative z-10 min-h-[calc(100vh-4rem)] rounded-none">
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {/* Grid Pattern */}
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
          <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] opacity-40"></div>

          {/* Abstract Shapes */}
          <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-blue-400/40 blur-[140px] pointer-events-none animate-pulse"></div>
          <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-fuchsia-400/40 blur-[140px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>
          <div className="absolute top-[20%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-cyan-400/30 blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '4s' }}></div>
        </div>

        <div className="w-full relative z-10">
          <section className="relative z-50 rounded-2xl bg-white/50 px-3.5 py-1.5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] backdrop-blur-2xl border border-white/60 mb-3 flex items-center justify-between gap-3 overflow-x-auto scrollbar-hide">
            {/* LEFT: TITLE */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="p-1.5 bg-slate-900 rounded-lg text-white">
                <ClipboardList size={14} />
              </div>
              <div>
                <h1 className="text-xs font-bold text-slate-900 tracking-tight leading-tight whitespace-nowrap">Global Order Registry</h1>
              </div>
            </div>

            {/* CENTER: SINGLE LINE COMPACT TABS */}
            <div className="flex items-center gap-1 bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/80 flex-shrink-0">
              <button
                type="button"
                onClick={() => setTab('global')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold tracking-normal whitespace-nowrap transition ${
                  tab === 'global' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <ClipboardList size={12} /> Global ({totalStats.total || orders.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('stage')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold tracking-normal whitespace-nowrap transition ${
                  tab === 'stage' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <AlertCircle size={12} /> At My Stage ({stageOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('completed')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold tracking-normal whitespace-nowrap transition ${
                  tab === 'completed' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <CheckCircle size={12} /> Completed Stage ({completedStageOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('completed_by_me')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold tracking-normal whitespace-nowrap transition ${
                  tab === 'completed_by_me' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <CheckCircle size={12} /> By Me ({completedByMeOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('worked_by_me')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold tracking-normal whitespace-nowrap transition ${
                  tab === 'worked_by_me' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Activity size={12} /> Recent ({workedByMeOrders.length})
              </button>
            </div>

            {/* RIGHT: INLINE METRICS */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="bg-white px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-slate-200/60 shadow-sm text-xs font-bold text-slate-700">
                <Package size={12} className="text-slate-500" />
                <span className="text-[10px] text-slate-400 font-semibold uppercase">Total</span>
                <span className="text-slate-900">{totalStats.total}</span>
              </div>
              <div className="bg-white px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-slate-200/60 shadow-sm text-xs font-bold text-indigo-700">
                <Activity size={12} className="text-indigo-500" />
                <span className="text-[10px] text-indigo-400 font-semibold uppercase">Active</span>
                <span>{totalStats.active}</span>
              </div>
              <div className="bg-white px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-slate-200/60 shadow-sm text-xs font-bold text-emerald-700">
                <CheckCircle size={12} className="text-emerald-500" />
                <span className="text-[10px] text-emerald-400 font-semibold uppercase">Done</span>
                <span>{totalStats.completed}</span>
              </div>
            </div>
          </section>

        <div className="relative z-40 rounded-2xl bg-white/50 px-3.5 py-1.5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] backdrop-blur-2xl border border-white/60 mb-3 flex gap-2.5 items-center">
          <div className="flex-1 relative group">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search manifest by ID, Customer, Phone..."
              className="w-full h-8 bg-white border border-slate-200 rounded-lg pl-9 pr-3 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-600 transition-all shadow-sm"
            />
          </div>

          {/* Role Stage Filter */}
          {roleFilterOptions.length > 0 && (
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setRoleDropdownOpen(v => !v)}
                onBlur={() => setTimeout(() => setRoleDropdownOpen(false), 150)}
                className={`h-8 flex items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-all ${
                  selectedRoleFilter
                    ? 'border-blue-400 bg-blue-600 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <Filter size={12} />
                {selectedRoleFilter
                  ? (ALL_WORKFLOW_ROLES.find(r => r.id === selectedRoleFilter)?.label ?? selectedRoleFilter)
                  : 'All Stages'}
                <ChevronDown size={11} className={`transition-transform ${roleDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {roleDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-[9999] w-52 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Filter by Stage</p>
                  </div>
                  <div className="p-1.5 space-y-0.5">
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); setSelectedRoleFilter(null); setRoleDropdownOpen(false); }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left transition-colors ${
                        !selectedRoleFilter ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
                      All Stages
                      <span className="ml-auto text-xs font-bold opacity-60">{activeOrders.length}</span>
                    </button>
                    {roleFilterOptions.map(roleOpt => {
                      const count = activeOrders.filter(o => {
                        const step = o.workflowSnapshot?.steps?.[o.workflowSnapshot?.currentStepIndex ?? 0];
                        const cr = (o.currentWorkflowRole || step?.role || '').toUpperCase();
                        return cr === roleOpt.id && o.status !== 'CANCELLED';
                      }).length;
                      return (
                        <button
                          key={roleOpt.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); setSelectedRoleFilter(roleOpt.id); setRoleDropdownOpen(false); }}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left transition-colors ${
                            selectedRoleFilter === roleOpt.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedRoleFilter === roleOpt.id ? 'bg-white' : roleOpt.color}`} />
                          {roleOpt.label}
                          {count > 0 && (
                            <span className={`ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full ${
                              selectedRoleFilter === roleOpt.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>{count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="relative flex-shrink-0">
            <button 
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`px-2.5 h-8 bg-white border rounded-lg text-xs font-semibold text-slate-700 hover:border-slate-300 transition-all flex items-center gap-1.5 ${dateRange.start || dateRange.end ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-slate-200'}`}
            >
              <Calendar size={12} />
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
                  <button onClick={() => { setDateRange({start: null, end: null}); setShowDatePicker(false); }} className="text-xs text-slate-400 hover:text-red-500 font-bold transition-colors">Clear</button>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Start Date</label>
                  <input 
                    type="date" 
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500"
                    value={dateRange.start ? dateRange.start.toISOString().split('T')[0] : ''}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value ? new Date(e.target.value) : null }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">End Date</label>
                  <input 
                    type="date" 
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500"
                    value={dateRange.end ? dateRange.end.toISOString().split('T')[0] : ''}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value ? new Date(e.target.value) : null }))}
                  />
                </div>
                <button 
                  onClick={() => setShowDatePicker(false)}
                  className="mt-1 w-full bg-slate-900 text-white rounded-lg py-2 text-xs font-bold hover:bg-slate-800 transition-colors"
                >
                  Apply Filter
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="relative z-30 rounded-3xl bg-white/30 p-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.02)] backdrop-blur-2xl border border-white/50">
          <div className="bg-white/20 rounded-2xl border border-white/40 shadow-sm overflow-hidden backdrop-blur-xl">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                 <thead>
                  <tr className="bg-white/40 border-b border-white/60 backdrop-blur-md">
                    <th className="px-3 py-2.5 text-slate-800 text-xs font-bold uppercase tracking-wider text-left w-[145px]">Node ID</th>
                    <th className="px-3 py-2.5 text-slate-800 text-xs font-bold uppercase tracking-wider text-left w-[280px]">Identity</th>
                    <th className="px-3 py-2.5 text-slate-800 text-xs font-bold uppercase tracking-wider text-left">Operational Status</th>
                    <th className="px-4 py-2.5 text-slate-800 text-xs font-bold uppercase tracking-wider text-right w-[110px]">Settlement</th>
                    <th className="px-3 py-2.5 text-slate-800 text-xs font-bold uppercase tracking-wider text-center w-[180px]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y-0">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center tabular-nums">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Synchronizing Registry...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center tabular-nums">
                        <p className="text-xs font-bold text-slate-400 uppercase italic tracking-widest">No matching records found</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((order, idx) => {
                      const statusKey = order.status && STATUS_CONFIG[order.status] ? order.status : 'PLACED';
                      const cfg = STATUS_CONFIG[statusKey];
                      let date = '—';
                      if (order.createdAt) {
                        const parsed = (order.createdAt as any).seconds ? new Date((order.createdAt as any).seconds * 1000) : new Date(order.createdAt as any);
                        if (!Number.isNaN(parsed.getTime())) {
                          date = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(parsed);
                        }
                      }
                      const baseOrderId = (order as any).parent_order_id || (order as any).baseOrderId;
                      const amount = order.amounts?.grandTotal ?? (order as any).grandTotal ?? (order as any).grand_total_snapshot ?? 0;
                      const currentStep = order.workflowSnapshot?.steps?.[order.workflowSnapshot?.currentStepIndex ?? -1];
                      const isDesignerStepActive = currentStep?.role === 'DESIGNER';
                      const thumbnail = <OrderThumbnail orderId={order.id} order={order as any} size="sm" />;
                      const isHighlighted = highlightedIds.includes(order.id);

                      const cleanId = order.id.replace('ORD-', '');
                      const parentOrderNum = cleanId.split('-')[0];

                      let groupIdx = 0;
                      let lastParent = "";
                      for (let i = 0; i <= idx; i++) {
                        const p = filtered[i].id.replace('ORD-', '').split('-')[0];
                        if (i > 0 && p !== lastParent) {
                          groupIdx++;
                        }
                        lastParent = p;
                      }

                      const nextOrder = filtered[idx + 1];
                      const nextParentNum = nextOrder ? nextOrder.id.replace('ORD-', '').split('-')[0] : null;
                      const isLastItemOfGroup = idx === filtered.length - 1 || nextParentNum !== parentOrderNum;

                      const isFirstOfGroup = idx === 0 || filtered[idx - 1].id.replace('ORD-', '').split('-')[0] !== parentOrderNum;
                      const isEvenGroup = groupIdx % 2 === 0;
                      const rowBg = isEvenGroup ? 'bg-white/30 hover:bg-white/50 backdrop-blur-md' : 'bg-white/10 hover:bg-white/30 backdrop-blur-md';
                      const tdBorder = isLastItemOfGroup
                        ? 'border-b-[3px] border-white shadow-[0_1px_4px_rgba(255,255,255,0.5)]'
                        : 'border-b-0';

                      const isOrderCompleted = (order.status === 'DELIVERED') || 
                        Boolean(order.workflow?.['deliveredAt']) || 
                        (order.currentWorkflowLabel === 'COMPLETED') || 
                        ((order.workflowSnapshot?.currentStepIndex ?? -1) >= (order.workflowSnapshot?.steps?.length ?? 0));

                      return (
                        <React.Fragment key={order.id}>
                          <tr id={`order-row-${order.id}`} className={`${isHighlighted ? 'bg-indigo-50/90 shadow-inner transition-all duration-1000' : rowBg + ' transition-colors'} group`}>
                            <td className={`px-3 py-1.5 align-middle text-left tabular-nums ${tdBorder}`}>
                              <div className="flex items-center gap-2">
                                <div className="relative shrink-0">
                                  {isDesignerStepActive ? (
                                    <Link 
                                      href={`/designer/orders/${order.id}?returnTo=/acdema/orders`}
                                      className="hover:brightness-90 transition-all cursor-pointer block"
                                      title="Open creative studio workstation"
                                    >
                                      {thumbnail}
                                    </Link>
                                  ) : (
                                    thumbnail
                                  )}
                                  {isOrderCompleted && (
                                    <div className="absolute inset-0 bg-emerald-950/20 backdrop-blur-[0.5px] rounded-lg flex items-center justify-center pointer-events-none">
                                      <span className="border border-emerald-400/80 bg-emerald-600/90 text-white text-[7px] font-black uppercase tracking-tighter px-1 py-0.2 rounded -rotate-12 shadow-sm whitespace-nowrap">
                                        COMPLETED
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col justify-center">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-slate-900 font-mono text-xs font-semibold leading-tight">#{order.id.replace('ORD-', '')}</p>
                                    {isOrderCompleted && (
                                      <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-emerald-100/90 text-emerald-800 border border-emerald-300 text-[8.5px] font-extrabold uppercase tracking-tight shadow-sm">
                                        ✓ Done
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-slate-500 text-[11px] font-normal mt-0.5">{date}</p>
                                </div>
                              </div>
                            </td>
                            <td className={`px-3 py-1.5 align-middle text-left tabular-nums ${tdBorder}`}>
                              <div className="flex flex-col justify-center">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-slate-900 text-xs font-bold leading-tight">{order.customerSnapshot?.name || 'Guest'}</p>
                                  <p className="text-slate-500 text-[11px] font-normal">{order.customerSnapshot?.phone || 'No phone'}</p>
                                  {order.proxyExecutor && (
                                    <span className="inline-block px-1.5 py-0.2 rounded bg-indigo-50 border border-indigo-200 text-[10.5px] font-semibold text-indigo-700">
                                      Proxy: {(() => {
                                        const proxy = typeof order.proxyExecutor === 'string' ? JSON.parse(order.proxyExecutor) : order.proxyExecutor;
                                        return order.proxyName || proxy?.name || (proxy?.role === 'ACDEMA' ? 'AcDema Support' : 'Admin');
                                      })()}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5">
                                  <span 
                                    className="text-slate-900 text-xs font-semibold tracking-normal inline-block truncate max-w-[280px]"
                                    title={order.items?.map(i => i.productName).join(', ') || order.workflow?.printWorkflow?.tiffFileName || 'Custom Print'}
                                  >
                                    {order.items?.map(i => i.productName).join(', ') || order.workflow?.printWorkflow?.tiffFileName || 'Custom Print'}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className={`px-3 py-1.5 align-middle text-left tabular-nums ${tdBorder}`}>
                              <div className="relative inline-flex items-center">
                                <WorkflowPipelineVisual
                                  snapshot={(() => {
                                    const dispatchMethodKey = order.dispatchInfo?.method || (order as any).deliveryChoice || (order as any).delivery_choice || order.delivery?.choice || '';
                                    const isDeliverySkipped = ['pickup', 'counter', 'selfpickup'].includes((dispatchMethodKey || '').toLowerCase());
                                    if (isDeliverySkipped && order.workflowSnapshot?.steps) {
                                      return {
                                        ...order.workflowSnapshot,
                                        steps: order.workflowSnapshot.steps.filter((s: any) => s.role !== 'DELIVERY')
                                      };
                                    }
                                    return order.workflowSnapshot;
                                  })()}
                                  orderId={order.id}
                                  detailed={true}
                                  filterByRoles={false}
                                  allowNavigation={true}
                                />
                                {isOrderCompleted && (
                                  <div className="absolute inset-0 bg-emerald-950/15 backdrop-blur-[1px] rounded-lg border border-emerald-400/40 flex items-center justify-center pointer-events-none shadow-sm z-10">
                                    <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-md bg-emerald-600/95 text-white font-black text-[10.5px] uppercase tracking-widest shadow-md border border-emerald-300 -rotate-1">
                                      <CheckCircle size={12} className="text-white" />
                                      <span>ORDER COMPLETED</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className={`px-4 py-1.5 align-middle text-right tabular-nums ${tdBorder}`}>
                              <div className="flex flex-col items-end justify-center">
                                <p className="text-slate-900 text-sm font-bold leading-tight">₹{amount.toLocaleString()}</p>
                                <div className="flex items-center justify-end gap-1 mt-0.5">
                                  <div className={`w-1.5 h-1.5 rounded-full ${order.paymentStatus === 'VERIFIED' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                  <p className={`text-[11px] font-semibold ${order.paymentStatus === 'VERIFIED' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    {order.paymentStatus === 'VERIFIED' ? 'Verified' : 'Pending'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className={`px-3 py-1.5 align-middle text-center tabular-nums ${tdBorder}`}>
                              <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                                {(() => {
                                  const matchedInvoice = getInvoiceForOrder(order);
                                  if (matchedInvoice || (order as any).is_invoice_generated || (order as any).isInvoiceGenerated) {
                                    const invNum = matchedInvoice?.number || (order as any).invoice_number || (order as any).invoiceNumber || 'Invoiced';
                                    const invId = matchedInvoice?.id || (order as any).invoice_id || (order as any).invoiceId;
                                    return (
                                      <button
                                        className="text-center text-[11px] font-semibold text-emerald-800 border border-emerald-300 bg-emerald-50 rounded-lg py-1 px-2 inline-flex items-center justify-center gap-1 shadow-sm hover:bg-emerald-100 transition-colors cursor-pointer"
                                        title={`Invoice #${invNum}`}
                                        onClick={() => {
                                          if (invId) {
                                            window.location.href = `http://40.81.236.61:3000/sales/${invId}`;
                                          } else {
                                            window.location.href = `http://40.81.236.61:3000/accounting/sales`;
                                          }
                                        }}
                                      >
                                        <CheckCircle size={10} className="text-emerald-600" />
                                        {invNum}
                                      </button>
                                    );
                                  }
                                  return (
                                    <button
                                      disabled={processingOrderId === order.id || modalProcessing}
                                      onClick={() => {
                                        const parentId = order.id.replace('ORD-', '').split('-')[0];
                                        const siblings = filtered.filter((o: any) => o.id.replace('ORD-', '').split('-')[0] === parentId);
                                        if (siblings.length > 1) {
                                          setSiblingsModal({ orders: siblings, parentId });
                                          setSelectedSiblingIds(new Set([order.id]));
                                          return;
                                        }
                                        handleInvoiceMultiple([order]);
                                      }}
                                      className="text-center text-[11px] font-semibold text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-600 hover:text-white rounded-lg py-1 px-2 transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                                      title="Generate Invoice"
                                    >
                                      {processingOrderId === order.id ? <Loader2 size={10} className="animate-spin" /> : <FileText size={10} />}
                                      Invoice
                                    </button>
                                  );
                                })()}
                                <button
                                  disabled={processingOrderId === order.id}
                                  onClick={() => handleReceipt(order)}
                                  className="text-center text-[11px] font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-600 hover:text-white rounded-lg py-1 px-2 transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                                  title="Record Customer Prepayment"
                                >
                                  {processingOrderId === order.id ? <Loader2 size={10} className="animate-spin" /> : null}
                                  Receipt
                                </button>
                                <Link
                                  href={(() => {
                                    if (pathname?.startsWith('/admin')) return `/admin/orders/${order.id}/ledger`;
                                    if (pathname?.startsWith('/printer')) return `/printer/orders/${order.id}`;
                                    if (pathname?.startsWith('/delivarypartner')) return `/delivarypartner/orders/${order.id}`;
                                    return `/acdema/orders/${order.id}`;
                                  })()}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all shadow-sm group-hover:scale-105 shrink-0 ml-0.5"
                                  title="View Order Details"
                                >
                                  <ArrowRight size={13} />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {hasMore && !search && !loading && (
              <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-center">
                <button
                  onClick={() => setLimitCount((prev) => prev + 20)}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-2"
                >
                  Fetch Next Batch <ArrowRight size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {siblingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
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
            <div className="overflow-y-auto p-4 flex-1 space-y-2 bg-slate-50">
              {siblingsModal.orders.map((o: any) => {
                const isSelected = selectedSiblingIds.has(o.id);
                return (
                  <div
                    key={o.id}
                    onClick={() => {
                      const next = new Set(selectedSiblingIds);
                      if (next.has(o.id)) next.delete(o.id);
                      else next.add(o.id);
                      setSelectedSiblingIds(next);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${isSelected ? 'border-indigo-500 bg-indigo-50/50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'} transition-all cursor-pointer`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300'}`}>
                      {isSelected && <CheckCircle size={10} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold truncate ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>{o.id.replace('ORD-', '')}</p>
                      <p className="text-[10px] font-medium text-slate-500 truncate mt-0.5">
                        {o.items?.map((i: any) => i.productName).join(', ') || 'Custom Print'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-black ${isSelected ? 'text-indigo-600' : 'text-slate-900'}`}>₹{(o.amounts?.grandTotal ?? (o as any).grandTotal ?? (o as any).grand_total_snapshot ?? 0).toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-slate-100 bg-white flex gap-3">
              <button onClick={() => setSiblingsModal(null)} className="flex-1 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
              <button
                disabled={selectedSiblingIds.size === 0 || modalProcessing}
                onClick={() => {
                  const selected = siblingsModal.orders.filter((o: any) => selectedSiblingIds.has(o.id));
                  handleInvoiceMultiple(selected);
                }}
                className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {modalProcessing ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                Generate Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </RoleGuard>
  );

}
