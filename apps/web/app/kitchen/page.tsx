'use client';

import clsx from 'clsx';
import { AnimatePresence, m } from 'motion/react';
import { BellRing, Bike, Clock, Power, ShoppingBag, Utensils, Volume2, VolumeX, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNotify } from '@/components/providers/feedback';
import { MotionProvider } from '@/components/providers/motion';
import { useSession } from '@/components/providers/session';
import { Sheet } from '@/components/sheet';
import { StaffGate } from '@/components/staff-gate';
import { Button } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useRoom } from '@/lib/socket';
import type { OrderStatus } from '@/lib/types';

interface Ticket {
  id: string;
  number: string;
  status: OrderStatus;
  channel: string;
  fulfillmentType: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
  tableNo: string | null;
  note: string | null;
  createdAt: string;
  paidAt: string | null;
  etaReadyAt: string | null;
  items: { name: string; qty: number; options: string[]; layers: string[]; note: string | null }[];
}

const COLUMNS: { status: OrderStatus[]; title: string; next?: { to: OrderStatus; label: string } }[] = [
  { status: ['PAID'], title: 'เข้าใหม่', next: { to: 'ACCEPTED', label: 'รับออเดอร์' } },
  { status: ['ACCEPTED'], title: 'รับแล้ว', next: { to: 'PREPARING', label: 'เริ่มย่าง' } },
  { status: ['PREPARING'], title: 'กำลังย่าง', next: { to: 'READY', label: 'พร้อมแล้ว' } },
  { status: ['READY', 'OUT_FOR_DELIVERY'], title: 'พร้อมส่งมอบ' },
];

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.35);
  } catch {
    /* audio blocked until the first tap */
  }
}

