'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import { useParams } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { OrderBuilder } from '@/components/dashboard/OrderBuilder';
import { 
  ChevronLeft, 
  Info, 
  ShieldCheck, 
  Clock, 
  Package,
  ArrowRight,
  Database,
  Calendar
} from 'lucide-react';
import Link from 'next/link';

const PRODUCT_DATA = {
  id: '6000',
  name: 'Sol Frontlit Flex 180',
  category: 'solvent',
  rate: 12,
  description: 'Precision-engineered front-lit media for high-resolution solvent printing. Ideal for extreme outdoor conditions.',
  image: 'https://images.unsplash.com/photo-1626282874430-c11ae32d2898?auto=format&fit=crop&w=1200',
  videoUrl: null, // Placeholder for future video integration
  specs: [
    { label: 'Durability', value: '24 Months' },
    { label: 'Tensile Strength', value: 'High' },
    { label: 'Fire Rating', value: 'B1' }
  ]
};

const SIMILAR_PRODUCTS = [
  { id: '600a', name: 'Sol Frontlit Flex 240', rate: 15, img: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=400' },
  { id: '6200', name: 'Eco-Vinyl Premium', rate: 35, img: 'https://images.unsplash.com/photo-1586075010633-2442dcbd63a8?w=400' },
  { id: '6400', name: 'UV Fabric Mesh', rate: 55, img: 'https://images.unsplash.com/photo-1517142089942-ba376ce32a2e?w=400' },
  { id: '6600', name: 'Acrylic Rigid 3mm', rate: 120, img: 'https://images.unsplash.com/photo-1579546678181-e25f822989cc?w=400' },
];

export default function ProductOrderPage() {
  const { id } = useParams();

  return (
    <RoleGuard allowedRoles={['CUSTOMER', 'DESIGNER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        
        {/* Unified Header */}
        <section className="bg-white p-10 rounded-[3rem] shadow-sm border border-surface-container-low flex flex-col lg:flex-row gap-12 items-center">
          <div className="w-full lg:w-1/3 aspect-[4/3] rounded-[2rem] overflow-hidden bg-surface-container-low relative group">
            <img 
              src={PRODUCT_DATA.image} 
              alt={PRODUCT_DATA.name} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
          </div>

          <div className="flex-1 space-y-6">
            <div className="flex flex-wrap gap-4 items-center">
              <span className="flex items-center gap-2 px-4 py-1.5 bg-primary/5 text-primary text-[10px] font-black uppercase tracking-widest rounded-full">
                <Database size={12} /> ID: {id}
              </span>
              <span className="flex items-center gap-2 px-4 py-1.5 bg-secondary-container/30 text-secondary text-[10px] font-black uppercase tracking-widest rounded-full">
                <Calendar size={12} /> {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
            
            <h1 className="text-5xl font-black font-display text-primary tracking-tighter leading-none">
              {PRODUCT_DATA.name}
            </h1>
            
            <p className="text-lg text-on-surface-variant font-medium leading-relaxed opacity-70 max-w-2xl">
              {PRODUCT_DATA.description}
            </p>

            <div className="flex gap-10 items-end">
              {PRODUCT_DATA.specs.map((spec, i) => (
                <div key={i}>
                  <p className="text-[10px] font-black text-on-surface-variant/30 uppercase tracking-widest">{spec.label}</p>
                  <p className="text-sm font-black text-primary uppercase mt-1">{spec.value}</p>
                </div>
              ))}
              <div className="pl-10 border-l border-surface-container-low">
                <p className="text-[10px] font-black text-secondary uppercase tracking-widest">Protocol Value</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-4xl font-black font-display text-primary leading-none">₹{PRODUCT_DATA.rate}</span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">/ sqft</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* The Engine Section */}
        <section className="space-y-8">
          <div className="px-6 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-black font-display text-primary tracking-tighter uppercase">Order Sheet</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-1">Configure Custom Metrics for ID {id}</p>
            </div>
            <div className="flex gap-4">
               <div className="bg-surface-container-low p-3 rounded-xl text-primary opacity-40"><ShieldCheck size={20} /></div>
               <div className="bg-surface-container-low p-3 rounded-xl text-primary opacity-40"><Clock size={20} /></div>
               <div className="bg-surface-container-low p-3 rounded-xl text-primary opacity-40"><Package size={20} /></div>
            </div>
          </div>
          
          <div className="bg-surface-container-lowest p-2 rounded-[3.5rem] border border-surface-container-low shadow-sm">
            <React.Suspense fallback={<div className="p-20 text-center font-black animate-pulse uppercase tracking-[0.4em] opacity-40">Initializing Configuration Engine...</div>}>
              <OrderBuilder />
            </React.Suspense>
          </div>
        </section>

        {/* Similar Materials Grid */}
        <section className="space-y-10 pt-16 border-t border-surface-container-low">
          <div className="flex justify-between items-end px-6">
            <div>
              <p className="text-[10px] font-black text-secondary uppercase tracking-[0.4em] mb-4">Vertical Affinity</p>
              <h3 className="text-3xl font-black font-display text-primary tracking-tighter uppercase">Similar Protocols</h3>
            </div>
            <Link href="/customer/categories" className="text-xs font-black text-primary hover:text-secondary group flex items-center gap-2">
              Browse All <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 px-2">
            {SIMILAR_PRODUCTS.map((item) => (
              <Link 
                key={item.id} 
                href={`/product/${item.id}`}
                className="group bg-white p-6 rounded-[2.5rem] border border-surface-container-low hover:border-secondary transition-all shadow-sm hover:shadow-xl"
              >
                <div className="aspect-square rounded-3xl overflow-hidden mb-6 bg-surface-container-low">
                  <img src={item.img} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                </div>
                <h4 className="text-lg font-black font-display text-primary tracking-tight mb-2 group-hover:text-secondary transition-colors">
                  {item.name}
                </h4>
                <div className="flex justify-between items-end mt-4">
                  <p className="text-2xl font-black font-display text-primary tracking-tighter">₹{item.rate}<span className="text-[9px] uppercase tracking-widest opacity-30 ml-2">/ SQFT</span></p>
                  <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                    <ArrowRight size={16} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

      </div>
    </RoleGuard>
  );
}
