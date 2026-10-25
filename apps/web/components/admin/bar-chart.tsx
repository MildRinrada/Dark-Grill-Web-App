'use client';

import { Table2 } from 'lucide-react';
import { useId, useState } from 'react';

export interface Bar {
  key: string;
  label: string;
  value: number;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/**
 * Single-series column chart. Thin columns with a 2px surface gap, 4px rounded
 * data-ends on the baseline, a recessive grid, a hover/focus tooltip with a hit
 * area taller than the bar, and a table view for screen readers and exact values.
 */
export function BarChart({
  title,
  bars,
  format,
  height = 200,
  tickEvery = 1,
  highlightMax = true,
}: {
  title: string;
  bars: Bar[];
  format: (n: number) => string;
  height?: number;
  tickEvery?: number;
  highlightMax?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const id = useId();
  const W = 600;
  const padL = 44;
  const padB = 22;
  const H = height;
  const max = niceMax(Math.max(...bars.map((b) => b.value), 0));
  const slot = (W - padL) / Math.max(1, bars.length);
  const barW = Math.max(2, Math.min(28, slot - 2));
  const y = (v: number) => H - padB - (v / max) * (H - padB - 8);
  const ticks = [0, max / 2, max];
  const peak = bars.reduce((best, b, i) => (b.value > (bars[best]?.value ?? -1) ? i : best), 0);

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-center justify-between gap-3">
        <span id={id} className="font-semibold">
          {title}
        </span>
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          aria-pressed={table}
          className="press inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:bg-surface-2 hover:text-text"
        >
          <Table2 aria-hidden className="size-4" /> {table ? 'ดูกราฟ' : 'ดูตาราง'}
        </button>
      </figcaption>
      {table ? (
        <div className="max-h-72 overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left">
              <tr>
                <th className="px-3 py-2 font-semibold">ช่วง</th>
                <th className="px-3 py-2 text-right font-semibold">ค่า</th>
              </tr>
            </thead>
            <tbody>
              {bars.map((b) => (
                <tr key={b.key} className="border-t border-line">
                  <td className="px-3 py-1.5">{b.label}</td>
                  <td className="tabular px-3 py-1.5 text-right">{format(b.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-labelledby={id} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth="1" />
                <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px]">
                  {format(t)}
                </text>
              </g>
            ))}
            {bars.map((b, i) => {
              const x = padL + i * slot + (slot - barW) / 2;
              const top = y(b.value);
              const h = Math.max(0, H - padB - top);
              const r = Math.min(4, barW / 2, h);
              const active = hover === i;
              return (
                <g key={b.key}>
                  {h > 0 && (
                    <path
                      d={`M${x},${H - padB} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${H - padB} Z`}
                      fill="var(--chart-1)"
                      opacity={hover === null ? (highlightMax && i !== peak ? 0.78 : 1) : active ? 1 : 0.45}
                    />
                  )}
                  {i % tickEvery === 0 && (
                    <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="fill-muted text-[11px]">
                      {b.label}
                    </text>
                  )}
                  <rect
                    x={padL + i * slot}
                    y={0}
                    width={slot}
                    height={H - padB}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${b.label}: ${format(b.value)}`}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className="focus:outline-none"
                  />
                </g>
              );
            })}
          </svg>
          {hover !== null && bars[hover] && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-card"
              style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%`, top: `${(y(bars[hover].value) / H) * 100}%` }}
            >
              <span className="block text-muted">{bars[hover].label}</span>
              <span className="tabular font-bold">{format(bars[hover].value)}</span>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
