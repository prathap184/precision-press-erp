'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { X, Mail, Lock } from 'lucide-react';
import Navbar from '@/components/landing/Navbar';

export default function CustomerLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { profile, login } = useAuth();

  // Already logged in → go to dashboard
  useEffect(() => {
    if (profile?.role === 'CUSTOMER') router.replace('/dashboard');
  }, [profile, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (err: any) {
      if (err.message === 'STAFF_ACCOUNT') {
        setError('This portal is for customers only. Please use the Staff ERP.');
      } else {
        setError(err.message || 'Failed to sign in. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen relative flex flex-col font-sans antialiased text-slate-800"
      style={{
        backgroundImage: 'url(/bg-forest.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Navbar */}
      <Navbar />

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="relative w-full max-w-[400px]">
          {/* Close Button */}
          <button 
            onClick={() => router.push('/')}
            className="absolute -top-3 -right-3 w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center z-20 shadow-lg hover:bg-slate-800 transition-colors"
          >
            <X size={16} strokeWidth={3} />
          </button>

          {/* Frosted Glass Card */}
          <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-[2rem] p-10 shadow-2xl relative overflow-hidden">
            <h2 className="text-3xl font-black text-center mb-8 text-slate-900">Sign In</h2>

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
                  placeholder="Email"
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

              {/* Remember me & Forgot Password */}
              <div className="flex justify-between items-center text-xs font-bold text-slate-700 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-3.5 h-3.5 rounded-sm border-slate-400 text-slate-900 focus:ring-slate-900" />
                  Remember me
                </label>
                <Link href="#" className="hover:text-slate-900 transition-colors">Forgot Password?</Link>
              </div>

              {/* Login Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-slate-900 text-white rounded-lg py-3.5 text-sm font-bold shadow-lg hover:bg-slate-800 active:scale-[0.98] transition-all"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </div>
              
              {/* Register Link */}
              <div className="text-center pt-4">
                <p className="text-xs font-bold text-slate-700">
                  New customer?{' '}
                  <Link href="/register" className="text-slate-900 hover:underline underline-offset-4">Create an account</Link>
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
