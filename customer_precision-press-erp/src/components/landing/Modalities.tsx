'use client';
import React from 'react';
import Link from 'next/link';

const categories = [
  {
    icon: 'image',
    name: 'Solvent Flex',
    tagline: 'Banners & Hoardings',
    desc: 'Large outdoor banners, hoardings, and signage boards for shops, events, and roadsides.',
    price: '₹6 / sqft',
    color: 'sky',
    img: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?q=80&w=600&auto=format&fit=crop',
  },
  {
    icon: 'print',
    name: 'Digital HD',
    tagline: 'Documents & Copies',
    desc: 'High-quality copies, brochures, visiting cards, and document printing.',
    price: '₹2 / copy',
    color: 'violet',
    img: 'https://images.unsplash.com/photo-1581091226033-d5c48150dbaa?q=80&w=600&auto=format&fit=crop',
  },
  {
    icon: 'view_in_ar',
    name: 'UV Flatbed',
    tagline: 'Hard Surface Printing',
    desc: 'Print directly on wood, acrylic, glass, metal boards, and rigid materials.',
    price: 'Custom Quote',
    color: 'orange',
    img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?q=80&w=600&auto=format&fit=crop',
  },
  {
    icon: 'eco',
    name: 'Eco-Solvent',
    tagline: 'Eco-Friendly Prints',
    desc: 'Safe, non-toxic ink printing for indoor displays, vehicle wraps, and retail graphics.',
    price: 'Custom Quote',
    color: 'emerald',
    img: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?q=80&w=600&auto=format&fit=crop',
  },
  {
    icon: 'straighten',
    name: 'Pavement Graphics',
    tagline: 'Floor & Ground Stickers',
    desc: 'Anti-slip floor stickers and ground graphics for malls, showrooms, and events.',
    price: 'Custom Quote',
    color: 'pink',
    img: 'https://images.unsplash.com/photo-1580893246395-52aead8960dc?q=80&w=600&auto=format&fit=crop',
  },
];

const colorMap: Record<string, { badge: string; text: string; dot: string }> = {
  sky:     { badge: 'bg-sky-400/20 border-sky-400/30 text-sky-300',     text: 'text-sky-300',     dot: 'bg-sky-400' },
  violet:  { badge: 'bg-violet-400/20 border-violet-400/30 text-violet-300',  text: 'text-violet-300',  dot: 'bg-violet-400' },
  orange:  { badge: 'bg-orange-400/20 border-orange-400/30 text-orange-300',  text: 'text-orange-300',  dot: 'bg-orange-400' },
  emerald: { badge: 'bg-emerald-400/20 border-emerald-400/30 text-emerald-300', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  pink:    { badge: 'bg-pink-400/20 border-pink-400/30 text-pink-300',    text: 'text-pink-300',    dot: 'bg-pink-400' },
};

export default function Modalities() {
  return (
    <section className="py-20 px-6 relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-white/10 px-4 py-1.5 rounded-full mb-5 border border-white/20">
            <span className="w-1.5 h-1.5 bg-sky-300 rounded-full animate-pulse" />
            <span className="text-sky-300 font-black tracking-widest text-[9px] uppercase">What We Print</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4 tracking-tighter">
            Our Print <span className="text-sky-300">Categories.</span>
          </h2>
          <p className="text-white/60 text-base max-w-xl mx-auto leading-relaxed">
            From banners to business cards — here's everything we print, with transparent pricing.
          </p>
        </div>

        {/* Category cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map((cat, i) => {
            const c = colorMap[cat.color];
            return (
              <Link
                href="/dashboard/orders/new"
                key={i}
                className="group rounded-2xl overflow-hidden ring-1 ring-white/15 hover:ring-white/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/40 flex flex-col"
                style={{ background: 'rgba(15, 10, 40, 0.85)' }}
              >
                {/* Image — top half, clearly visible */}
                <div className="relative h-44 overflow-hidden">
                  <img
                    src={cat.img}
                    alt={cat.name}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    onError={(e) => {
                      e.currentTarget.src = 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=600&auto=format&fit=crop';
                    }}
                  />
                  {/* Very light bottom fade only — so image stays visible */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[rgba(15,10,40,0.8)] via-transparent to-transparent" />
                  {/* Tag badge on image */}
                  <div className="absolute top-3 right-3">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border backdrop-blur-sm ${c.badge}`}>
                      {cat.tagline}
                    </span>
                  </div>
                </div>

                {/* Text — bottom solid dark section */}
                <div className="p-5 flex flex-col flex-1">
                  {/* Name row */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`material-symbols-outlined text-lg ${c.text}`}>{cat.icon}</span>
                    <h3 className="text-white text-lg font-black tracking-tight">{cat.name}</h3>
                  </div>

                  {/* Description */}
                  <p className="text-white/70 text-xs leading-relaxed mb-4 flex-1">{cat.desc}</p>

                  {/* Price + CTA */}
                  <div className="flex items-center justify-between pt-3 border-t border-white/10">
                    <div>
                      <div className="text-white/50 text-[9px] uppercase tracking-widest font-bold mb-0.5">Starting at</div>
                      <div className={`text-base font-black ${c.text}`}>{cat.price}</div>
                    </div>
                    <div className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-widest ${c.text} group-hover:gap-2 transition-all`}>
                      Order <span className="material-symbols-outlined text-sm">east</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}

          {/* View all CTA */}
          <Link
            href="/dashboard/pricelist"
            className="group rounded-2xl ring-1 ring-white/10 hover:ring-white/20 transition-all duration-300 hover:-translate-y-1 flex items-center justify-center min-h-[280px]"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <div className="text-center p-6">
              <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-white/15 transition-all">
                <span className="material-symbols-outlined text-white/60 group-hover:text-white transition-colors">grid_view</span>
              </div>
              <div className="text-white font-black text-sm mb-1">Full Price List</div>
              <div className="text-white/40 text-xs">See all products & rates</div>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}
