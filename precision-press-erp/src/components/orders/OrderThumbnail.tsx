'use client';

import React, { useEffect, useState, useRef } from 'react';
import { toast } from 'react-hot-toast';

// Module-level flag to avoid spamming the console across many thumbnail instances
let permissionConsoleWarned = false;
import { db } from '@/lib/firebase';
import { collection, query, limit, getDocs } from '@/lib/supabase-firestore-shim';
import { Order, OrderItem } from '@/types/models';
import { Loader2 } from 'lucide-react';

const CATEGORY_IMAGES: Record<string, string> = {
  'solvent': '/images/categories/solvent.png',
  'solvent-print': '/images/categories/solvent.png',
  'eco-solvent': '/images/categories/eco-solvent.png',
  'eco-solvent-print': '/images/categories/eco-solvent.png',
  'uv-roll': '/images/categories/uv-roll.png',
  'uv-roll-print': '/images/categories/uv-roll.png',
  'uv-print-roll': '/images/categories/uv-roll.png',
  'uv-flat': '/images/categories/uv-flat.png',
  'uv-flat-print': '/images/categories/uv-flat.png',
  'uv-print-flat': '/images/categories/uv-flat.png',
  'digital': '/images/categories/digital.png',
  'digital-print': '/images/categories/digital.png',
  'id-cards': '/images/categories/id-cards.png',
  'id-card': '/images/categories/id-cards.png'
};

interface OrderThumbnailProps {
  orderId?: string;
  order?: Order;
  size?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
}

export const OrderThumbnail = ({ 
  orderId, 
  order, 
  size = 'md',
  className = "" 
}: OrderThumbnailProps) => {
  const effectiveOrderId = (order as any)?.orderId || order?.id || orderId;
  const directThumbnail = order?.thumbnailUrl;
  
  const [firstItem, setFirstItem] = useState<OrderItem | null>(null);
  const [loading, setLoading] = useState(!directThumbnail);
  const shownPermissionErrorRef = useRef(false);
  
  const dims = {
    xs: 'w-7 h-7 rounded-md',
    sm: 'w-9 h-9 rounded-lg',
    md: 'w-12 h-12 rounded-xl',
    lg: 'w-24 h-24 rounded-2xl',
    full: 'w-full h-full rounded-2xl'
  }[size as string] || 'w-9 h-9 rounded-lg';

  useEffect(() => {
    const fetchItem = async () => {
      if (!effectiveOrderId) {
        setLoading(false);
        return;
      }
      
      try {
        const snap = await getDocs(query(collection(db, `orders/${effectiveOrderId}/items`), limit(1)));
        if (!snap.empty) {
          setFirstItem({ id: snap.docs[0].id, ...snap.docs[0].data() } as OrderItem);
        }
      } catch (e: any) {
        // Handle permission-denied gracefully and avoid spamming the console
        const isPermission = e?.code === 'permission-denied' || (typeof e?.message === 'string' && e.message.toLowerCase().includes('permission'));
        if (isPermission) {
          if (!shownPermissionErrorRef.current) {
            shownPermissionErrorRef.current = true;
            toast.error('Insufficient permissions to read order thumbnails. Contact your administrator.');
          }
          if (!permissionConsoleWarned) {
            permissionConsoleWarned = true;
            console.warn(`Permission denied fetching thumbnail for order ${effectiveOrderId}`);
          }
        } else {
          console.error(`Failed to fetch thumbnail for order ${effectiveOrderId}:`, e);
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchItem();
  }, [effectiveOrderId]);

  if (loading) {
    return (
      <div className={`${dims} ${className} bg-slate-50 animate-pulse flex items-center justify-center`}>
        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      </div>
    );
  }

  // Determine category for fallback
  const categoryRaw = firstItem?.category || (order as any)?.category || 'solvent';
  const normalizedCategory = String(categoryRaw).toLowerCase().trim().replace(/[\s_/.]+/g, '-');
  
  const displayImage = firstItem?.designUrl || directThumbnail || firstItem?.fileUrl || CATEGORY_IMAGES[normalizedCategory] || CATEGORY_IMAGES['solvent'] || '/images/categories/solvent.png';
  const isDesignByUs = displayImage === 'DESIGN_BY_US' || 
    (typeof displayImage === 'string' && displayImage.endsWith('DESIGN_BY_US')) || 
    order?.workflow?.customerDesignUrl === 'DESIGN_BY_US';

  if (isDesignByUs) {
    return (
      <div className={`relative overflow-hidden border border-indigo-100 bg-gradient-to-br from-indigo-50 to-indigo-100 flex flex-col items-center justify-center text-indigo-600 shadow-sm ${dims} ${className}`}>
        <span className="material-symbols-outlined text-indigo-500 text-2xl animate-pulse">palette</span>
        <span className="text-[9px] font-black uppercase tracking-widest text-indigo-700 mt-1 select-none">Design</span>
      </div>
    );
  }

  return (
    <div className={`relative group overflow-hidden border border-slate-100 shadow-sm transition-transform duration-500 hover:scale-110 ${dims} ${className}`}>
      <img 
        src={displayImage} 
        alt="Preview" 
        className="w-full h-full object-cover transition-transform duration-700 group-hover:rotate-3"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          if (!target.src.includes('solvent.png')) {
            target.src = '/images/categories/solvent.png';
          }
        }}
      />
    </div>
  );
};

