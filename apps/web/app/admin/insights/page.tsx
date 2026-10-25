'use client';

import clsx from 'clsx';
import { AlertTriangle, CircleHelp, Crown, Tractor, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BarChart } from '@/components/admin/bar-chart';
import { PageTitle, Panel, useAdminBranch } from '@/components/admin/admin-shell';
import { Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { baht, shortDate } from '@/lib/format';

type Klass = 'STAR' | 'PLOWHORSE' | 'PUZZLE' | 'DOG';
interface Engineering {
  days: number;
  popularityThreshold: number;
  cmThresholdSatang: number;
  items: {
    id: string;
    name: string;
    qty: number;
    unitMarginSatang: number;
    mixPercent: number;
    class: Klass;
    priceSatang: number;
    category: string;
  }[];
}
interface Forecast {
  date: string;
  basedOn: string[];
  method: string;
  expectedOrders: number;
  byHour: number[];
  items: { menuItemId: string; name: string; expectedUnits: number }[];
  ingredients: { id: string; name: string; unit: string; need: number; onHand: number; shortfall: number }[];
}

const CLASS: Record<Klass, { label: string; action: string; icon: React.ComponentType<{ className?: string }> }> = {
  STAR: { label: 'ดาวเด่น', action: 'ขายดีและกำไรดี วางตำแหน่งเด่น รักษาคุณภาพ', icon: Crown },
  PLOWHORSE: { label: 'ม้างาน', action: 'ขายดีแต่กำไรต่ำ ลดต้นทุนหรือปรับราคาเล็กน้อย จับคู่เป็นคอมโบ', icon: Tractor },
  PUZZLE: { label: 'ปริศนา', action: 'กำไรดีแต่ขายน้อย ย้ายขึ้นตำแหน่งเด่น ปรับชื่อ หรือทำโปรให้ลอง', icon: CircleHelp },
  DOG: { label: 'ตัวถ่วง', action: 'ขายน้อยและกำไรต่ำ พิจารณาตัดออกหรือทำสูตรใหม่', icon: Trash2 },
};

function Quadrant({ data }: { data: Engineering }) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 640;
  const H = 360;
  const pad = 44;
  const maxQ = Math.max(...data.items.map((i) => i.qty), 1) * 1.08;
  const margins = data.items.map((i) => i.unitMarginSatang);
  const minM = Math.min(...margins, 0);
  const maxM = Math.max(...margins, 1) * 1.08;
  const x = (q: number) => pad + (q / maxQ) * (W - pad - 12);
  const y = (m: number) => H - pad - ((m - minM) / (maxM - minM)) * (H - pad - 12);
  const tx = x(data.popularityThreshold);
  const ty = y(data.cmThresholdSatang);
  const active = data.items.find((i) => i.id === hover);

  return (
    <figure>
      <figcaption id="quad-title" className="sr-only">
        แผนภาพ Menu engineering แกนนอนจำนวนขาย แกนตั้งกำไรต่อจาน
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-labelledby="quad-title" onMouseLeave={() => setHover(null)}>
          <rect x={tx} y={12} width={W - 12 - tx} height={ty - 12} fill="var(--chart-1)" opacity="0.06" />
          <line x1={tx} x2={tx} y1={12} y2={H - pad} stroke="var(--text-muted)" strokeDasharray="4 4" />
          <line x1={pad} x2={W - 12} y1={ty} y2={ty} stroke="var(--text-muted)" strokeDasharray="4 4" />
          <line x1={pad} x2={W - 12} y1={H - pad} y2={H - pad} stroke="var(--chart-grid)" />
          {(
            [
              ['PUZZLE', pad + 8, 28, 'start'],
              ['STAR', W - 20, 28, 'end'],
              ['DOG', pad + 8, H - pad - 10, 'start'],
              ['PLOWHORSE', W - 20, H - pad - 10, 'end'],
            ] as const
          ).map(([k, lx, ly, anchor]) => (
            <text key={k} x={lx} y={ly} textAnchor={anchor} className="fill-muted text-[12px] font-semibold">
              {CLASS[k].label}
            </text>
          ))}
          <text x={(W + pad) / 2} y={H - 10} textAnchor="middle" className="fill-muted text-[12px]">
            จำนวนที่ขาย (ความนิยม)
          </text>
          <text
            x={14}
            y={(H - pad) / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${(H - pad) / 2})`}
            className="fill-muted text-[12px]"
          >
            กำไรต่อจาน
          </text>
          {data.items.map((i) => (
            <g key={i.id}>
              <circle
                cx={x(i.qty)}
                cy={y(i.unitMarginSatang)}
                r={hover === i.id ? 8 : 6}
                fill="var(--chart-1)"
                stroke="var(--surface)"
                strokeWidth="2"
              />
              <circle
                cx={x(i.qty)}
                cy={y(i.unitMarginSatang)}
                r={14}
                fill="transparent"
                tabIndex={0}
                aria-label={`${i.name}: ขาย ${i.qty} กำไร ${baht(i.unitMarginSatang)} ต่อจาน ${CLASS[i.class].label}`}
                onMouseEnter={() => setHover(i.id)}
                onFocus={() => setHover(i.id)}
                onBlur={() => setHover(null)}
                className="focus:outline-none"
              />
            </g>
          ))}
        </svg>
        {active && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-[120%] rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-card"
            style={{ left: `${(x(active.qty) / W) * 100}%`, top: `${(y(active.unitMarginSatang) / H) * 100}%` }}
          >
            <span className="block font-semibold">{active.name}</span>
            <span className="tabular block text-muted">
              ขาย {active.qty} · กำไร {baht(active.unitMarginSatang)}/จาน
            </span>
          </div>
        )}
      </div>
    </figure>
  );
}

export default function Insights() {
  const branchId = useAdminBranch();
  const [eng, setEng] = useState<Engineering | null>(null);
  const [fc, setFc] = useState<Forecast | null>(null);

  useEffect(() => {
    api<Engineering>(`/admin/reports/menu-engineering?branchId=${branchId}&days=30`).then(setEng);
    api<Forecast>(`/admin/forecast?branchId=${branchId}`).then(setFc);
  }, [branchId]);

  if (!eng || !fc) {
    return (
      <div className="grid place-items-center py-20">
        <Spinner />
      </div>
    );
  }

  const groups = (['STAR', 'PLOWHORSE', 'PUZZLE', 'DOG'] as Klass[]).map((k) => ({
    k,
    items: eng.items.filter((i) => i.class === k).sort((a, b) => b.qty - a.qty),
  }));

  return (
    <>
      <PageTitle title="วิเคราะห์เมนู" />
      <Panel title={`Menu engineering ${eng.days} วันล่าสุด (Kasavana & Smith)`}>
        <p className="-mt-2 mb-4 max-w-[70ch] text-sm text-muted">
          เส้นแนวตั้งคือเกณฑ์ความนิยม (70% ของส่วนแบ่งเท่ากัน = {eng.popularityThreshold} ชิ้น) เส้นแนวนอนคือกำไรเฉลี่ยถ่วงน้ำหนัก{' '}
          {baht(eng.cmThresholdSatang)} ต่อจาน
        </p>
        <Quadrant data={eng} />
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {groups.map(({ k, items }) => {
            const C = CLASS[k];
            return (
              <section key={k} className="rounded-2xl border border-line p-4" aria-labelledby={`k-${k}`}>
                <h3 id={`k-${k}`} className="flex items-center gap-2 font-bold">
                  <C.icon className={clsx('size-5', k === 'STAR' ? 'text-accent-text' : k === 'DOG' ? 'text-danger' : 'text-muted')} />
                  {C.label} <span className="tabular text-sm font-medium text-muted">{items.length}</span>
                </h3>
                <p className="mt-1 text-sm text-muted">{C.action}</p>
                <ul className="mt-3 flex flex-col gap-1 text-[15px]">
                  {items.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3">
                      <span>{i.name}</span>
                      <span className="tabular text-muted">
                        {i.qty} ชิ้น · {baht(i.unitMarginSatang)}
                      </span>
                    </li>
                  ))}
                  {items.length === 0 && <li className="text-muted">ไม่มี</li>}
                </ul>
              </section>
            );
          })}
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title={`พยากรณ์ ${shortDate(`${fc.date}T12:00:00+07:00`)}: ประมาณ ${fc.expectedOrders} ออเดอร์`}>
          <p className="-mt-2 mb-4 text-sm text-muted">
            วิธีคิด: ค่าเฉลี่ยวันเดียวกันของ 4 สัปดาห์ก่อน ({fc.basedOn.map((d) => shortDate(`${d}T12:00:00+07:00`)).join(', ')})
          </p>
          <BarChart
            title="ออเดอร์ที่คาดตามชั่วโมง"
            bars={fc.byHour.slice(9, 23).map((v, i) => ({ key: String(i + 9), label: `${i + 9}`, value: v }))}
            format={(n) => (Math.round(n * 10) / 10).toString()}
          />
        </Panel>
        <Panel title="เตรียมวัตถุดิบล่วงหน้า">
          <ul className="flex flex-col gap-2 text-[15px]">
            {fc.ingredients.slice(0, 12).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  {i.shortfall > 0 && <AlertTriangle aria-hidden className="size-4 text-danger" />}
                  {i.name}
                </span>
                <span className="tabular text-right">
                  ต้องใช้ {i.need} {i.unit}
                  {i.shortfall > 0 ? (
                    <span className="block text-sm font-semibold text-danger">
                      ขาด {i.shortfall} {i.unit}
                    </span>
                  ) : (
                    <span className="block text-sm text-muted">มี {Math.round(i.onHand)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
