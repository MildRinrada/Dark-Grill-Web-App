'use client';

import clsx from 'clsx';
import { Check, Plus, RotateCcw, Undo2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { baht } from '@/lib/format';
import type { BuilderIngredient } from '@/lib/types';
import { useCart } from '../providers/cart';
import { useNotify } from '../providers/feedback';
import { Button } from '../ui';
import { AnimatedNumber } from './animated-number';
import { LAYER_HEIGHT, LAYER_OVERLAP, LayerShape, LayerSvg, shapeOf } from './layer';

const GROUPS: { kind: BuilderIngredient['kind']; label: string }[] = [
  { kind: 'BUN', label: 'ขนมปัง' },
  { kind: 'PATTY', label: 'เนื้อ' },
  { kind: 'CHEESE', label: 'ชีส' },
  { kind: 'VEG', label: 'ผัก' },
  { kind: 'EXTRA', label: 'ท็อปปิ้ง' },
  { kind: 'SAUCE', label: 'ซอส' },
];

const SCALE = 1.05;

interface Placed {
  key: number;
  ingredient: BuilderIngredient;
}

export function Builder({
  base,
  ingredients,
}: {
  base: { menuItemId: string; priceSatang: number; calories: number; maxLayers: number };
  ingredients: BuilderIngredient[];
}) {
  const buns = ingredients.filter((i) => i.kind === 'BUN');
  const [bun, setBun] = useState<BuilderIngredient>(buns.find((b) => b.inStock) ?? buns[0]);
  const [stack, setStack] = useState<Placed[]>([]);
  const [tab, setTab] = useState<BuilderIngredient['kind']>('PATTY');
  const counter = useRef(0);
  const { add, busy } = useCart();
  const notify = useNotify();
  const stageRef = useRef<HTMLDivElement>(null);

  const total = base.priceSatang + bun.priceSatang + stack.reduce((a, l) => a + l.ingredient.priceSatang, 0);
  const calories = base.calories + bun.calories + stack.reduce((a, l) => a + l.ingredient.calories, 0);
  const hasPatty = stack.some((l) => l.ingredient.kind === 'PATTY');
  const full = stack.length >= base.maxLayers;

  const push = (ingredient: BuilderIngredient) => {
    if (full) return notify(`ซ้อนได้สูงสุด ${base.maxLayers} ชั้น`, 'info');
    setStack((s) => [...s, { key: ++counter.current, ingredient }]);
  };

  // positions measured from the bottom of the stage, bottom bun first
  const layout = useMemo(() => {
    const rows: { key: string; shape: LayerShape; color: string; bottom: number; name: string; removable?: number }[] = [];
    let y = 0;
    const put = (key: string, shape: LayerShape, color: string, name: string, removable?: number) => {
      rows.push({ key, shape, color, bottom: y, name, removable });
      y += (LAYER_HEIGHT[shape] - LAYER_OVERLAP[shape]) * SCALE;
    };
    put('bun-bottom', 'bun-bottom', bun.color ?? '#E3A04F', bun.name);
    for (const l of stack) put(`l-${l.key}`, shapeOf(l.ingredient.shape), l.ingredient.color ?? '#999999', l.ingredient.name, l.key);
    put('bun-top', 'bun-top', bun.color ?? '#E3A04F', bun.name);
    return { rows, height: y + 30 };
  }, [bun, stack]);

  const submit = async () => {
    const ok = await add(
      { menuItemId: base.menuItemId, layers: [bun.id, ...stack.map((l) => l.ingredient.id)] },
      stageRef.current,
      '/images/menu/build-float.jpg',
    );
    if (ok) {
      notify('เพิ่มเบอร์เกอร์ที่คุณแต่งลงตะกร้าแล้ว', 'success');
      setStack([]);
    }
  };

  const visible = ingredients.filter((i) => i.kind === tab);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
      {/* stage */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div
          ref={stageRef}
          data-theme="dark"
          className="relative flex min-h-[420px] flex-col overflow-hidden rounded-[28px] bg-bg text-text sm:min-h-[520px]"
        >
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_70%,color-mix(in_srgb,var(--flame)_20%,transparent),transparent_70%)]"
            aria-hidden
          />
          <div className="relative flex items-start justify-between gap-4 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">ราคา</p>
              <p className="text-3xl font-bold text-flame" aria-live="polite">
                <AnimatedNumber value={total} format={baht} />
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">พลังงาน</p>
              <p className="text-3xl font-bold">
                <AnimatedNumber value={calories} format={(n) => `${n}`} />
                <span className="ml-1 text-base font-medium text-muted">kcal</span>
              </p>
            </div>
          </div>

          <div className="relative mx-auto mt-auto w-[min(315px,80%)]" style={{ height: layout.height }} aria-hidden>
            {layout.rows.map((r, i) => (
              // outer box slides when layers below change (transform only); inner box drops in once
              <div
                key={r.key}
                className="absolute inset-x-0 bottom-0 transition-transform duration-[250ms] ease-[var(--ease-snap)] motion-reduce:transition-none"
                style={{ transform: `translate3d(0, ${-r.bottom}px, 0)`, zIndex: i }}
              >
                <div className="drop-in" style={{ ['--tilt' as string]: i % 2 ? '4deg' : '-4deg' }}>
                  <LayerSvg shape={r.shape} color={r.color} className="w-full drop-shadow-[0_5px_8px_rgb(0_0_0/0.4)]" />
                </div>
              </div>
            ))}
          </div>
          <div className="mx-auto mb-6 mt-2 h-3 w-[60%] rounded-[50%] bg-black/50 blur-md" aria-hidden />

          <div className="sr-only" aria-live="polite">
            เบอร์เกอร์ของคุณ: {bun.name}, {stack.map((l) => l.ingredient.name).join(', ') || 'ยังไม่มีไส้'}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => setStack((s) => s.slice(0, -1))}
            disabled={!stack.length}
            aria-label="เอาชั้นล่าสุดออก"
          >
            <Undo2 aria-hidden className="size-5" />
          </Button>
          <Button variant="secondary" size="lg" onClick={() => setStack([])} disabled={!stack.length} aria-label="เริ่มใหม่">
            <RotateCcw aria-hidden className="size-5" />
          </Button>
          <Button size="lg" className="flex-1" disabled={!hasPatty} loading={busy} onClick={submit}>
            {hasPatty ? `เพิ่มลงตะกร้า ${baht(total)}` : 'เพิ่มเนื้ออย่างน้อย 1 ชั้น'}
          </Button>
        </div>
      </div>

      {/* palette */}
      <div className="flex flex-col gap-5">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="หมวดวัตถุดิบ">
          {GROUPS.map((g) => {
            const count = g.kind === 'BUN' ? 1 : stack.filter((l) => l.ingredient.kind === g.kind).length;
            return (
              <button
                key={g.kind}
                type="button"
                role="tab"
                aria-selected={tab === g.kind}
                aria-controls="palette"
                onClick={() => setTab(g.kind)}
                className={clsx(
                  'press inline-flex min-h-11 shrink-0 items-center gap-2 rounded-chip border px-4 text-[15px] font-semibold',
                  tab === g.kind ? 'border-text bg-text text-bg' : 'border-line bg-surface hover:border-text/40',
                )}
              >
                {g.label}
                {count > 0 && (
                  <span
                    className={clsx(
                      'tabular grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs',
                      tab === g.kind ? 'bg-accent text-accent-ink' : 'bg-surface-2',
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div id="palette" role="tabpanel" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visible.map((ing) => {
            const isBun = ing.kind === 'BUN';
            const selected = isBun && bun.id === ing.id;
            const shape: LayerShape = isBun ? 'bun-top' : shapeOf(ing.shape);
            return (
              <button
                key={ing.id}
                type="button"
                disabled={!ing.inStock || (!isBun && full)}
                aria-pressed={isBun ? selected : undefined}
                onClick={() => (isBun ? setBun(ing) : push(ing))}
                className={clsx(
                  'press group relative flex flex-col items-start gap-3 rounded-card border bg-surface p-4 text-left disabled:cursor-not-allowed disabled:opacity-45',
                  selected ? 'border-text ring-2 ring-text' : 'border-line hover:border-text/40',
                )}
              >
                <span className="flex h-14 w-full items-center justify-center rounded-xl bg-surface-2 px-3">
                  <LayerSvg shape={shape} color={ing.color ?? '#999999'} className="max-h-12 w-full" />
                </span>
                <span className="flex w-full items-start justify-between gap-2">
                  <span>
                    <span className="block font-semibold leading-tight">{ing.name}</span>
                    <span className="tabular text-sm text-muted">
                      {ing.priceSatang ? `+${baht(ing.priceSatang)}` : 'ฟรี'} · {ing.calories} kcal
                    </span>
                  </span>
                  <span
                    className={clsx(
                      'grid size-8 shrink-0 place-items-center rounded-full',
                      selected ? 'bg-text text-bg' : 'bg-accent text-accent-ink',
                    )}
                    aria-hidden
                  >
                    {selected ? <Check className="size-4" /> : <Plus className="size-4" />}
                  </span>
                </span>
                {!ing.inStock && <span className="text-sm font-semibold text-danger">หมด</span>}
              </button>
            );
          })}
        </div>

        <section aria-labelledby="stack-list" className="rounded-card border border-line bg-surface p-4">
          <h2 id="stack-list" className="flex items-center justify-between font-bold">
            ชั้นของคุณ
            <span className="tabular text-sm font-medium text-muted">
              {stack.length}/{base.maxLayers}
            </span>
          </h2>
          {stack.length === 0 ? (
            <p className="mt-2 text-[15px] text-muted">แตะวัตถุดิบด้านบนเพื่อวางทีละชั้น เริ่มจากเนื้อก่อนก็ได้</p>
          ) : (
            <ol className="mt-3 flex flex-col-reverse gap-2">
              {stack.map((l, i) => (
                <li key={l.key} className="flex items-center gap-3 rounded-xl bg-surface-2 py-1.5 pl-3 pr-1.5">
                  <span className="tabular w-5 text-sm text-muted">{i + 1}</span>
                  <span className="flex-1 text-[15px] font-medium">{l.ingredient.name}</span>
                  <button
                    type="button"
                    onClick={() => setStack((s) => s.filter((x) => x.key !== l.key))}
                    className="press grid size-9 place-items-center rounded-full hover:bg-line"
                    aria-label={`เอา${l.ingredient.name}ออก`}
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
