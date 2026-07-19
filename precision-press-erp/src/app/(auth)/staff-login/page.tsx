'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { X, Mail, Lock } from 'lucide-react';
import Link from 'next/link';

export default function StaffLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { profile, login } = useAuth();

  const getDashboardRoute = (role: string) => {
    const routes: Record<string, string> = {
      SUPER_ADMIN: '/super-admin',
      ADMIN: '/admin',
      MANAGER: '/manager/dashboard',
      ACDEMA: '/acdema/orders',
      ACCOUNTANT: '/accountant/payments',
      DESIGNER: '/designer',
      PRINTER: '/printer/queue',
      PASTING: '/pasting',
      FINISHING: '/finishing',
      DISPATCH: '/dispatch',
      DELIVERY: '/delivarypartner',
      SUPPORT: '/support',
    };
    return routes[role] || '/admin';
  };

  // Already logged in → go to dashboard
  useEffect(() => {
    if (profile && profile.role !== 'CUSTOMER') {
      router.replace(getDashboardRoute(profile.role)); 
    }
  }, [profile, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await login(email, password);
      // Let the useEffect handle the redirect based on the updated profile, 
      // but if we want to be immediate we can wait for context to update
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen relative flex flex-col font-sans antialiased text-slate-800"
      style={{
        backgroundColor: '#0f172a', // slate-900 fallback
        backgroundImage: 'url(/bg-forest.png)', // if the ERP has this asset, otherwise it's just a solid color or gradient
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="relative w-full max-w-[400px]">

          {/* Frosted Glass Card */}
          <div className="bg-white/95 backdrop-blur-md border border-white/50 rounded-[2rem] p-10 shadow-2xl relative overflow-hidden">
            <h2 className="text-3xl font-black text-center mb-2 text-slate-900">Staff Portal</h2>
            <p className="text-center text-slate-500 font-medium text-sm mb-8">Authorized Personnel Only</p>

            <form className="space-y-6" onSubmit={handleLogin}>
              {error && (
                <div className="bg-red-500/10 text-red-700 p-3 rounded-lg text-xs font-bold text-center">
                  {error}
                </div>
              )}
              
              {/* Email Input */}
              <div className="relative">
                <input
                  type="email"
                  required
                  className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer"
                  placeholder="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Mail size={18} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-700/50 peer-focus:text-slate-900 transition-colors" />
              </div>

              {/* Password Input */}
              <div className="relative">
                <input
                  type="password"
                  required
                  className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Lock size={18} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-700/50 peer-focus:text-slate-900 transition-colors" />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-slate-900 text-white rounded-xl py-3.5 font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg flex items-center justify-center gap-2"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
