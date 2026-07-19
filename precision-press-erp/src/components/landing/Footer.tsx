import React from 'react';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="py-20 px-10 relative" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
      <div className="max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-16 lg:gap-12 mb-16">

          {/* Brand column */}
          <div className="lg:col-span-2 space-y-6">
            <Link href="/" className="flex items-center gap-2 group">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}
              >
                <span className="material-symbols-outlined text-white text-base">precision_manufacturing</span>
              </div>
              <span className="text-white font-black text-xl tracking-tighter italic">
                PIXEL <span className="text-sky-300">MARKETING.</span>
              </span>
            </Link>

            <p className="text-white/70 text-sm leading-relaxed max-w-sm">
              Engineering the future of industrial printing through real-time ERP orchestration and material scientific precision.
            </p>

            {/* Social icons */}
            <div className="flex gap-3">
              {['language', 'alternate_email', 'call', 'share'].map((icon, i) => (
                <div
                  key={i}
                  className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all hover:scale-110"
                  style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)' }}
                >
                  <span className="material-symbols-outlined text-white/80 text-base">{icon}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Ecosystem */}
          <div className="space-y-5">
            <h4 className="text-sky-300 font-black text-[11px] uppercase tracking-[0.2em]">Ecosystem</h4>
            <ul className="space-y-3">
              {['Marketplace', 'Infrastructure', 'Material Hub', 'Supply Chain'].map((item) => (
                <li key={item}>
                  <Link className="text-white/75 hover:text-white transition-colors text-sm font-medium" href="/">{item}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Solutions */}
          <div className="space-y-5">
            <h4 className="text-sky-300 font-black text-[11px] uppercase tracking-[0.2em]">Solutions</h4>
            <ul className="space-y-3">
              {['Enterprise API', 'Workflow Sync', 'Loom Integration', 'Bulk Portal'].map((item) => (
                <li key={item}>
                  <Link className="text-white/75 hover:text-white transition-colors text-sm font-medium" href="/">{item}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Governance */}
          <div className="space-y-5">
            <h4 className="text-sky-300 font-black text-[11px] uppercase tracking-[0.2em]">Governance</h4>
            <ul className="space-y-3">
              {['Terms of Ops', 'Data Protocol', 'SLA Registry', 'Legal Sync'].map((item) => (
                <li key={item}>
                  <Link className="text-white/75 hover:text-white transition-colors text-sm font-medium" href="/">{item}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="pt-8 flex flex-col md:flex-row justify-between items-center gap-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}
        >
          <div className="flex flex-col md:flex-row items-center gap-3 text-white/60 text-xs font-semibold">
            <span>© 2026 PIXEL MARKETING INDUSTRIAL</span>
            <span className="hidden md:block w-1 h-1 bg-white/30 rounded-full" />
            <span>All rights reserved</span>
          </div>

          <div className="flex items-center gap-6">
            <span className="text-white/60 text-xs font-semibold">System Status: Optimal</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              <span className="text-emerald-400 text-xs font-black uppercase tracking-widest">Live</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
