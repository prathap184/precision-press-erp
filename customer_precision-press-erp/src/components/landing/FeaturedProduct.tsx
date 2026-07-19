'use client';
import React from 'react';
import { CheckCircle2, Zap, Truck, Shield, ArrowRight, FileText, Maximize } from 'lucide-react';
import Link from 'next/link';

export default function FeaturedProduct() {
  return (
    <section className="py-24 px-8 relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="max-w-7xl mx-auto">

        {/* Section label */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-white/10 px-4 py-1.5 rounded-full mb-4 border border-white/20">
            <span className="text-sky-300 font-black tracking-widest text-[9px] uppercase font-label">Featured Protocol</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-black font-display text-white tracking-tighter">
            Our <span className="text-sky-300">Best Seller.</span>
          </h2>
        </div>

        <div className="flex flex-col lg:flex-row gap-0 rounded-[2.5rem] overflow-hidden border border-white/10 bg-white/[0.06] backdrop-blur-sm shadow-2xl shadow-black/30">

          {/* Image Column */}
          <div className="lg:w-1/2 relative min-h-[400px] lg:min-h-auto h-full overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=1600&auto=format&fit=crop"
              alt="Solvent Protocol Printing"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 hover:scale-105"
              onError={(e) => {
                e.currentTarget.src = 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=1600&auto=format&fit=crop';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/30 hidden lg:block" />
          </div>

          {/* Content Column */}
          <div className="lg:w-1/2 p-8 lg:p-14 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center gap-2 px-3 py-1 bg-white/10 border border-white/20 rounded-full">
                  <span className="text-sky-300 font-black text-[10px]">4.9</span>
                  <div className="flex">
                    {[1,2,3,4,5].map(i => (
                      <span key={i} className="material-symbols-outlined text-[10px] text-sky-300">star</span>
                    ))}
                  </div>
                </div>
                <span className="text-white/40 text-[10px] font-black uppercase tracking-widest">(Live Verification)</span>
              </div>

              <h2 className="text-4xl lg:text-5xl font-black font-headline text-white mb-2 tracking-tighter italic">
                SOLVENT <span className="text-sky-300">Protocol.</span>
              </h2>
              <h3 className="text-xl text-white/60 font-bold mb-4 font-headline">Sol Frontlit Flex 180</h3>
              <p className="text-white/50 text-sm font-body mb-8 leading-relaxed max-w-lg">
                Sol Frontlit Flex 180 for industrial printing. Engineered for high-velocity manufacturing environments where durability and chromatic precision are non-negotiable.
              </p>

              <div className="flex items-baseline gap-4 mb-10">
                <div className="text-white/40 text-xs font-black uppercase tracking-widest">Industrial Rate</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-black text-white">₹6</span>
                  <span className="text-white/40 font-bold">/ SQFT</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-10">
                {[
                  { icon: CheckCircle2, text: 'Quality Verified' },
                  { icon: Zap, text: 'Rapid Response' },
                  { icon: Truck, text: 'Safe Logistics' },
                  { icon: Shield, text: 'Production Velocity' }
                ].map((badge, i) => (
                  <div key={i} className="flex items-center gap-3 text-white/50">
                    <badge.icon className="w-4 h-4 text-sky-300" />
                    <span className="text-[10px] font-black uppercase tracking-widest">{badge.text}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-4 mb-10">
                <div className="p-4 bg-white/[0.06] border border-white/10 rounded-2xl flex items-center justify-between">
                  <div>
                    <div className="text-white font-bold text-sm">Standard Dispatch</div>
                    <div className="text-white/40 text-[10px]">2-3 Business Days</div>
                  </div>
                  <div className="px-3 py-1 bg-sky-400/20 border border-sky-400/20 text-sky-300 rounded-lg text-[10px] font-black uppercase">Active</div>
                </div>
                <div className="flex items-center gap-2 text-sky-300">
                  <Zap className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Express 24HR Protocol Enabled</span>
                </div>
              </div>
            </div>

            <Link href="/dashboard/new-order" className="group flex items-center justify-center gap-3 w-full bg-white text-indigo-900 py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-sky-100 active:scale-95 transition-all shadow-xl">
              Configure Order
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>

        {/* Bottom Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-10">
          <div className="bg-white/[0.06] p-8 rounded-[2rem] border border-white/10 backdrop-blur-sm">
            <h4 className="text-white font-black font-headline text-lg mb-6 flex items-center gap-3 italic">
              <Maximize className="w-5 h-5 text-sky-300" />
              Industrial Parameters
            </h4>
            <div className="space-y-4">
              {[
                { label: 'Base Material', value: 'Premium Grade, 300 GSM' },
                { label: 'Max Print Area', value: 'Variable to selection' },
                { label: 'Finish Protocol', value: 'UV Coating / Matte' }
              ].map((spec, i) => (
                <div key={i} className="flex justify-between border-b border-white/10 pb-4">
                  <span className="text-white/40 text-[10px] font-black uppercase tracking-widest">{spec.label}</span>
                  <span className="text-white text-xs font-bold">{spec.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 bg-white/[0.06] p-8 rounded-[2rem] border border-white/10 backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <FileText className="w-32 h-32 text-white" />
            </div>
            <div className="relative z-10">
              <h4 className="text-white font-black font-headline text-lg mb-2 italic">Prepress Compliance</h4>
              <p className="text-white/40 text-xs mb-8 font-body">Artwork & Design Guidelines for flawless industrial manufacturing.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  { num: '01', title: 'Bleed Margins', text: 'Include a minimum 3mm bleed margin outside the safe zones for flawless edge cutting.' },
                  { num: '02', title: 'Color Protocol', text: 'CMYK exact profile strictly required. Avoid RGB files to prevent visual and chromatic variance.' },
                  { num: '03', title: 'Valid Formats', text: 'Export designs in high-resolution PDF/X-4, CDR, or AI formats for optimal results.' }
                ].map((rule, i) => (
                  <div key={i} className="space-y-3">
                    <div className="text-sky-300 font-black text-2xl font-headline">{rule.num}</div>
                    <div className="text-white font-bold text-sm tracking-tight">{rule.title}</div>
                    <p className="text-white/40 text-[10px] leading-relaxed font-body">{rule.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
