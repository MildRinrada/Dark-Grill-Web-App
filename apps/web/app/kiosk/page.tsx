'use client';

import clsx from 'clsx';
import { AnimatePresence, m } from 'motion/react';
import { Banknote, Beef, CupSoda, Drumstick, Flame, Minus, Package, Plus, QrCode, ShoppingBag, Store, Utensils } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Upsell } from '@/components/cart/upsell';
import { AddSheet } from '@/components/menu/add-sheet';
import { useCart } from '@/components/providers/cart';
import { MotionProvider } from '@/components/providers/motion';
import { useNotify } from '@/components/providers/feedback';
import { TalkToOrder } from '@/components/talk-to-order';
import { Button } from '@/components/ui';
import { api, ApiError, newIdempotencyKey } from '@/lib/api';
import { baht } from '@/lib/format';
import { useRoom } from '@/lib/socket';
import type { MenuCard, MenuPayload, OrderView } from '@/lib/types';

const BRANCH = 'br_siam';
const IDLE_MS = 75_000;
const WARN_MS = 15_000;
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  flame: Flame,
  beef: Beef,
  package: Package,
  drumstick: Drumstick,
  'cup-soda': CupSoda,
};

type Stage = 'attract' | 'order' | 'pay' | 'done';

/**
 * Self-order kiosk: large dark UI, full-bleed food photos, big touch targets, and a
 * timeout that wipes the session so the next guest never sees someone else's cart.
 */
export default function KioskPage() {
  return (
    <MotionProvider>
      <Kiosk />
    </MotionProvider>
  );
}

