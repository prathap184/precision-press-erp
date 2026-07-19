'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { 
  Search, 
  Filter, 
  ShoppingCart, 
  ChevronLeft,
  Star,
  Activity,
  Loader2
} from 'lucide-react';

import { getProductsByCategory } from '@/lib/actions/products';
import { Product } from '@/types/models';

export default function StaffProductListPage() {
  const { id } = useParams();
  const [search, setSearch] = useState('');

  const { data: products = [], isLoading: loading } = useQuery({
    queryKey: ['category-products', id],
    queryFn: () => getProductsByCategory(id as string),
    staleTime: 5 * 60 * 1000,
  });

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'DESIGNER', 'SUPPORT', 'MANAGER']}>
      <div className="space-y-6">
        
        {/* Header with Search */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <Link href="/admin/categories" className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all border border-slate-200">
              <ChevronLeft size={16} />
            </Link>
            <div>
              <h1 className="text-[28px] font-bold font-bold text-slate-800 capitalize">{id} Protocol Catalog</h1>
              <p className="text-xs text-slate-500 mt-0.5">{filtered.length} Materials Available for Proxy Order</p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder="Search Material SKU..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all w-full lg:w-64 placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((product) => (
            <div key={product.id} className="group bg-white rounded shadow-sm border border-slate-200 hover:border-indigo-300 transition-all flex flex-col h-full overflow-hidden">
              <Link href={`/admin/products/${product.id}`} className="relative h-32 overflow-hidden bg-slate-100 border-b border-slate-200">
                <img 
                  src={product.media?.images?.[0] || 'https://images.unsplash.com/photo-1626282874430-c11ae32d2898?w=400'} 
                  alt={product.name} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                />
                <div className="absolute top-2 right-2 bg-white/90 backdrop-blur px-2 py-0.5 rounded flex items-center gap-1 shadow-sm border border-slate-200">
                  <Star size={10} className="fill-yellow-400 text-yellow-400" />
                  <span className="text-[10px] font-bold text-slate-700">Live</span>
                </div>
              </Link>

              <div className="p-3 flex-1 flex flex-col gap-2">
                <div>
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide bg-slate-100 px-1.5 py-0.5 rounded">{product.category.replace('_', ' ')}</span>
                    <Activity size={12} className="text-slate-400" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 leading-tight group-hover:text-indigo-600 transition-colors line-clamp-2">
                    {product.name}
                  </h3>
                </div>

                <div className="mt-auto pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-slate-500">Industrial Rate</p>
                    <p className="text-sm font-bold text-slate-800">₹{product.baseRate}</p>
                  </div>
                  <Link 
                    href={`/admin/products/${product.id}`}
                    className="w-8 h-8 rounded bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all border border-indigo-100"
                  >
                    <ShoppingCart size={14} />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </RoleGuard>
  );
}
