'use client';

import React from 'react';
import Link from 'next/link';
import { RoleGuard } from '@/lib/role-guard';
import { ArrowRight, Zap, Droplets, Layers, UserPlus, Users } from 'lucide-react';

const CATEGORIES = [
  { 
    id: 'solvent', 
    name: 'Solvent Print', 
    description: 'Industrial-grade outdoor durability for hoardings and banners.',
    icon: <Droplets className="text-blue-500" />,
    image: '/images/categories/solvent.png',
    stats: '12-18 INR / sqft'
  },
  { 
    id: 'eco-solvent', 
    name: 'Eco Solvent Print', 
    description: 'High-resolution indoor/outdoor vinyls for branding and signage.',
    icon: <Droplets className="text-emerald-500" />,
    image: '/images/categories/eco-solvent.png',
    stats: '25-45 INR / sqft'
  },
  { 
    id: 'uv-roll', 
    name: 'UV Print Roll', 
    description: 'Texture-rich roll-to-roll printing with instant UV curing.',
    icon: <Layers className="text-indigo-500" />,
    image: '/images/categories/uv-roll.png',
    stats: '45-85 INR / sqft'
  },
  { 
    id: 'uv-flat', 
    name: 'UV Print Flat', 
    description: 'Direct printing on rigid substrates like Sunboard or Acrylic.',
    icon: <Droplets className="text-purple-500" />,
    image: '/images/categories/uv-flat.png',
    stats: '65-120 INR / sqft'
  },
  { 
    id: 'digital', 
    name: 'Digital Print', 
    description: 'Precision small-format and specialty prints for fine detail.',
    icon: <Zap className="text-yellow-500" />,
    image: '/images/categories/digital.png',
    stats: '15-45 INR / sqft'
  },
  { 
    id: 'id-cards', 
    name: 'ID Cards', 
    description: 'Professional PVC ID cards, RFID cards, and membership programs.',
    icon: <Users className="text-blue-500" />,
    image: '/images/categories/id-cards.png',
    stats: 'Starting ₹25/unit'
  }
];

export default function AdminCategoryPage() {
  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'DESIGNER', 'SUPPORT', 'MANAGER']}>
      <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <header className="flex justify-between items-start bg-white p-3 rounded border border-slate-200">
          <div>
            <h1 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Create Proxy Order</h1>
            <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
              Select a category to begin building an order for a customer.
            </p>
          </div>
          <button className="flex items-center gap-1.5 bg-indigo-600 text-white px-2 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-sm">
            <UserPlus size={12} /> New Customer
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {CATEGORIES.map((cat) => (
            <Link 
              key={cat.id} 
              href={`/admin/categories/${cat.id}`}
              className="group bg-white rounded border border-slate-200 overflow-hidden flex flex-col hover:border-indigo-300 transition-all shadow-sm"
            >
              <div className="h-16 overflow-hidden bg-slate-100 border-b border-slate-100 relative">
                <div className="absolute inset-0 bg-slate-900/10 group-hover:bg-transparent transition-colors z-10" />
                <img 
                  src={cat.image} 
                  alt={cat.name} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100"
                />
              </div>
              <div className="p-2 flex flex-col flex-1">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-[10px] font-bold text-slate-800 uppercase tracking-wide leading-tight">{cat.name}</h3>
                </div>
                <p className="text-[9px] text-slate-500 line-clamp-2 flex-1 mb-1.5 leading-tight">
                  {cat.description}
                </p>
                <div className="flex items-center justify-between mt-auto pt-1.5 border-t border-slate-100">
                   <span className="text-[8px] font-bold text-slate-400 bg-slate-50 px-1 py-0.5 rounded border border-slate-100">{cat.stats}</span>
                  <div className="flex items-center gap-0.5 text-indigo-600 text-[9px] font-bold">
                    <span>SELECT</span>
                    <ArrowRight size={8} />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </RoleGuard>
  );
}
