import React from 'react';

export default function SupportCTA() {
  return (
    <section className="py-32 px-10 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="max-w-[1400px] mx-auto relative z-10">
        <div className="bg-white/[0.06] backdrop-blur-sm rounded-[3rem] border border-white/10 p-12 lg:p-20 flex flex-col lg:flex-row items-center gap-20 overflow-hidden relative">
          {/* Subtle inner glow */}
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-sky-500/10 rounded-full blur-[100px] pointer-events-none" />

          <div className="flex-1 relative z-10 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 text-sky-300 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-8">
              <span className="w-2 h-2 bg-sky-300 rounded-full animate-ping" />
              24/7 Priority Support
            </div>
            <h2 className="text-4xl lg:text-7xl font-black text-white font-headline tracking-tighter mb-8 leading-[1.05] italic">
              Scale Your <br />
              <span className="text-sky-300">Industrial Output.</span>
            </h2>
            <p className="text-lg text-white/50 max-w-xl font-body leading-relaxed mb-12">
              Join 12,400+ manufacturing partners using our real-time ERP for flawless print orchestration and material logistics.
            </p>

            <div className="flex flex-wrap gap-6 justify-center lg:justify-start">
              <div className="flex items-center gap-4 bg-white/[0.06] px-8 py-5 rounded-[2rem] border border-white/10 hover:border-white/20 transition-colors">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-sky-300">
                  <span className="material-symbols-outlined text-2xl">support_agent</span>
                </div>
                <div className="text-left">
                  <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">Protocol Line</p>
                  <p className="font-bold text-white tracking-tight">+1 (800) PIXEL-MKT</p>
                </div>
              </div>
              <div className="flex items-center gap-4 bg-white/[0.06] px-8 py-5 rounded-[2rem] border border-white/10 hover:border-white/20 transition-colors">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-sky-300">
                  <span className="material-symbols-outlined text-2xl">alternate_email</span>
                </div>
                <div className="text-left">
                  <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">Secure Mail</p>
                  <p className="font-bold text-white tracking-tight">ops@pixelmarketing.io</p>
                </div>
              </div>
            </div>
          </div>

          {/* Newsletter card */}
          <div className="w-full lg:w-[420px] bg-white/10 backdrop-blur-md rounded-[2.5rem] p-10 lg:p-12 text-white relative z-10 border border-white/20 overflow-hidden">
            <div className="absolute -top-20 -right-20 w-56 h-56 bg-sky-400/10 rounded-full blur-3xl" />
            <h3 className="text-3xl font-black font-headline mb-4 relative z-10 tracking-tighter uppercase italic">Production Insider.</h3>
            <p className="text-white/60 mb-10 relative z-10 font-body leading-relaxed font-medium">Get exclusive lead-time alerts and material availability briefings directly to your terminal.</p>

            <div className="space-y-4 relative z-10">
              <input
                className="w-full bg-white/10 border border-white/20 rounded-2xl py-5 px-6 text-white placeholder:text-white/30 font-bold outline-none focus:ring-2 focus:ring-white/20 transition-all"
                placeholder="enterprise@domain.xyz"
                type="email"
              />
              <button className="w-full bg-white text-indigo-900 py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-sky-100 active:scale-95 transition-all flex items-center justify-center gap-3">
                Enable Briefing
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
            <div className="mt-8 pt-8 border-t border-white/10 text-center relative z-10">
              <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.3em]">Zero latency • High fidelity • Bi-weekly</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
