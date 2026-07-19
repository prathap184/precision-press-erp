'use client';


import React from 'react';
import Link from 'next/link';
import { RoleGuard } from '@/lib/role-guard';
import { ArrowRight, Zap, Droplets, Layers, Users } from 'lucide-react';

const CATEGORIES = [
  { 
    id: 'solvent', 
    name: 'Solvent Print', 
    description: 'Industrial outdoor banners and hoardings with extreme weather resistance.',
    icon: <Droplets className="text-blue-600" />,
    image: '/images/categories/solvent.png',
    stats: 'Starting ₹6/sqft'
  },
  { 
    id: 'eco-solvent', 
    name: 'Eco Solvent Print', 
    description: 'High-resolution indoor/outdoor vinyls with precision detail.',
    icon: <Droplets className="text-emerald-500" />,
    image: '/images/categories/eco-solvent.png',
    stats: 'Starting ₹12/sqft'
  },
  { 
    id: 'uv-roll', 
    name: 'UV Print Roll', 
    description: 'Vibrant, textured roll-to-roll printing for walls and premium fabric.',
    icon: <Zap className="text-indigo-500" />,
    image: '/images/categories/uv-roll.png',
    stats: 'Starting ₹45/sqft'
  },
  { 
    id: 'uv-flat', 
    name: 'UV Print Flat', 
    description: 'Direct printing on rigid substrate like Sunboard, Acrylic, and Metal.',
    icon: <Layers className="text-purple-500" />,
    image: '/images/categories/uv-flat.png',
    stats: 'Starting ₹65/sqft'
  },
  { 
    id: 'digital', 
    name: 'Digital Print', 
    description: 'Fast commercial paper printing for brochures, cards, and flyers.',
    icon: <Zap className="text-teal-500" />,
    image: '/images/categories/digital.png',
    stats: 'Starting ₹15/sqft'
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

export default function CategoryPage() {
  return (
    <RoleGuard allowedRoles={['CUSTOMER', 'DESIGNER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <header>
          <h1 className="text-5xl font-black font-display text-primary tracking-tighter">
            Choose Category
          </h1>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {CATEGORIES.map((cat) => (
            <Link 
              key={cat.id} 
              href={`/dashboard/categories/${cat.id}`}
              className="group relative bg-surface-container-lowest rounded-[2rem] overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500 border border-surface-container-low flex flex-col"
            >
              <div className="h-40 overflow-hidden shrink-0">
                <img 
                  src={cat.image} 
                  alt={cat.name} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
              </div>
              <div className="p-5 flex flex-col flex-1">
                <div className="flex justify-between items-center mb-3">
                  <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center">
                    {cat.icon}
                  </div>
                  <span className="text-[9px] font-black text-secondary uppercase tracking-widest">{cat.stats}</span>
                </div>
                <div>
                  <h3 className="text-xl font-black font-display text-primary tracking-tight">{cat.name}</h3>
                  <p className="text-xs text-on-surface-variant font-medium mt-1.5 opacity-60 line-clamp-2">
                    {cat.description}
                  </p>
                </div>
                <div className="mt-auto pt-4 flex items-center gap-2 text-primary group-hover:gap-3 transition-all">
                  <span className="text-[10px] font-black uppercase tracking-widest">Explore</span>
                  <ArrowRight size={14} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </RoleGuard>
  );
}
