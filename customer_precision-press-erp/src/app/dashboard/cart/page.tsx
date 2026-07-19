'use client';


import React, { useEffect, useState } from 'react';
import { 
  Trash2, 
  Plus, 
  ArrowRight, 
  ShoppingCart,
  Loader2,
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot 
} from '@/lib/supabase-firestore-shim';
import { useAuth } from '@/lib/auth-context';
import { RoleGuard } from '@/lib/role-guard';
import { useEffectiveUser } from '@/lib/impersonation-context';
import Link from 'next/link';
import { removeFromCart } from '@/lib/actions/cart';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function CustomerCartPage() {
  const { profile } = useAuth();
  const { effectiveUserId } = useEffectiveUser(profile?.uid);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setItems([]);
    setLoading(true);
    if (!effectiveUserId) {
      // no user yet — stop loading and wait for auth
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'cart'),
      where('userId', '==', effectiveUserId),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('Cart snapshot error:', err);
        setError(err?.message || 'Failed to load cart');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [effectiveUserId]);

  return (
    <RoleGuard allowedRoles={['CUSTOMER']}>
      <div className="space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-[9px] font-black text-rose-500 uppercase tracking-[0.35em] mb-2">Your Cart</p>
            <h1 className="text-[28px] font-bold md:text-3xl font-black font-display text-slate-900 tracking-tight">Cart</h1>
            <p className="text-sm text-slate-400 mt-2 max-w-xl opacity-70">
              Items you're planning to order. Proceed to checkout when ready.
            </p>
          </div>
          <Link 
            href="/dashboard/categories"
            className="bg-white text-slate-900 h-11 px-5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border border-slate-100 shadow-sm hover:bg-slate-50 transition-all"
          >
            <Plus size={16} className="text-rose-500" /> Continue Shopping
          </Link>
        </section>

        {loading ? (
          <div className="h-44 flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-rose-500 mb-3" size={28} />
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Loading your cart...</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center">
            <p className="text-sm text-red-500 font-bold mb-4">Failed to load cart: {error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
              }}
              className="bg-slate-900 text-white px-6 py-2 rounded-lg"
            >Retry</button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl text-center max-w-3xl mx-auto">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-md">
               <ShoppingCart size={34} className="text-rose-100 fill-rose-50" />
            </div>
            <h3 className="text-xl font-black text-slate-400 mb-2">Your cart is empty</h3>
            <p className="text-sm text-slate-400 max-w-sm mx-auto leading-relaxed mb-6">
               Add items from the catalog to start building an order.
            </p>
            <Link 
              href="/dashboard/categories"
              className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2 mx-auto w-fit hover:scale-105 transition-all shadow-md"
            >
              Browse Materials <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {items.map((item) => (
              <div key={item.id} className="group bg-white rounded-xl p-4 border border-slate-50 shadow-sm hover:shadow-md hover:-translate-y-1 transition-transform relative overflow-hidden flex flex-col">
                <div className="relative rounded-lg overflow-hidden mb-4 bg-slate-50 h-36">
                   <img 
                      src={item.imageUrl || 'https://images.unsplash.com/photo-1626282874430-c11ae32d2898?w=400'} 
                      alt={item.productName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                   />
                   <button 
                      onClick={async () => {
                         const res = await removeFromCart(item.id);
                         if (res.success) toast.success('Removed from cart');
                      }}
                      className="absolute top-3 right-3 w-10 h-10 bg-white/90 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-white transition-all shadow-sm"
                   >
                      <Trash2 size={16} />
                   </button>
                </div>

                <div className="mb-3 flex-1">
                   <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-rose-50 text-rose-500 rounded-md text-[9px] font-black uppercase">{item.category?.replace('_', ' ') || 'Printing'}</span>
                      <span className="text-[10px] text-slate-400">{item.createdAt ? format(new Date(item.createdAt), 'dd MMM') : 'Recently'}</span>
                   </div>
                   <h3 className="text-lg font-black text-slate-900 leading-tight line-clamp-2">
                      {item.productName || 'Custom Print Job'}
                   </h3>
                </div>

                <div className="flex items-center justify-between mt-3 gap-3">
                   <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest">Base</p>
                      <p className="text-sm font-black text-slate-900">₹{item.basePrice?.toLocaleString() || '0'}</p>
                   </div>
                   <Link 
                      href={`/dashboard/products/${item.productId}`}
                      className="inline-flex items-center gap-2 bg-slate-900 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 transition-colors shadow-sm"
                   >
                      Configure <ChevronRight size={14} />
                   </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}