function Kiosk() {
  const { cart, setContext, clear, update } = useCart();
  const notify = useNotify();
  const [stage, setStage] = useState<Stage>('attract');
  const [mode, setMode] = useState<'DINE_IN' | 'PICKUP'>('DINE_IN');
  const [menu, setMenu] = useState<MenuPayload | null>(null);
  const [cat, setCat] = useState<string>('');
  const [adding, setAdding] = useState<{ item: MenuCard; el: HTMLElement | null } | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [warn, setWarn] = useState(false);
  const lastTouch = useRef(Date.now());

  useEffect(() => {
    api<MenuPayload>(`/menu?branchId=${BRANCH}&rank=context`).then((m) => {
      setMenu(m);
      setCat(m.categories[0]?.id ?? '');
    });
  }, []);

  useRoom(`branch:${BRANCH}`, {
    'menu.availability_changed': (p: { changes: { menuItemId: string; isAvailable: boolean }[] }) =>
      setMenu(
        (m) =>
          m && {
            ...m,
            categories: m.categories.map((c) => ({
              ...c,
              items: c.items.map((i) => {
                const ch = p.changes.find((x) => x.menuItemId === i.id);
                return ch ? { ...i, isAvailable: ch.isAvailable } : i;
              }),
            })),
          },
      ),
  });

  useRoom(
    order ? `order:${order.id}` : null,
    { 'order.status_changed': (p: { status: string }) => p.status !== 'PENDING_PAYMENT' && setStage('done') },
    { orderToken: order?.publicToken },
  );

  const reset = useCallback(async () => {
    setWarn(false);
    setAdding(null);
    setOrder(null);
    setQr(null);
    setStage('attract');
    await clear();
  }, [clear]);

  // idle watchdog
  useEffect(() => {
    const touch = () => {
      lastTouch.current = Date.now();
      setWarn(false);
    };
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    const t = setInterval(() => {
      if (stage === 'attract') return;
      const idle = Date.now() - lastTouch.current;
      if (stage === 'done' && idle > 20_000) void reset();
      else if (idle > IDLE_MS + WARN_MS) void reset();
      else if (idle > IDLE_MS) setWarn(true);
    }, 1000);
    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
      clearInterval(t);
    };
  }, [stage, reset]);

  const start = async (m: 'DINE_IN' | 'PICKUP') => {
    setMode(m);
    await clear();
    await setContext({ branchId: BRANCH, channel: 'KIOSK', tableNo: null });
    lastTouch.current = Date.now();
    setStage('order');
  };

  const pay = async (method: 'PROMPTPAY' | 'CASH') => {
    setPlacing(true);
    try {
      const o = await api<OrderView>('/orders', {
        method: 'POST',
        idempotencyKey: newIdempotencyKey(),
        body: { fulfillment: { type: mode }, paymentMethod: method },
      });
      setOrder(o);
      if (o.payment?.qrPayload) setQr(await (await import('qrcode')).toDataURL(o.payment.qrPayload, { margin: 1, width: 640 }));
      setStage(method === 'CASH' ? 'done' : 'pay');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'สั่งไม่สำเร็จ', 'error');
    } finally {
      setPlacing(false);
    }
  };

  const items = menu?.categories.find((c) => c.id === cat)?.items ?? [];

  return (
    <main id="main" data-theme="dark" className="flex h-dvh flex-col overflow-hidden bg-bg text-text">
      <AnimatePresence mode="wait">
        {stage === 'attract' && (
          <m.section
            key="attract"
            className="relative flex flex-1 flex-col items-center justify-end overflow-hidden pb-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Image src="/images/menu/hero-fire-grill.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-transparent" aria-hidden />
            <div className="relative flex flex-col items-center gap-8 px-6 text-center">
              <h1 className="font-display text-[clamp(64px,12vw,160px)] uppercase leading-none">Order here</h1>
              <p className="font-display-th text-3xl font-bold">แตะเพื่อเริ่มสั่ง</p>
              <div className="grid w-full max-w-2xl grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => start('DINE_IN')}
                  className="press flex h-40 flex-col items-center justify-center gap-3 rounded-[28px] bg-accent text-2xl font-bold text-accent-ink"
                >
                  <Utensils aria-hidden className="size-10" /> ทานที่ร้าน
                </button>
                <button
                  type="button"
                  onClick={() => start('PICKUP')}
                  className="press flex h-40 flex-col items-center justify-center gap-3 rounded-[28px] border-2 border-line bg-surface text-2xl font-bold"
                >
                  <Store aria-hidden className="size-10" /> กลับบ้าน
                </button>
              </div>
            </div>
          </m.section>
        )}

        {stage === 'order' && menu && (
          <m.div
            key="order"
            className="grid flex-1 grid-cols-[150px_1fr] overflow-hidden lg:grid-cols-[170px_1fr_400px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <nav aria-label="หมวด" className="flex flex-col gap-2 overflow-y-auto border-r border-line p-3">
              {menu.categories.map((c) => {
                const Icon = ICONS[c.icon] ?? Package;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-current={cat === c.id ? 'true' : undefined}
                    onClick={() => setCat(c.id)}
                    className={clsx(
                      'press flex flex-col items-center gap-2 rounded-2xl px-2 py-5 text-lg font-bold',
                      cat === c.id ? 'bg-accent text-accent-ink' : 'bg-surface text-text',
                    )}
                  >
                    <Icon className="size-8" />
                    {c.name}
                  </button>
                );
              })}
            </nav>

            <section className="overflow-y-auto p-5" aria-label="เมนู">
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                {items.map((i) => (
                  <KioskCard key={i.id} item={i} onPick={(el) => setAdding({ item: i, el })} />
                ))}
              </div>
              <div className="mt-6">
                <TalkToOrder size="lg" />
              </div>
            </section>

            <aside
              className="col-span-2 flex flex-col border-t border-line bg-surface lg:col-span-1 lg:border-l lg:border-t-0"
              aria-label="ตะกร้า"
            >
              <div className="flex items-center justify-between p-5">
                <h2 className="flex items-center gap-2 text-2xl font-bold">
                  <ShoppingBag aria-hidden className="size-6" /> ออเดอร์ของคุณ
                </h2>
                <span className="rounded-chip bg-surface-2 px-3 py-1 font-semibold">{mode === 'DINE_IN' ? 'ทานที่ร้าน' : 'กลับบ้าน'}</span>
              </div>
              <ul className="flex-1 overflow-y-auto px-5">
                {cart?.lines.map((l) => (
                  <li key={l.lineId} className="flex items-center gap-3 border-b border-line py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold">{l.name}</p>
                      {l.optionNames.length > 0 && <p className="truncate text-muted">{l.optionNames.join(' · ')}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="press grid size-12 place-items-center rounded-full bg-surface-2"
                        aria-label={`ลด ${l.name}`}
                        onClick={() => update(l.lineId, { qty: l.qty - 1 })}
                      >
                        <Minus className="size-5" aria-hidden />
                      </button>
                      <span className="tabular w-8 text-center text-xl font-bold">{l.qty}</span>
                      <button
                        type="button"
                        className="press grid size-12 place-items-center rounded-full bg-surface-2"
                        aria-label={`เพิ่ม ${l.name}`}
                        onClick={() => update(l.lineId, { qty: l.qty + 1 })}
                      >
                        <Plus className="size-5" aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
                {!cart?.lines.length && <li className="py-10 text-center text-lg text-muted">แตะเมนูเพื่อเริ่มเพิ่ม</li>}
              </ul>
              {cart && cart.lines.length > 0 && (
                <div className="px-5">
                  <Upsell cartKey={cart.lines.map((l) => `${l.lineId}:${l.qty}`).join('|')} branchId={BRANCH} />
                </div>
              )}
              <div className="flex flex-col gap-3 p-5">
                <p className="flex items-baseline justify-between text-xl">
                  <span>รวม</span>
                  <span className="tabular text-4xl font-bold text-flame">{baht(cart?.grandTotalSatang ?? 0)}</span>
                </p>
                {!!cart?.discountSatang && <p className="text-right text-success">ประหยัด {baht(cart.discountSatang)}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    size="xl"
                    className="whitespace-nowrap px-4"
                    disabled={!cart?.lines.length || cart.issues.length > 0}
                    loading={placing}
                    onClick={() => pay('PROMPTPAY')}
                  >
                    <QrCode aria-hidden className="size-6" /> พร้อมเพย์
                  </Button>
                  <Button
                    size="xl"
                    variant="secondary"
                    className="whitespace-nowrap px-4"
                    disabled={!cart?.lines.length || cart.issues.length > 0}
                    loading={placing}
                    onClick={() => pay('CASH')}
                  >
                    <Banknote aria-hidden className="size-6" /> เงินสด
                  </Button>
                </div>
                <Button variant="ghost" size="lg" onClick={reset}>
                  ยกเลิกและเริ่มใหม่
                </Button>
              </div>
            </aside>
          </m.div>
        )}

        {stage === 'pay' && order && (
          <m.section
            key="pay"
            className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <h1 className="font-display-th text-5xl font-black">สแกนจ่ายด้วยพร้อมเพย์</h1>
            <p className="tabular text-6xl font-bold text-flame">{baht(order.totals.grandTotalSatang)}</p>
            <div className="rounded-3xl bg-white p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qr && <img src={qr} alt="QR พร้อมเพย์" width={320} height={320} className="size-80" />}
            </div>
            <p className="text-xl text-muted">หน้าจอจะเปลี่ยนเองเมื่อชำระสำเร็จ</p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => api(`/dev/payments/${order.payment!.id}/simulate`, { method: 'POST', body: {} })}
              >
                โหมดทดสอบ: จำลองจ่ายสำเร็จ
              </Button>
              <Button variant="ghost" size="lg" onClick={reset}>
                ยกเลิก
              </Button>
            </div>
          </m.section>
        )}

        {stage === 'done' && order && (
          <m.section
            key="done"
            className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <p className="text-2xl text-muted">
              {order.payment?.method === 'CASH' ? 'นำเลขนี้ไปชำระที่เคาน์เตอร์' : 'ชำระเงินแล้ว ครัวกำลังทำ'}
            </p>
            <p className="font-display text-[clamp(120px,22vw,260px)] leading-none text-flame">#{order.number.slice(-3)}</p>
            <p className="text-2xl">เลขออเดอร์เต็ม {order.number}</p>
            <Button size="xl" className="mt-6" onClick={reset}>
              เสร็จสิ้น
            </Button>
          </m.section>
        )}
      </AnimatePresence>

      <AddSheet theme="dark" item={adding?.item ?? null} sourceEl={adding?.el ?? null} branchId={BRANCH} onClose={() => setAdding(null)} />

      <AnimatePresence>
        {warn && (
          <m.div
            className="fixed inset-0 z-[90] grid place-items-center bg-ink/80 p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="alertdialog"
            aria-labelledby="idle-title"
          >
            <div className="flex max-w-md flex-col items-center gap-5 rounded-[28px] bg-surface p-8 text-center">
              <h2 id="idle-title" className="text-3xl font-bold">
                ยังสั่งอยู่ไหม?
              </h2>
              <p className="text-lg text-muted">ถ้าไม่มีการแตะ ระบบจะล้างตะกร้าและเริ่มใหม่ในไม่กี่วินาที</p>
              <Button size="xl" onClick={() => setWarn(false)}>
                ยังสั่งอยู่
              </Button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function KioskCard({ item, onPick }: { item: MenuCard; onPick: (el: HTMLElement | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <button
      type="button"
      disabled={!item.isAvailable}
      onClick={() => onPick(ref.current)}
      className="press group flex flex-col overflow-hidden rounded-[24px] bg-surface text-left disabled:opacity-50"
    >
      <div ref={ref} className="relative aspect-[4/3] w-full overflow-hidden">
        <Image
          src={item.imageUrl}
          alt=""
          fill
          sizes="(min-width: 1280px) 30vw, 40vw"
          className={clsx('object-cover', !item.isAvailable && 'grayscale')}
        />
        {!item.isAvailable && (
          <span className="absolute inset-x-3 bottom-3 rounded-chip bg-ink/85 py-2 text-center font-bold text-bun">หมดชั่วคราว</span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2 p-4">
        <span className="text-xl font-bold leading-tight">{item.name}</span>
        <span className="tabular shrink-0 text-xl font-bold text-flame">{baht(item.priceSatang)}</span>
      </div>
    </button>
  );
}
