'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { CartView, Channel } from '@/lib/types';
import { useNotify } from './feedback';
import { useSession } from './session';

interface AddInput {
  menuItemId: string;
  qty?: number;
  optionIds?: string[];
  layers?: string[];
  note?: string;
}

interface CartState {
  cart: CartView | null;
  busy: boolean;
  bump: number;
  refresh: () => Promise<void>;
  add: (input: AddInput, source?: HTMLElement | null, imageUrl?: string) => Promise<boolean>;
  update: (lineId: string, patch: { qty?: number; note?: string | null }) => Promise<void>;
  remove: (lineId: string) => Promise<void>;
  clear: () => Promise<void>;
  setPromo: (code: string | null) => Promise<CartView | null>;
  setContext: (ctx: { branchId?: string; channel?: Channel; tableNo?: string | null }) => Promise<void>;
  registerTarget: (el: HTMLElement | null) => void;
}

const Ctx = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, ready } = useSession();
  const notify = useNotify();
  const [cart, setCart] = useState<CartView | null>(null);
  const [busy, setBusy] = useState(false);
  const [bump, setBump] = useState(0);
  const target = useRef<HTMLElement | null>(null);

  const run = useCallback(
    async (fn: () => Promise<CartView>) => {
      setBusy(true);
      try {
        const next = await fn();
        setCart(next);
        return next;
      } catch (e) {
        notify(e instanceof ApiError ? e.message : 'เชื่อมต่อไม่ได้ ลองอีกครั้ง', 'error');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  const refresh = useCallback(async () => {
    await run(() => api<CartView>('/carts/me'));
  }, [run]);

  // the cart belongs to whoever is signed in, so reload it when that changes
  useEffect(() => {
    if (ready) void refresh();
  }, [ready, user?.id, refresh]);

  /**
   * Fly-to-cart: the item photo shrinks into the cart icon in ~420 ms, then the badge
   * pops. Uses the Web Animations API (transform + opacity only) so no animation
   * library ships with every page.
   */
  const fly = useCallback((source: HTMLElement | null | undefined, src: string | undefined) => {
    const to = target.current?.getBoundingClientRect();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!source || !src || !to || reduce || !document.body.animate) {
      setBump((b) => b + 1);
      return;
    }
    const from = source.getBoundingClientRect();
    const size = Math.min(from.width, from.height, 160);
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.className = 'pointer-events-none fixed left-0 top-0 z-[80] rounded-2xl object-cover';
    Object.assign(img.style, { width: `${size}px`, height: `${size}px` });
    document.body.appendChild(img);
    const start = `translate(${from.left + from.width / 2 - size / 2}px, ${from.top + from.height / 2 - size / 2}px) scale(1)`;
    const end = `translate(${to.left + to.width / 2 - size / 2}px, ${to.top + to.height / 2 - size / 2}px) scale(0.12)`;
    const anim = img.animate(
      [
        { transform: start, opacity: 1 },
        { transform: end, opacity: 0.6 },
      ],
      { duration: 420, easing: 'cubic-bezier(0.55, 0, 0.25, 1)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      img.remove();
      setBump((b) => b + 1);
    };
  }, []);

  const add = useCallback(
    async (input: AddInput, source?: HTMLElement | null, imageUrl?: string) => {
      const next = await run(() => api<CartView>('/carts/me/items', { method: 'POST', body: { qty: 1, ...input } }));
      if (!next) return false;
      const issue = next.issues.find((i) => next.lines.some((l) => l.lineId === i.lineId && l.menuItemId === input.menuItemId));
      if (issue) {
        notify(issue.message, 'error');
        return false;
      }
      fly(source, imageUrl);
      return true;
    },
    [run, fly, notify],
  );

  const update = useCallback(
    async (lineId: string, patch: { qty?: number; note?: string | null }) => {
      await run(() => api<CartView>(`/carts/me/items/${lineId}`, { method: 'PATCH', body: patch }));
    },
    [run],
  );
  const remove = useCallback(
    async (lineId: string) => {
      await run(() => api<CartView>(`/carts/me/items/${lineId}`, { method: 'DELETE' }));
    },
    [run],
  );
  const clear = useCallback(async () => {
    await run(() => api<CartView>('/carts/me', { method: 'DELETE' }));
  }, [run]);
  const setPromo = useCallback(
    (code: string | null) => run(() => api<CartView>('/carts/me/promo', { method: 'POST', body: { code } })),
    [run],
  );
  const setContext = useCallback(
    async (ctx: { branchId?: string; channel?: Channel; tableNo?: string | null }) => {
      await run(() => api<CartView>('/carts/me/context', { method: 'PUT', body: ctx }));
    },
    [run],
  );
  const registerTarget = useCallback((el: HTMLElement | null) => {
    target.current = el;
  }, []);

  const value = useMemo<CartState>(
    () => ({ cart, busy, bump, refresh, add, update, remove, clear, setPromo, setContext, registerTarget }),
    [cart, busy, bump, refresh, add, update, remove, clear, setPromo, setContext, registerTarget],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
