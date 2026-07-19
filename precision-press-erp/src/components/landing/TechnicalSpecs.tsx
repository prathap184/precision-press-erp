import React from 'react';

const specs = [
  {
    icon: 'palette',
    title: 'Pantone Precision',
    description: '99.8% Color accuracy protocol using X-Rite i1Pro 3 calibration for brand consistency.',
    label: '99.8% Match'
  },
  {
    icon: 'bolt',
    title: 'Rapid Deployment',
    description: 'Autonomous queue management enabling 24hr express manufacturing on priority lines.',
    label: '24hr Express'
  },
  {
    icon: 'layers',
    title: 'Material Diversity',
    description: 'Certified printing on over 200+ distinct substrates from flexible vinyl to rigid wood.',
    label: '200+ Materials'
  },
  {
    icon: 'compress',
    title: 'Native Resolution',
    description: 'Crystal clear output at 2400 DPI using variable drop technology for ultra-fine detail.',
    label: '2400 DPI'
  }
];

export default function TechnicalSpecs() {
  return (
    <section className="py-32 px-8 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-24">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 border border-white/20 rounded-full mb-6">
            <span className="w-1.5 h-1.5 bg-sky-300 rounded-full animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300 font-label">The Tech Stack</span>
          </div>
          <h2 className="text-5xl lg:text-7xl font-black font-headline text-white mb-8 tracking-tighter italic">
            Industrial <span className="text-sky-300">Benchmarks.</span>
          </h2>
          <p className="text-white/50 text-lg max-w-2xl mx-auto font-body leading-relaxed">
            Our production floor is powered by industry-leading Swiss and Japanese hardware, governed by proprietary AI optimization protocols.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {specs.map((spec, i) => (
            <div key={i} className="group relative p-8 rounded-[2.5rem] bg-white/[0.06] border border-white/10 hover:border-sky-400/30 hover:bg-white/10 transition-all duration-500 overflow-hidden backdrop-blur-sm">
              <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center mb-8 group-hover:bg-sky-400/20 group-hover:scale-110 transition-all duration-500">
                <span className="material-symbols-outlined text-white group-hover:text-sky-300 text-3xl transition-colors duration-500">{spec.icon}</span>
              </div>
              <div className="text-sky-300 font-bold text-[10px] uppercase tracking-[0.2em] mb-3 font-label">{spec.label}</div>
              <h3 className="text-white text-2xl font-headline font-bold mb-4 tracking-tight group-hover:translate-x-1 transition-transform duration-500">{spec.title}</h3>
              <p className="text-white/50 text-sm font-body leading-relaxed">{spec.description}</p>
            </div>
          ))}
        </div>

        {/* Trust Badge */}
        <div className="mt-32 bg-white/[0.06] backdrop-blur-sm border border-white/10 rounded-[2.5rem] px-12 py-10 flex flex-wrap justify-between items-center gap-8">
          <div className="flex gap-4 items-center">
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
              <span className="material-symbols-outlined text-sky-300 text-3xl">verified</span>
            </div>
            <div>
              <div className="text-white font-headline font-bold text-lg tracking-tight uppercase italic">Certified ISO Quality</div>
              <div className="text-white/40 text-[10px] font-black uppercase tracking-widest">2024 Compliance Version</div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex -space-x-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="w-12 h-12 rounded-full border-2 border-white/20 bg-white/10 overflow-hidden ring-4 ring-white/5">
                  <img src={`https://i.pravatar.cc/100?u=${i}`} alt="Client" />
                </div>
              ))}
              <div className="w-12 h-12 rounded-full border-2 border-white/20 bg-sky-500/40 flex items-center justify-center text-[10px] font-black text-white ring-4 ring-white/5">12k+</div>
            </div>
            <div className="h-10 w-px bg-white/10 hidden sm:block" />
            <div className="text-white/50 text-sm font-body">
              <span className="text-white font-bold">12,400+</span> Enterprise clients trust our precision.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
