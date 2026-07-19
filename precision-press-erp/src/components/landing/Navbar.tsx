'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ROLE_ROUTES } from '@/types/auth';

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'Products', href: '/#modalities' },
  { label: 'Pricing', href: '/customer/pricelist' },
  { label: 'Materials', href: '/#specs' },
  { label: 'Contact', href: '/#support' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, role, logout } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const dashboardRoute = role ? ROLE_ROUTES[role] : '/staff-login';

  return (
    <header className="w-full top-0 sticky z-50 px-4 sm:px-6 pt-4 pb-2">
      {/* Floating Capsule Navbar */}
      <nav
        className="max-w-6xl mx-auto w-full flex items-center justify-between px-6 py-3 transition-all duration-500"
        style={{
          background: scrolled
            ? 'rgba(224, 242, 254, 0.7)' // Sky-100 with glass
            : 'rgba(224, 242, 254, 0.4)', // More transparent
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: scrolled 
            ? '1px solid rgba(56, 189, 248, 0.4)' 
            : '1px solid rgba(56, 189, 248, 0.2)',
          borderRadius: '9999px',
          boxShadow: scrolled
            ? '0 10px 40px -10px rgba(56, 189, 248, 0.3)'
            : '0 4px 20px -5px rgba(56, 189, 248, 0.1)',
        }}
      >
        {/* Left — Logo circle */}
        <Link href="/" className="flex items-center gap-3 group shrink-0 pl-1">
          <img 
            src="/logo.png" 
            alt="Pixel Marketing Logo" 
            className="h-14 w-auto object-contain transition-transform group-hover:scale-110 duration-300"
          />
          <span className="hidden sm:block text-sky-950 font-black text-lg tracking-tighter italic">
            PIXEL <span className="text-sky-600">MARKETING.</span>
          </span>
        </Link>

        {/* Centre — Nav links */}
        <div className="hidden lg:flex items-center gap-8 bg-sky-50/50 px-8 py-2.5 rounded-full border border-sky-100/50">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sky-900/60 hover:text-sky-600 transition-all text-sm font-bold tracking-tight"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right — Pill CTA */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <button
                onClick={() => logout()}
                className="hidden sm:block text-sky-900/60 hover:text-sky-600 text-sm font-bold transition-colors px-2"
              >
                Logout
              </button>
              <Link
                href={dashboardRoute}
                className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white transition-all hover:shadow-lg hover:shadow-sky-500/30 active:scale-95 px-6 py-3 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
                }}
              >
                Dashboard
                <span className="material-symbols-outlined text-[15px]">dashboard</span>
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/staff-login"
                className="hidden sm:block text-sky-900/60 hover:text-sky-600 text-sm font-bold transition-colors px-2"
              >
                Login
              </Link>
              <Link
                href="/customer/new-order"
                className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white transition-all hover:shadow-lg hover:shadow-sky-500/30 active:scale-95 px-6 py-3 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
                }}
              >
                Start Order
                <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
              </Link>
            </>
          )}

          {/* Mobile menu button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="lg:hidden w-10 h-10 rounded-full flex items-center justify-center text-sky-900/60 hover:text-sky-600 hover:bg-sky-100/50 transition-all"
          >
            <span className="material-symbols-outlined text-2xl">{menuOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div
          className="absolute top-[85px] left-6 right-6 rounded-[2.5rem] overflow-hidden z-40 shadow-2xl shadow-sky-900/20"
          style={{
            background: 'rgba(224, 242, 254, 0.95)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            backdropFilter: 'blur(24px)',
          }}
        >
          <div className="flex flex-col p-4 gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="text-sky-900/70 hover:text-sky-900 text-center py-4 text-lg font-bold transition-all rounded-2xl hover:bg-sky-100/50"
              >
                {link.label}
              </Link>
            ))}
            <div className="h-px bg-sky-200/50 my-2 mx-4" />
            {user ? (
              <>
                <Link
                  href={dashboardRoute}
                  onClick={() => setMenuOpen(false)}
                  className="text-sky-900/70 hover:text-sky-900 text-center py-4 text-lg font-bold transition-all rounded-2xl hover:bg-sky-100/50"
                >
                  Dashboard
                </Link>
                <button
                  onClick={() => {
                    logout();
                    setMenuOpen(false);
                  }}
                  className="text-red-500 hover:text-red-600 text-center py-4 text-lg font-bold transition-all rounded-2xl hover:bg-red-50"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                href="/staff-login"
                onClick={() => setMenuOpen(false)}
                className="text-sky-900/70 hover:text-sky-900 text-center py-4 text-lg font-bold transition-all rounded-2xl hover:bg-sky-100/50"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
