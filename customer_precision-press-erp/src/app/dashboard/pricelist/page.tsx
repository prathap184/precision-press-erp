'use client';


import React, { useEffect, useState } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  ChevronRight, 
  Package, 
  Zap, 
  ShieldCheck, 
  Info,
  Loader2,
  Tag,
  ArrowRight,
  ShoppingCart
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, onSnapshot, orderBy } from '@/lib/supabase-firestore-shim';
import { RoleGuard } from '@/lib/role-guard';
import Link from 'next/link';

interface Product {
  id: string;
  name: string;
  category: string;
  baseRate: number;
  description?: string;
  specs?: any[];
}

export default function CustomerPriceListPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[]);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <RoleGuard allowedRoles={['CUSTOMER']}>
      <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        
        {/* Header Section */}
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em] mb-4">Catalog & Procurement</p>
            <h1 className="text-4xl font-black font-display text-slate-900 tracking-tighter italic uppercase underline decoration-blue-500 decoration-wavy underline-offset-8">My Price list</h1>
            <p className="text-slate-400 font-medium mt-4 max-w-lg opacity-60">
              Exclusive contract pricing for your account. All rates are pre-negotiated and inclusive of standard quality checks.
            </p>
          </div>
          <div className="relative group min-w-[300px]">
             <Search size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
             <input 
               type="text" 
               placeholder="Search Products or Categories..."
               value={search}
               onChange={(e) => setSearch(e.target.value)}
               className="w-full bg-white border border-slate-100 rounded-[1.5rem] pl-14 pr-6 py-5 text-xs font-bold text-slate-700 shadow-xl shadow-slate-200/40 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-400/5 transition-all"
             />
          </div>
        </section>

        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-blue-500 mb-4" size={32} />
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Optimizing Catalog...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map((product) => (
              <div key={product.id} className="group bg-white rounded-[2.5rem] p-8 border border-slate-50 shadow-xl shadow-slate-200/30 hover:translate-y-[-8px] transition-all duration-500 relative overflow-hidden">
                
                {/* Product Badge */}
                <div className="flex justify-between items-start mb-8">
                  <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center group-hover:bg-blue-600 transition-all">
                    <Package size={24} className="text-slate-400 group-hover:text-white transition-all" />
                  </div>
                  <span className="px-5 py-2 bg-blue-50 text-blue-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-all">
                    {product.category}
                  </span>
                </div>

                {/* Info */}
                <div className="space-y-4">
                  <h3 className="text-xl font-black text-slate-900 tracking-tight group-hover:text-blue-600 transition-colors">{product.name}</h3>
                  <p className="text-xs font-medium text-slate-400 line-clamp-2 leading-relaxed opacity-60 group-hover:opacity-100 transition-opacity">
                    {product.description || 'Professional printing production with custom specification and high-grade material finish.'}
                  </p>
                </div>

                {/* Price Bar */}
                <div className="mt-8 pt-8 border-t border-slate-50 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Contract Rate</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black font-display text-slate-900">₹{(product.baseRate || 0).toLocaleString()}</span>
                      <span className="text-[10px] font-bold text-slate-400 italic">/ unit</span>
                    </div>
                  </div>
                  <Link 
                    href={`/dashboard/order/create?product=${product.id}`}
                    className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center hover:scale-110 active:scale-90 transition-all shadow-xl shadow-slate-900/20"
                  >
                    <Plus size={20} />
                  </Link>
                </div>

                {/* Subtle detail overlay */}
                <div className="absolute bottom-0 right-0 p-8 opacity-0 group-hover:opacity-20 transition-all translate-y-4 group-hover:translate-y-0">
                   <Tag size={60} className="rotate-12" />
                </div>
              </div>
            ))}

            {/* Empty State */}
            {filtered.length === 0 && (
               <div className="col-span-full py-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] text-center">
                  <Info size={48} className="text-slate-300 mx-auto mb-6" />
                  <h4 className="text-xl font-black text-slate-400 italic uppercase tracking-tight">No products found in your category.</h4>
                  <p className="text-sm font-bold text-slate-400 max-w-sm mx-auto mt-2">Try adjusting your search or contact your relationship manager for custom quotes.</p>
               </div>
            )}
          </div>
        )}

        {/* Global Catalog Disclaimer */}
        <div className="flex items-center gap-6 bg-slate-900 p-8 rounded-[2.5rem] text-white">
           <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
              <ShieldCheck size={28} />
           </div>
           <div>
              <h4 className="text-lg font-black italic tracking-tighter uppercase mb-1">GST & LOGISTICS NOTICE</h4>
              <p className="text-xs font-bold text-slate-400 leading-relaxed uppercase tracking-widest opacity-60">
                All prices shown are exclusive of 18% GST. Delivery charges will be calculated based on your location and shipment weight during checkout. Contract rates are subject to material market volatility.
              </p>
           </div>
           <button className="ml-auto bg-white text-slate-900 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all shrink-0">
              Update Contract
           </button>
        </div>

      </div>
    </RoleGuard>
  );
}