function KitchenBoard() {
  const { user, logout } = useSession();
  const notify = useNotify();
  const branchId = user?.branchId ?? 'br_siam';
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [calls, setCalls] = useState<{ tableNo: string; reason: string; at: string }[]>([]);
  const [sound, setSound] = useState(true);
  const [moving, setMoving] = useState<string | null>(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [branchName, setBranchName] = useState('');
  const now = useNow();
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const load = useCallback(async () => {
    const r = await api<{ data: Ticket[] }>(`/admin/kitchen/queue?branchId=${branchId}`);
    setTickets(r.data);
  }, [branchId]);

  useEffect(() => {
    api<{ data: { id: string; name: string }[] }>('/branches').then((r) =>
      setBranchName(r.data.find((b) => b.id === branchId)?.name ?? ''),
    );
  }, [branchId]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 30_000); // safety net if a socket event is missed
    return () => clearInterval(t);
  }, [load]);

  useRoom(`kitchen:${branchId}`, {
    'order.created': () => {
      if (soundRef.current) beep();
      void load();
    },
    'order.updated': () => void load(),
    'order.cancelled': (p: { number: string }) => {
      notify(`ออเดอร์ #${p.number} ถูกยกเลิก`, 'info');
      void load();
    },
    'table.call': (p: { tableNo: string; reason: string; at: string }) => {
      if (soundRef.current) beep();
      setCalls((c) => [p, ...c.filter((x) => x.tableNo !== p.tableNo)].slice(0, 6));
    },
  });

  const move = async (t: Ticket, to: OrderStatus) => {
    setMoving(t.id);
    try {
      await api(`/admin/orders/${t.id}/status`, { method: 'PATCH', body: { status: to } });
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'เปลี่ยนสถานะไม่สำเร็จ', 'error');
    } finally {
      setMoving(null);
    }
  };

  return (
    <div data-theme="dark" className="flex min-h-dvh flex-col bg-bg text-text">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <h1 className="font-display text-2xl uppercase tracking-wide">Kitchen</h1>
        <span className="rounded-chip bg-surface-2 px-3 py-1 text-sm font-semibold">{branchName}</span>
        <span className="tabular text-sm text-muted">{tickets.length} ออเดอร์ในคิว</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setStockOpen(true)}>
            <Power aria-hidden className="size-4" /> ปิดเมนูที่หมด
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSound((s) => !s)}
            aria-pressed={sound}
            aria-label={sound ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}
          >
            {sound ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />}
          </Button>
          {user?.role !== 'KITCHEN' && (
            <Link href="/admin" className="press rounded-full px-3 py-2 text-sm font-semibold text-muted hover:text-text">
              หลังร้าน
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={logout}>
            ออก
          </Button>
        </div>
      </header>

      <AnimatePresence>
        {calls.length > 0 && (
          <m.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden border-b border-line bg-promo text-promo-ink"
            role="alert"
          >
            <div className="flex flex-wrap items-center gap-2 px-4 py-2">
              <BellRing aria-hidden className="size-5" />
              {calls.map((c) => (
                <button
                  key={c.tableNo}
                  type="button"
                  onClick={() => setCalls((all) => all.filter((x) => x.tableNo !== c.tableNo))}
                  className="press rounded-chip bg-black/20 px-3 py-1 text-sm font-bold hover:bg-black/30"
                  aria-label={`รับทราบ โต๊ะ ${c.tableNo}`}
                >
                  โต๊ะ {c.tableNo} {c.reason === 'BILL' ? 'ขอเช็กบิล' : 'เรียกพนักงาน'}
                  <X aria-hidden className="ml-1 inline size-3.5" />
                </button>
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <div className="grid flex-1 gap-3 overflow-x-auto p-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const list = tickets.filter((t) => col.status.includes(t.status));
          return (
            <section key={col.title} className="flex min-w-0 flex-col rounded-2xl bg-surface/50" aria-labelledby={`col-${col.title}`}>
              <h2 id={`col-${col.title}`} className="flex items-center justify-between px-4 py-3 text-lg font-bold">
                {col.title}
                <span className="tabular rounded-full bg-surface-2 px-2.5 text-sm">{list.length}</span>
              </h2>
              <ul className="flex flex-1 flex-col gap-3 px-3 pb-3">
                <AnimatePresence initial={false}>
                  {list.map((t) => {
                    const since = new Date(t.paidAt ?? t.createdAt).getTime();
                    const mins = Math.floor((now - since) / 60000);
                    const late = mins >= 15;
                    const warn = mins >= 10;
                    return (
                      <m.li
                        key={t.id}
                        layout
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.25 }}
                        className={clsx(
                          'rounded-2xl border bg-surface p-4',
                          late ? 'border-danger' : warn ? 'border-cheese' : 'border-line',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-display text-3xl leading-none tracking-wide">#{t.number.slice(-3)}</p>
                            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                              {t.fulfillmentType === 'DELIVERY' ? (
                                <Bike aria-hidden className="size-4" />
                              ) : t.fulfillmentType === 'DINE_IN' ? (
                                <Utensils aria-hidden className="size-4" />
                              ) : (
                                <ShoppingBag aria-hidden className="size-4" />
                              )}
                              {t.fulfillmentType === 'DINE_IN'
                                ? t.tableNo
                                  ? `โต๊ะ ${t.tableNo}`
                                  : 'ทานที่ร้าน'
                                : t.fulfillmentType === 'DELIVERY'
                                  ? 'เดลิเวอรี'
                                  : 'รับเอง'}
                              {' · '}
                              {t.channel}
                            </p>
                          </div>
                          <span
                            className={clsx(
                              'tabular inline-flex items-center gap-1 rounded-chip px-2.5 py-1 text-sm font-bold',
                              late ? 'bg-danger text-promo-ink' : warn ? 'bg-cheese text-ink' : 'bg-surface-2',
                            )}
                          >
                            <Clock aria-hidden className="size-3.5" />
                            {mins} นาที
                          </span>
                        </div>
                        <ul className="mt-3 flex flex-col gap-2">
                          {t.items.map((i, idx) => (
                            <li key={idx} className="text-[17px]">
                              <span className="font-bold">
                                {i.qty} x {i.name}
                              </span>
                              {(i.options.length > 0 || i.layers.length > 0) && (
                                <span className="block text-sm text-cheese">{[...i.options, ...i.layers].join(' · ')}</span>
                              )}
                              {i.note && <span className="block text-sm text-muted">หมายเหตุ: {i.note}</span>}
                            </li>
                          ))}
                        </ul>
                        {t.note && <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">{t.note}</p>}
                        {col.next ? (
                          <Button className="mt-4 w-full" size="lg" loading={moving === t.id} onClick={() => move(t, col.next!.to)}>
                            {col.next.label}
                          </Button>
                        ) : (
                          <p className="mt-4 text-center text-sm font-semibold text-success">
                            {t.status === 'OUT_FOR_DELIVERY'
                              ? 'ไรเดอร์รับแล้ว'
                              : t.fulfillmentType === 'DELIVERY'
                                ? 'รอไรเดอร์'
                                : 'รอลูกค้ารับ'}
                          </p>
                        )}
                      </m.li>
                    );
                  })}
                </AnimatePresence>
                {list.length === 0 && <li className="py-10 text-center text-muted">ว่าง</li>}
              </ul>
            </section>
          );
        })}
      </div>

      <StockSheet open={stockOpen} onClose={() => setStockOpen(false)} branchId={branchId} />
    </div>
  );
}

function StockSheet({ open, onClose, branchId }: { open: boolean; onClose: () => void; branchId: string }) {
  const [items, setItems] = useState<{ id: string; name: string; isAvailable: boolean; autoDisabled: boolean }[]>([]);
  const notify = useNotify();

  useEffect(() => {
    if (!open) return;
    api<{ data: { id: string; name: string; isAvailable: boolean; autoDisabled: boolean; isArchived: boolean }[] }>(
      `/admin/menu-items?branchId=${branchId}`,
    ).then((r) => setItems(r.data.filter((i) => !i.isArchived && i.id !== 'mi_build_your_own')));
  }, [open, branchId]);

  const toggle = async (id: string, isAvailable: boolean) => {
    try {
      await api(`/admin/menu-items/${id}/availability`, { method: 'PATCH', body: { branchId, isAvailable } });
      setItems((list) => list.map((i) => (i.id === id ? { ...i, isAvailable, autoDisabled: false } : i)));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'เปลี่ยนไม่สำเร็จ', 'error');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="เปิด/ปิดเมนูชั่วคราว" theme="dark">
      <ul className="flex flex-col divide-y divide-line">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-3">
            <span>
              <span className="font-semibold">{i.name}</span>
              {i.autoDisabled && <span className="block text-sm text-cheese">ปิดอัตโนมัติ: วัตถุดิบไม่พอ</span>}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={i.isAvailable}
              aria-label={`${i.name} ${i.isAvailable ? 'ขายอยู่' : 'ปิดขาย'}`}
              onClick={() => toggle(i.id, !i.isAvailable)}
              className={clsx(
                'press relative h-8 w-14 shrink-0 rounded-full transition-colors',
                i.isAvailable ? 'bg-success' : 'bg-surface-2',
              )}
            >
              <span
                className={clsx(
                  'absolute top-1 size-6 rounded-full bg-bun transition-transform',
                  i.isAvailable ? 'translate-x-7' : 'translate-x-1',
                )}
              />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export default function KitchenPage() {
  return (
    <StaffGate roles={['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'RIDER']} next="/kitchen">
      <MotionProvider>
        <KitchenBoard />
      </MotionProvider>
    </StaffGate>
  );
}
