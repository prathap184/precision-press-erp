"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

function decodeJwtPayload(token: string | null) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const raw = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export default function AuthDebugOverlay() {
  const { profile, roles, role } = useAuth();
  const [cookieRole, setCookieRole] = useState<string | null>(null);
  const [tokenClaims, setTokenClaims] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const getCookie = (name: string) => {
      const m = document.cookie.split('; ').find(c => c.startsWith(name + '='));
      return m ? decodeURIComponent(m.split('=')[1]) : null;
    };
    const t = getCookie('token');
    setCookieRole(getCookie('role'));
    setTokenClaims(decodeJwtPayload(t));
  }, []);

  return (
    <div style={{position: 'fixed', right: 12, bottom: 12, zIndex: 9999, width: 360, maxHeight: '50vh', overflow: 'auto', background: 'rgba(0,0,0,0.7)', color: 'white', padding: 12, borderRadius: 8, fontSize: 12}}>
      <div style={{fontWeight: 800, marginBottom: 8}}>Auth Debug</div>
      <div style={{marginBottom:8}}><strong>profile.role:</strong> {profile?.role ?? 'null'}</div>
      <div style={{marginBottom:8}}><strong>`role` cookie:</strong> {cookieRole ?? 'null'}</div>
      <div style={{marginBottom:8}}><strong>legacy `role` state:</strong> {role ?? 'null'}</div>
      <div style={{marginBottom:8}}><strong>roles array:</strong> {roles && roles.length ? roles.join(',') : '[]'}</div>
      <div style={{marginTop:6, fontWeight:700}}>Token claims</div>
      <pre style={{whiteSpace:'pre-wrap', marginTop:6}}>{JSON.stringify(tokenClaims, null, 2)}</pre>
    </div>
  );
}
