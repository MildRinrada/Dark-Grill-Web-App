'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, onSessionChange, refreshSession, setSession } from '@/lib/api';
import type { SessionUser } from '@/lib/types';

interface SessionState {
  user: SessionUser | null;
  ready: boolean;
  requestOtp: (phone: string) => Promise<{ devCode?: string }>;
  verifyOtp: (phone: string, code: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const off = onSessionChange(setUser);
    const maybeSignedIn = document.cookie.split('; ').includes('sid=1');
    if (maybeSignedIn) refreshSession().finally(() => setReady(true));
    else setReady(true);
    // keep the 15-minute access token fresh while the tab is open
    const timer = setInterval(() => {
      if (document.cookie.split('; ').includes('sid=1')) void refreshSession();
    }, 12 * 60_000);
    return () => {
      off();
      clearInterval(timer);
    };
  }, []);

  const requestOtp = useCallback(
    (phone: string) => api<{ devCode?: string }>('/auth/otp/request', { method: 'POST', body: { phone } }),
    [],
  );

  const verifyOtp = useCallback(async (phone: string, code: string) => {
    const res = await api<{ accessToken: string; user: SessionUser }>('/auth/otp/verify', { method: 'POST', body: { phone, code } });
    setSession(res.accessToken, res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSession(null, null);
  }, []);

  return <Ctx.Provider value={{ user, ready, requestOtp, verifyOtp, logout }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
