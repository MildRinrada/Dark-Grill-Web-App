'use client';

import clsx from 'clsx';
import { Bike, Check, ChefHat, Flame, PackageCheck, Receipt } from 'lucide-react';
import { clockTime } from '@/lib/format';
import type { FulfillmentType, OrderStatus, OrderView } from '@/lib/types';

const ORDER: OrderStatus[] = ['PAID', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'];

function steps(type: FulfillmentType) {
  const base = [
    { key: 'ACCEPTED' as OrderStatus, label: 'รับออเดอร์', icon: Receipt },
    { key: 'PREPARING' as OrderStatus, label: 'กำลังย่าง', icon: Flame },
    { key: 'READY' as OrderStatus, label: type === 'DELIVERY' ? 'แพ็กเสร็จ' : 'พร้อมรับ', icon: PackageCheck },
  ];
  return type === 'DELIVERY'
    ? [
        ...base,
        { key: 'OUT_FOR_DELIVERY' as OrderStatus, label: 'กำลังไปส่ง', icon: Bike },
        { key: 'COMPLETED' as OrderStatus, label: 'ส่งถึงแล้ว', icon: Check },
      ]
    : [...base, { key: 'COMPLETED' as OrderStatus, label: type === 'DINE_IN' ? 'เสิร์ฟแล้ว' : 'รับแล้ว', icon: ChefHat }];
}

/** Progress follows real status events from the kitchen, not a timer. */
export function Tracker({ order }: { order: OrderView }) {
  const list = steps(order.fulfillment.type);
  const reached = ORDER.indexOf(order.status);
  const doneIndex = list.reduce((acc, s, i) => (ORDER.indexOf(s.key) <= reached ? i : acc), -1);
  const progress = list.length > 1 ? Math.max(0, doneIndex) / (list.length - 1) : 0;
  const at = (s: OrderStatus) => order.events.find((e) => e.status === s)?.at;

  return (
    <div>
      <div className="relative mx-5 h-1.5 rounded-full bg-surface-2" aria-hidden>
        <div
          className="absolute inset-0 origin-left rounded-full bg-accent transition-transform duration-[600ms] ease-[var(--ease-snap)] motion-reduce:transition-none"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
      <ol className="-mt-[22px] grid" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}>
        {list.map((s, i) => {
          const done = i <= doneIndex;
          const current = i === doneIndex + 1 && reached >= ORDER.indexOf('PAID');
          return (
            <li key={s.key} className="flex flex-col items-center gap-2 text-center" aria-current={current ? 'step' : undefined}>
              <span
                key={done ? 'done' : 'todo'}
                className={clsx(
                  done && 'pop',
                  'grid size-10 place-items-center rounded-full border-2',
                  done
                    ? 'border-accent bg-accent text-accent-ink'
                    : current
                      ? 'border-accent bg-surface text-accent-text'
                      : 'border-line bg-surface text-muted',
                )}
              >
                <s.icon aria-hidden className={clsx('size-[18px]', current && 'motion-safe:animate-pulse')} />
              </span>
              <span className={clsx('text-xs font-semibold sm:text-sm', done || current ? 'text-text' : 'text-muted')}>{s.label}</span>
              <span className="tabular text-xs text-muted">{at(s.key) ? clockTime(at(s.key)) : ' '}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Rider progress drawn as a branch-to-home route. There is no rider GPS feed in this
 * build, so the dot is an estimate between dispatch time and the promised arrival.
 */
export function RiderRoute({ order }: { order: OrderView }) {
  const out = order.events.find((e) => e.status === 'OUT_FOR_DELIVERY')?.at;
  const eta = order.eta.deliveredAt;
  if (!out || order.fulfillment.type !== 'DELIVERY') return null;
  const start = new Date(out).getTime();
  const end = eta ? new Date(eta).getTime() : start + 20 * 60_000;
  const done = order.status === 'COMPLETED';
  const pct = done ? 1 : Math.min(0.92, Math.max(0.06, (Date.now() - start) / Math.max(1, end - start)));

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">{order.branch.name}</span>
        <span className="font-semibold">{order.fulfillment.address?.label ?? 'ปลายทาง'}</span>
      </div>
      <div className="relative my-4 h-2 rounded-full bg-[repeating-linear-gradient(90deg,var(--border)_0_10px,transparent_10px_18px)]">
        <div
          className="absolute inset-0 transition-transform duration-[800ms] ease-[var(--ease-snap)] motion-reduce:transition-none"
          style={{ transform: `translateX(${pct * 100}%)` }}
        >
          <span className="absolute -top-4 left-0 grid size-10 -translate-x-1/2 place-items-center rounded-full bg-accent text-accent-ink shadow-card">
            <Bike aria-hidden className="size-5" />
          </span>
        </div>
      </div>
      <p className="text-sm text-muted">{done ? 'ส่งถึงแล้ว' : `ตำแหน่งโดยประมาณ ถึงราว ${clockTime(eta)}`}</p>
    </div>
  );
}
