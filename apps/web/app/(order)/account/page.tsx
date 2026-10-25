'use client';

import { ChefHat, Copy, Crown, LayoutDashboard, LogOut, MapPin, RotateCcw, Target, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CrownBurst } from '@/components/order/crown-burst';
import { useCart } from '@/components/providers/cart';
import { useNotify } from '@/components/providers/feedback';
import { useSession } from '@/components/providers/session';
import { Button, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { baht, shortDate, STATUS_LABEL } from '@/lib/format';
import type { OrderView } from '@/lib/types';

interface Loyalty {
  balance: number;
  lifetime: number;
  tier: string;
  nextTier: { name: string; crownsNeeded: number } | null;
  missions: { id: string; title: string; target: number; reward: number; progress: number; claimed: boolean }[];
  rewards: { id: string; name: string; description: string; costCrowns: number; affordable: boolean }[];
}

interface Address {
  id: string;
  label: string;
  line1: string;
}

const TIER_FLOOR: Record<string, number> = { Bronze: 0, Silver: 500, Gold: 1500 };

export default function AccountPage() {
  const { user, ready, logout } = useSession();
  const { refresh } = useCart();
  const notify = useNotify();
  const router = useRouter();
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [redeemed, setRedeemed] = useState<{ code: string; at: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadOrders = useCallback(async (after?: string) => {
    const r = await api<{ data: OrderView[]; nextCursor: string | null }>(`/orders?limit=8${after ? `&cursor=${after}` : ''}`);
    setOrders((o) => (after ? [...o, ...r.data] : r.data));
    setCursor(r.nextCursor);
  }, []);

  useEffect(() => {
    if (ready && !user) router.replace('/login?next=/account');
    if (!user) return;
    api<Loyalty>('/loyalty/me').then(setLoyalty);
    api<{ data: Address[] }>('/me/addresses').then((r) => setAddresses(r.data));
    void loadOrders();
  }, [ready, user, router, loadOrders]);

  if (!user || !loyalty) {
    return (
      <div className="grid place-items-center py-32">
        <Spinner />
      </div>
    );
  }

  const floor = TIER_FLOOR[loyalty.tier] ?? 0;
  const ceiling = loyalty.nextTier ? loyalty.lifetime + loyalty.nextTier.crownsNeeded : loyalty.lifetime;
  const tierProgress = loyalty.nextTier ? (loyalty.lifetime - floor) / Math.max(1, ceiling - floor) : 1;

  const redeem = async (rewardId: string) => {
    setBusy(rewardId);
    try {
      const r = await api<{ code: string; balance: number }>('/loyalty/redeem', { method: 'POST', body: { rewardId } });
      setRedeemed({ code: r.code, at: Date.now() });
      setLoyalty(await api<Loyalty>('/loyalty/me'));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'แลกไม่สำเร็จ', 'error');
    } finally {
      setBusy(null);
    }
  };

  const reorder = async (id: string) => {
    setBusy(id);
    try {
      await api(`/orders/${id}/reorder`, { method: 'POST' });
      await refresh();
      router.push('/cart');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'สั่งซ้ำไม่สำเร็จ', 'error');
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-8 pt-6">
      <CrownBurst trigger={redeemed?.at ?? null} label="แลกรางวัลสำเร็จ" />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted">{user.phone}</p>
          <h1 className="font-display-th text-4xl font-black">{user.name ?? 'บัญชีของฉัน'}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {user.role === 'KITCHEN' && (
            <Link
              href="/kitchen"
              className="press inline-flex h-11 items-center gap-2 rounded-chip border border-line bg-surface px-4 font-semibold"
            >
              <ChefHat aria-hidden className="size-4" /> จอครัว
            </Link>
          )}
          {user.role !== 'CUSTOMER' && user.role !== 'KITCHEN' && (
            <Link
              href="/admin"
              className="press inline-flex h-11 items-center gap-2 rounded-chip border border-line bg-surface px-4 font-semibold"
            >
              <LayoutDashboard aria-hidden className="size-4" /> หลังร้าน
            </Link>
          )}
          <Button
            variant="ghost"
            onClick={async () => {
              await logout();
              router.replace('/menu');
            }}
          >
            <LogOut aria-hidden className="size-4" /> ออกจากระบบ
          </Button>
        </div>
      </header>

      <section
        data-theme="dark"
        className="grid gap-6 rounded-[28px] bg-bg p-6 text-text sm:p-8 lg:grid-cols-[1fr_1.1fr]"
        aria-labelledby="crowns-title"
      >
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-cheese">
            <Crown aria-hidden className="size-4" /> {loyalty.tier}
          </p>
          <h2 id="crowns-title" className="mt-2 font-display text-7xl leading-none sm:text-8xl">
            <span className="tabular">{loyalty.balance.toLocaleString('th-TH')}</span>
            <span className="ml-3 font-display-th text-2xl font-bold">Crowns</span>
          </h2>
          <div className="mt-6">
            <div
              className="h-2 rounded-full bg-surface-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(tierProgress * 100)}
              aria-label="ความคืบหน้าสู่ระดับถัดไป"
            >
              <div className="h-full rounded-full bg-cheese" style={{ width: `${Math.min(100, tierProgress * 100)}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted">
              {loyalty.nextTier ? `อีก ${loyalty.nextTier.crownsNeeded} Crowns เป็น ${loyalty.nextTier.name}` : 'ระดับสูงสุดแล้ว'}
            </p>
          </div>
          <ul className="mt-6 flex flex-col gap-3">
            {loyalty.missions.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-2xl border border-line p-3">
                <Target aria-hidden className="size-5 shrink-0 text-flame" />
                <div className="flex-1">
                  <p className="font-semibold">{m.title}</p>
                  <p className="tabular text-sm text-muted">
                    {m.claimed ? 'สำเร็จแล้ว' : `${m.progress}/${m.target}`} · +{m.reward} Crowns
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-bold">แลกรางวัล</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {loyalty.rewards.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-surface p-4">
                <div className="flex-1">
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-sm text-muted">{r.description}</p>
                </div>
                <Button size="sm" disabled={!r.affordable} loading={busy === r.id} onClick={() => redeem(r.id)}>
                  <span className="tabular">{r.costCrowns}</span> Crowns
                </Button>
              </li>
            ))}
          </ul>
          {redeemed && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-cheese/50 p-4" role="status">
              <div>
                <p className="text-sm text-muted">โค้ดของคุณ ใช้ได้ 30 วัน ครั้งเดียว</p>
                <p className="font-display text-3xl tracking-wider text-cheese">{redeemed.code}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigator.clipboard?.writeText(redeemed.code).then(() => notify('คัดลอกโค้ดแล้ว', 'success'))}
              >
                <Copy aria-hidden className="size-4" /> คัดลอก
              </Button>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="orders-title">
        <h2 id="orders-title" className="text-2xl font-bold">
          ออเดอร์ของฉัน
        </h2>
        {orders.length === 0 ? (
          <p className="mt-3 text-muted">ยังไม่มีออเดอร์</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-surface">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    <span className="tabular">#{o.number}</span> · {STATUS_LABEL[o.status]}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {shortDate(o.createdAt)} · {o.items.map((i) => `${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`).join(', ')}
                  </p>
                </div>
                <p className="tabular font-bold">{baht(o.totals.grandTotalSatang)}</p>
                <div className="flex w-full justify-end gap-2 sm:w-auto">
                  <Link
                    href={`/orders/${o.id}`}
                    className="press inline-flex h-9 items-center rounded-chip border border-line px-4 text-sm font-semibold hover:border-text/40"
                  >
                    ดู
                  </Link>
                  <Button size="sm" variant="secondary" loading={busy === o.id} onClick={() => reorder(o.id)}>
                    <RotateCcw aria-hidden className="size-4" /> สั่งซ้ำ
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {cursor && (
          <Button variant="ghost" className="mt-3" onClick={() => loadOrders(cursor)}>
            โหลดเพิ่ม
          </Button>
        )}
      </section>

      <section aria-labelledby="addr-title">
        <h2 id="addr-title" className="text-2xl font-bold">
          ที่อยู่
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
              <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-text" />
              <div className="flex-1">
                <p className="font-semibold">{a.label}</p>
                <p className="text-sm text-muted">{a.line1}</p>
              </div>
              <button
                type="button"
                className="press grid size-9 place-items-center rounded-full text-danger hover:bg-danger/10"
                aria-label={`ลบที่อยู่ ${a.label}`}
                onClick={async () => {
                  await api(`/me/addresses/${a.id}`, { method: 'DELETE' });
                  setAddresses((list) => list.filter((x) => x.id !== a.id));
                }}
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
