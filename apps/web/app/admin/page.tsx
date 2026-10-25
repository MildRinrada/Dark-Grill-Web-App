'use client';

import { AlertTriangle, ArrowRight, Radio } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BarChart } from '@/components/admin/bar-chart';
import { PageTitle, Panel, useAdminBranch } from '@/components/admin/admin-shell';
import { Listbox } from '@/components/listbox';
import { useSession } from '@/components/providers/session';
import { Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { baht, clockTime, shortDate, STATUS_LABEL } from '@/lib/format';
import { useRoom } from '@/lib/socket';
import type { OrderStatus } from '@/lib/types';

interface Sales {
  totals: { orders: number; revenueSatang: number; aovSatang: number };
  today: { orders: number; revenueSatang: number; inKitchen: number };
  daily: { date: string; orders: number; revenueSatang: number; aovSatang: number }[];
  byChannel: { channel: string; orders: number; revenueSatang: number }[];
  topItems: { menuItemId: string; name: string; qty: number; revenueSatang: number }[];
  peakHours: number[];
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  reorderPoint: number;
  isLow: boolean;
}

const CHANNEL = { WEB: 'เว็บ', LINE: 'LINE', QR: 'QR โต๊ะ', KIOSK: 'Kiosk' } as Record<string, string>;
const compactBaht = (s: number) =>
  s >= 100_000_00 ? `฿${(s / 100_000_00).toFixed(1)}M` : s >= 1000_00 ? `฿${Math.round(s / 1000_00)}k` : baht(s);

export default function Dashboard() {
  const branchId = useAdminBranch();
  const { user } = useSession();
  const router = useRouter();
  const [days, setDays] = useState('14');
  const [sales, setSales] = useState<Sales | null>(null);
  const [low, setLow] = useState<Ingredient[]>([]);
  const [feed, setFeed] = useState<{ id: string; number: string; status: OrderStatus; at: string }[]>([]);

  useEffect(() => {
    if (user?.role === 'CASHIER') router.replace('/admin/orders');
  }, [user, router]);

  const load = useCallback(() => {
    api<Sales>(`/admin/reports/sales?branchId=${branchId}&days=${days}`).then(setSales);
    api<{ data: Ingredient[] }>(`/admin/ingredients?branchId=${branchId}`).then((r) => setLow(r.data.filter((i) => i.isLow)));
  }, [branchId, days]);

  useEffect(load, [load]);

  useRoom('admin', {
    'order.updated': (p: { id: string; number: string; status: OrderStatus; branchId: string }) => {
      if (p.branchId !== branchId) return;
      setFeed((f) =>
        [{ id: p.id, number: p.number, status: p.status, at: new Date().toISOString() }, ...f.filter((x) => x.id !== p.id)].slice(0, 8),
      );
    },
    'stock.low': () => load(),
  });

  if (!sales) {
    return (
      <div className="grid place-items-center py-32">
        <Spinner />
      </div>
    );
  }

  const maxChannel = Math.max(...sales.byChannel.map((c) => c.revenueSatang), 1);

  return (
    <>
      <PageTitle title="ภาพรวม">
        <div className="w-48">
          <Listbox
            label="ช่วงเวลา"
            hideLabel
            value={days}
            onChange={setDays}
            options={[
              { value: '7', label: '7 วันล่าสุด' },
              { value: '14', label: '14 วันล่าสุด' },
              { value: '30', label: '30 วันล่าสุด' },
            ]}
          />
        </div>
      </PageTitle>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        <section className="rounded-card bg-ink p-6 text-bun" aria-labelledby="today">
          <p id="today" className="text-sm font-semibold text-bun/70">
            ยอดขายวันนี้
          </p>
          <p className="tabular mt-1 font-display text-6xl leading-none">{baht(sales.today.revenueSatang)}</p>
          <p className="mt-3 text-bun/70">
            {sales.today.orders} ออเดอร์ · ในครัวตอนนี้ {sales.today.inKitchen}
          </p>
        </section>
        <Panel>
          <p className="text-sm text-muted">ยอดขาย {days} วัน</p>
          <p className="tabular mt-1 text-3xl font-bold">{baht(sales.totals.revenueSatang)}</p>
          <p className="tabular text-sm text-muted">{sales.totals.orders.toLocaleString('th-TH')} ออเดอร์</p>
        </Panel>
        <Panel>
          <p className="text-sm text-muted">ยอดต่อบิลเฉลี่ย</p>
          <p className="tabular mt-1 text-3xl font-bold">{baht(sales.totals.aovSatang)}</p>
          <p className="text-sm text-muted">ตัวชี้วัดหลักของ upsell และคอมโบ</p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel>
          <BarChart
            title="ยอดขายรายวัน"
            bars={sales.daily.map((d) => ({ key: d.date, label: shortDate(`${d.date}T12:00:00+07:00`), value: d.revenueSatang }))}
            format={compactBaht}
            tickEvery={Number(days) > 14 ? 5 : 2}
          />
        </Panel>
        <Panel title="ช่องทาง">
          <ul className="flex flex-col gap-3">
            {sales.byChannel.map((c) => (
              <li key={c.channel}>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">{CHANNEL[c.channel] ?? c.channel}</span>
                  <span className="tabular text-muted">
                    {baht(c.revenueSatang)} · {c.orders} บิล
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-chart" style={{ width: `${(c.revenueSatang / maxChannel) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel>
          <BarChart
            title="ชั่วโมงพีค (จำนวนออเดอร์ตามเวลา)"
            bars={sales.peakHours.slice(9, 23).map((v, i) => ({ key: String(i + 9), label: `${i + 9}`, value: v }))}
            format={(n) => `${Math.round(n)}`}
          />
        </Panel>
        <Panel title="เมนูขายดี">
          <ol className="flex flex-col gap-2">
            {sales.topItems.map((t, i) => (
              <li key={t.menuItemId} className="flex items-center gap-3">
                <span className="tabular w-5 text-sm text-muted">{i + 1}</span>
                <span className="flex-1 truncate font-medium">{t.name}</span>
                <span className="tabular text-sm text-muted">{t.qty} ชิ้น</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="วัตถุดิบใกล้หมด"
          action={
            <Link href="/admin/stock" className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text">
              จัดการสต็อก <ArrowRight aria-hidden className="size-4" />
            </Link>
          }
        >
          {low.length === 0 ? (
            <p className="text-muted">ทุกอย่างเหนือจุดสั่งซื้อ</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {low.map((i) => (
                <li key={i.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
                  <AlertTriangle aria-hidden className="size-4 shrink-0 text-danger" />
                  <span className="flex-1 font-medium">{i.name}</span>
                  <span className="tabular text-sm">
                    เหลือ {i.quantity} {i.unit} (สั่งที่ {i.reorderPoint})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="ความเคลื่อนไหวสด"
          action={
            <span className="inline-flex items-center gap-1.5 text-sm text-success">
              <Radio aria-hidden className="size-4" /> เชื่อมต่อ
            </span>
          }
        >
          {feed.length === 0 ? (
            <p className="text-muted">รอออเดอร์ใหม่ ข้อมูลจะเด้งขึ้นที่นี่ทันที</p>
          ) : (
            <ul className="flex flex-col gap-2" aria-live="polite">
              {feed.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 text-[15px]">
                  <span className="tabular font-semibold">#{f.number}</span>
                  <span className="flex-1 text-muted">{STATUS_LABEL[f.status]}</span>
                  <span className="tabular text-sm text-muted">{clockTime(f.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
