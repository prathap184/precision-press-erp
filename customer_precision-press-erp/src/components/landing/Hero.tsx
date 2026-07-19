import React from 'react';
import Link from 'next/link';

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden py-20 px-4 sm:px-8"
      style={{
        background: 'linear-gradient(135deg, #2d1b69 0%, #4a1f8c 18%, #3b3bb5 40%, #2563eb 65%, #0ea5e9 100%)',
      }}
    >
      {/* ── Decorative Background Geometry ── */}

      {/* Large hollow circle — top right */}
      <div className="absolute -top-24 -right-24 w-[520px] h-[520px] rounded-full border border-white/10 pointer-events-none" />
      <div className="absolute -top-12 -right-12 w-[400px] h-[400px] rounded-full border border-white/8 pointer-events-none" />

      {/* Filled translucent blob — top right */}
      <div
        className="absolute top-[-80px] right-[-80px] w-[420px] h-[420px] rounded-full pointer-events-none"
        style={{ background: 'rgba(139,92,246,0.25)', filter: 'blur(60px)' }}
      />

      {/* Large hollow circle — bottom left */}
      <div className="absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full border border-white/10 pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-[360px] h-[360px] rounded-full border border-white/6 pointer-events-none" />

      {/* Filled teal blob — bottom left */}
      <div
        className="absolute bottom-[-60px] left-[-60px] w-[380px] h-[380px] rounded-full pointer-events-none"
        style={{ background: 'rgba(14,165,233,0.18)', filter: 'blur(70px)' }}
      />

      {/* Mid-screen diagonal floating ring */}
      <div
        className="absolute top-1/2 left-1/2 w-[800px] h-[800px] rounded-full border border-white/5 pointer-events-none"
        style={{ transform: 'translate(-50%, -50%) rotate(20deg) scaleX(1.4)' }}
      />

      {/* Floating small circles — scattered */}
      <div className="absolute top-[15%] left-[8%] w-5 h-5 rounded-full bg-white/20 pointer-events-none" />
      <div className="absolute top-[25%] left-[15%] w-3 h-3 rounded-full bg-white/15 pointer-events-none" />
      <div className="absolute top-[10%] left-[30%] w-4 h-4 rounded-full bg-purple-300/30 pointer-events-none" />
      <div className="absolute top-[70%] right-[12%] w-6 h-6 rounded-full bg-sky-300/25 pointer-events-none" />
      <div className="absolute top-[55%] right-[25%] w-3 h-3 rounded-full bg-white/20 pointer-events-none" />
      <div className="absolute bottom-[20%] left-[40%] w-4 h-4 rounded-full bg-indigo-300/30 pointer-events-none" />
      <div className="absolute top-[40%] left-[3%] w-2.5 h-2.5 rounded-full bg-white/25 pointer-events-none" />

      {/* Floating diamonds / rotated squares */}
      <div
        className="absolute top-[20%] right-[18%] w-8 h-8 border border-white/20 pointer-events-none"
        style={{ transform: 'rotate(45deg)' }}
      />
      <div
        className="absolute bottom-[30%] left-[20%] w-6 h-6 border border-white/15 pointer-events-none"
        style={{ transform: 'rotate(45deg)' }}
      />
      <div
        className="absolute top-[60%] right-[8%] w-5 h-5 bg-white/10 pointer-events-none"
        style={{ transform: 'rotate(45deg)' }}
      />

      {/* Horizontal light streaks */}
      <div
        className="absolute top-[35%] left-0 w-full h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 70%, transparent 100%)' }}
      />
      <div
        className="absolute top-[65%] left-0 w-full h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)' }}
      />



      {/* Corner triangle accent — top left */}
      <svg
        className="absolute top-0 left-0 w-56 h-56 pointer-events-none opacity-10"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polygon points="0,0 200,0 0,200" fill="rgba(255,255,255,0.15)" />
        <polygon points="0,0 120,0 0,120" fill="rgba(255,255,255,0.10)" />
      </svg>

      {/* Dot grid — upper half */}
      <div
        className="absolute top-0 left-0 w-full h-1/2 pointer-events-none opacity-[0.12]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* ── Main Content ── */}
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-center relative z-10">

        {/* Text Content */}
        <div className="lg:col-span-7">
          <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-sm px-5 py-2 rounded-full mb-10 border border-white/20 shadow-sm">
            <span className="flex h-2.5 w-2.5 rounded-full bg-sky-300 animate-ping" />
            <span className="text-sky-200 font-black tracking-[0.2em] text-[10px] uppercase font-label">Industrial Production V4.0 Enabled</span>
          </div>

          <h1 className="text-7xl lg:text-[110px] font-black font-display text-white leading-[0.85] mb-10 tracking-[-0.05em]">
            Pixel <br />
            <span className="text-sky-300">Engineering.</span>
          </h1>

          <p className="text-blue-100/80 text-lg sm:text-xl max-w-xl mb-14 leading-relaxed font-body font-medium">
            Deploy your large-format industrial assets with unmatched fidelity. Our autonomous ERP engine handles scaling, pre-press, and rapid logistics dispatch.
          </p>

          <div className="flex flex-wrap gap-6 items-center">
            <Link
              href="/dashboard/new-order"
              className="bg-white hover:bg-blue-50 text-indigo-900 px-12 py-6 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center gap-4 transition-all shadow-2xl shadow-black/20 active:scale-95 group"
            >
              Initialize Production <span className="material-symbols-outlined group-hover:translate-x-2 transition-transform">bolt</span>
            </Link>
            <Link
              href="/login"
              className="px-10 py-6 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all flex items-center gap-3 active:scale-95 backdrop-blur-sm"
            >
              Partner Portal <span className="material-symbols-outlined text-[18px]">lock_open</span>
            </Link>
          </div>

          {/* Industrial Trust Badges */}
          <div className="mt-20 pt-10 border-t border-white/10 flex flex-wrap items-center gap-10">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-blue-200/60 uppercase tracking-[0.3em]">System Uptime</span>
              <span className="text-xl font-black text-white font-display">99.98%</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-blue-200/60 uppercase tracking-[0.3em]">Production Speed</span>
              <span className="text-xl font-black text-white font-display">24HR GTY</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-blue-200/60 uppercase tracking-[0.3em]">Output Fidelity</span>
              <span className="text-xl font-black text-white font-display">ULTRA-HD</span>
            </div>
          </div>
        </div>

        {/* Visual Showcase */}
        <div className="lg:col-span-5 relative group">
          <div className="relative z-10 w-full aspect-[4/5] rounded-[4rem] overflow-hidden shadow-2xl shadow-black/30 transition-all duration-700 group-hover:rotate-1 group-hover:scale-[1.02] ring-1 ring-white/20">
            <img
              alt="High-end industrial printing machinery"
              className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
              src="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?q=80&w=2070&auto=format&fit=crop"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-900/40 via-transparent to-transparent" />

            {/* Real-time Status Overlay */}
            <div className="absolute bottom-10 left-10 right-10 bg-white/15 backdrop-blur-xl border border-white/20 p-6 rounded-3xl shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[9px] font-black text-sky-200 uppercase tracking-widest">Active Jobs (Live)</span>
                <div className="flex gap-1">
                  <div className="w-1 h-3 bg-sky-300 rounded-full animate-pulse" />
                  <div className="w-1 h-3 bg-sky-300/50 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                  <div className="w-1 h-3 bg-sky-300/20 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
              <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
                <div className="bg-sky-300 h-full w-[85%]" />
              </div>
              <p className="text-[9px] text-blue-100/70 font-bold mt-3 uppercase tracking-tighter italic font-label">Processing Request: HS-9218-SOL</p>
            </div>
          </div>

          {/* Drifting Nodes */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-purple-400/20 rounded-full blur-[80px] -z-10 group-hover:scale-150 transition-all duration-1000" />
          <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-sky-400/20 rounded-full blur-[60px] -z-10 group-hover:scale-150 transition-all duration-1000" />
        </div>
      </div>
    </section>
  );
}
