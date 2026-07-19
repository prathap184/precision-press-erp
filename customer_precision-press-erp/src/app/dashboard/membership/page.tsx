'use client';


import React from 'react';
import { 
  Award, 
  ChevronRight, 
  Star, 
  Zap, 
  ShieldCheck, 
  Clock, 
  TrendingUp, 
  Gift,
  CheckCircle,
  Lock,
  Trophy,
  Crown,
  Gem
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { RoleGuard } from '@/lib/role-guard';
import { useEffectiveUser } from '@/lib/impersonation-context';

export default function CustomerMembershipPage() {
  const { profile: realProfile } = useAuth();
  const { simulatedUser, isImpersonating } = useEffectiveUser(realProfile?.uid);
  
  const activeProfile = isImpersonating && simulatedUser ? simulatedUser : realProfile;

  const currentLevel = activeProfile?.membership?.tier || 'STANDARD';
  const totalSpend = activeProfile?.membership?.totalSpend || 0;
  const nextTierAt = activeProfile?.membership?.nextTierAt || 50000;
  const progressPercent = Math.min(100, Math.round((totalSpend / nextTierAt) * 100));
  
  const TIERS = [
    { 
      id: 'STANDARD', 
      name: 'Standard', 
      icon: Star, 
      color: 'text-slate-400', 
      bg: 'bg-slate-50', 
      border: 'border-slate-200',
      benefits: ['Standard Production Queue', 'Online Support', 'Digital Invoices']
    },
    { 
      id: 'GOLD', 
      name: 'Gold', 
      icon: Crown, 
      color: 'text-yellow-500', 
      bg: 'bg-yellow-50', 
      border: 'border-yellow-200',
      minSpend: 50000,
      benefits: ['Priority Production Queue', 'Dedicated Support Manager', '5% Discount on Material', 'Express Local Delivery']
    },
    { 
      id: 'PLATINUM', 
      name: 'Platinum', 
      icon: Gem, 
      color: 'text-blue-500', 
      bg: 'bg-blue-50', 
      border: 'border-blue-200',
      minSpend: 250000,
      benefits: ['Instant Production Start', '0% Advance (Special Credit)', '10% Discount on Material', 'Complimentary Express Courier', 'Extended Payment Terms']
    }
  ];

  const levelIndex = TIERS.findIndex(t => t.id === currentLevel);
  const nextTier = levelIndex < TIERS.length - 1 ? TIERS[levelIndex + 1] : null;

  return (
    <RoleGuard allowedRoles={['CUSTOMER']}>
      <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        
        <section>
          <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em] mb-4">Loyalty & Rewards</p>
          <h1 className="text-4xl font-black font-display text-slate-900 tracking-tighter italic uppercase underline decoration-blue-500 underline-offset-8">Account Membership</h1>
          <p className="text-slate-400 font-medium mt-4 max-w-lg opacity-60">
            Elevate your business printing efficiency. Higher tiers unlock deeper discounts and priority production workflows.
          </p>
        </section>

        {/* Current Status Banner */}
        <section className="bg-slate-900 rounded-[3rem] p-12 text-white relative overflow-hidden shadow-2xl shadow-slate-900/40">
           <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none uppercase font-black text-9xl italic rotate-12 -mr-20 -mt-10">
              {currentLevel}
           </div>
           <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
              <div className="flex items-center gap-8">
                 <div className="w-24 h-24 bg-blue-600 rounded-[2rem] flex items-center justify-center shadow-xl shadow-blue-500/20">
                    <Trophy size={40} className="text-white" />
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Active Tier status</p>
                    <h2 className="text-5xl font-black font-display tracking-tighter italic uppercase">{currentLevel} Rank</h2>
                 </div>
              </div>

              {nextTier && (
                <div className="w-full md:w-80 space-y-4">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <span>Upgrade to {nextTier.id}</span>
                    <span>{progressPercent}% Completed</span>
                  </div>
                  <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <div className="h-full bg-blue-500 rounded-full shadow-lg" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <p className="text-[9px] font-bold text-slate-500 italic">Estimated ₹{(nextTierAt - totalSpend).toLocaleString()} more business required for {nextTier.name} status.</p>
                </div>
              )}
           </div>
        </section>

        {/* Tier Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           {TIERS.map((tier, idx) => {
             const isCurrent = tier.id === currentLevel;
             const isLocked = idx > levelIndex;
             const Icon = tier.icon;

             return (
               <div key={tier.id} className={`p-10 rounded-[3rem] border transition-all duration-500 relative flex flex-col ${
                 isCurrent ? 'bg-white border-blue-500 shadow-xl shadow-blue-500/10 scale-105' : 
                 tier.bg + ' ' + tier.border + (isLocked ? ' opacity-50 grayscale' : '')
               }`}>
                  {isCurrent && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-[0.2em] shadow-lg">
                       Current Active Rank
                    </div>
                  )}

                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-8 ${tier.bg} ${tier.color}`}>
                     <Icon size={32} />
                  </div>

                  <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase italic mb-2">{tier.name}</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-10">
                    {tier.minSpend ? `₹${tier.minSpend.toLocaleString()} Total Spend` : 'Entry Level Status'}
                  </p>

                  <ul className="space-y-4 flex-1">
                     {tier.benefits.map(benefit => (
                       <li key={benefit} className="flex items-center gap-3 text-xs font-bold text-slate-700">
                          {isLocked ? <Lock size={12} className="text-slate-300" /> : <CheckCircle size={12} className="text-blue-500" />}
                          {benefit}
                       </li>
                     ))}
                  </ul>

                  {!isCurrent && isLocked && (
                    <div className="mt-10 pt-8 border-t border-slate-200">
                       <button className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 italic">Locked</button>
                    </div>
                  )}
               </div>
             );
           })}
        </section>

        {/* Perks Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 flex items-start gap-8 group hover:bg-slate-900 hover:text-white transition-all duration-500 cursor-default">
              <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-blue-600 shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-colors">
                 <Clock size={28} />
              </div>
              <div>
                 <h4 className="text-lg font-black uppercase italic tracking-tight mb-2">Priority Production</h4>
                 <p className="text-xs font-medium opacity-60 leading-relaxed uppercase tracking-wider">
                    Tiered customers get their design jobs pushed to the front of the queue automatically.
                 </p>
              </div>
           </div>

           <div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 flex items-start gap-8 group hover:bg-slate-900 hover:text-white transition-all duration-500 cursor-default">
              <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-blue-600 shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-colors">
                 <Gift size={28} />
              </div>
              <div>
                 <h4 className="text-lg font-black uppercase italic tracking-tight mb-2">Bulk Rewards</h4>
                 <p className="text-xs font-medium opacity-60 leading-relaxed uppercase tracking-wider">
                    Accumulate points on every order to redeem for future discounts or sample packs.
                 </p>
              </div>
           </div>
        </div>

      </div>
    </RoleGuard>
  );
}
