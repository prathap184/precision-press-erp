'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { 
  ChevronLeft, 
  ShieldCheck, 
  Clock, 
  Package,
  ArrowRight,
  Star,
  FileText,
  AlertCircle
} from 'lucide-react';
import { OrderBuilder } from '@/components/dashboard/OrderBuilder';
import { getCachedProduct } from '@/lib/cache/products';
import { Product } from '@/types/models';
import { RoleGuard } from '@/lib/role-guard';

export default function AdministrativeProductProxyPage() {
  const { id } = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      setLoading(true);
      try {
        const productData = await getCachedProduct(id as string);

        if (!productData) {
          setError('Product SKU mismatch in industrial registry.');
          setLoading(false);
          return;
        }

        setProduct(productData as unknown as Product);
      } catch (err) {
        console.error('Registry Access Error:', err);
        setError('Security handshake failed or network interruption.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-6">
        <div className="w-16 h-16 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-black text-secondary uppercase tracking-[0.4em] animate-pulse">Staff Registry Link in Progress...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-8">
        <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
          <AlertCircle size={40} />
        </div>
        <div className="text-center">
          <h2 className="text-3xl font-black text-primary uppercase tracking-tighter mb-2">Protocol Access Denied</h2>
          <p className="text-on-surface-variant font-medium opacity-60 italic">{error || 'Data stream corrupted.'}</p>
        </div>
        <button 
          onClick={() => router.back()}
          className="bg-primary text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all active:scale-95 flex items-center gap-4"
        >
          <ChevronLeft size={18} />
          Return to Vault
        </button>
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'DESIGNER', 'SUPPORT', 'MANAGER']}>
      <div className="space-y-6">
          
          {/* Navigation Overlay */}
          <div className="flex items-center gap-4 bg-white p-4 rounded shadow-sm border border-slate-200">
            <button onClick={() => router.back()} className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-all border border-slate-200">
              <ChevronLeft size={16} />
            </button>
            <div>
              <h1 className="text-[28px] font-bold font-bold text-slate-800 uppercase">PROXY PROTOCOL: {product.id}</h1>
              <p className="text-xs text-slate-500">Administrative Catalog Access</p>
            </div>
          </div>

          {/* Core Product Summary for Staff */}
          <div className="bg-white p-4 rounded shadow-sm border border-slate-200 flex flex-col lg:flex-row gap-6 items-center">
            <div className="w-full lg:w-32 h-32 rounded overflow-hidden border border-slate-200">
              <img 
                src={product.media?.images?.[0] || 'https://images.unsplash.com/photo-1557683316-973673baf926?w=400'} 
                className="w-full h-full object-cover" 
                alt={product.name}
              />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase rounded">
                  {product.category.replace('_', ' ')}
                </span>
                <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-bold uppercase rounded flex items-center gap-1">
                  <Star size={10} className="fill-yellow-400 text-yellow-400" /> Professional Grade
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-800">Proxy Placement for {product.name}</h2>
              <p className="text-xs text-slate-500 italic">You are placing an order on behalf of a customer. Ensure customer selection is verified in the engine.</p>
            </div>
            <div className="text-right">
               <p className="text-[10px] font-semibold text-slate-500 uppercase">Staff Verified Rate</p>
               <div className="flex items-baseline gap-1 justify-center lg:justify-end">
                  <span className="text-2xl font-bold text-slate-800">₹{product.baseRate}</span>
                  <span className="text-slate-400 text-xs font-semibold">/ SQFT</span>
               </div>
            </div>
          </div>

          {/* Proxy Order Selection (The Builder) */}
          <div className="pt-4 border-t border-slate-200 space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Configure Customer Order</h3>
                <p className="text-xs text-slate-500">Engine Configuration: Proxy Mode</p>
              </div>
              <div className="bg-emerald-50 px-3 py-1.5 rounded border border-emerald-100 flex items-center gap-2">
                 <ShieldCheck size={14} className="text-emerald-600" />
                 <span className="text-[10px] font-bold text-emerald-700 uppercase">Administrative Authority Verified</span>
              </div>
            </div>

            <React.Suspense fallback={<div className="p-10 text-center text-sm font-medium text-slate-500 animate-pulse">Linking User Directories...</div>}>
              <OrderBuilder lockedProduct={product} />
            </React.Suspense>
          </div>

          {/* Staff Quality Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             {[
               { icon: ShieldCheck, title: 'Compliance Check', desc: 'Auto-verify material suitability' },
               { icon: Clock, title: 'Priority Lane', desc: 'Direct access to staff printing queue' },
               { icon: Package, title: 'Audit Trail', desc: 'Every proxy action is timestamped' }
             ].map((badge, i) => (
               <div key={i} className="bg-white p-4 rounded shadow-sm border border-slate-200 flex items-center gap-4">
                  <div className="w-10 h-10 rounded bg-slate-50 flex items-center justify-center text-slate-600 border border-slate-100">
                    <badge.icon size={18} strokeWidth={2} />
                  </div>
                  <div>
                    <h5 className="text-[10px] font-bold text-slate-700 uppercase">{badge.title}</h5>
                    <p className="text-[10px] text-slate-500">{badge.desc}</p>
                  </div>
               </div>
             ))}
          </div>

      </div>
    </RoleGuard>
  );
}

