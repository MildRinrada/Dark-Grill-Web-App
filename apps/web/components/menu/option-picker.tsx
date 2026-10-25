'use client';

import clsx from 'clsx';
import { Check, Minus, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { baht } from '@/lib/format';
import type { ItemDetail, OptionGroupView } from '@/lib/types';

export function defaultSelection(groups: OptionGroupView[]): Record<string, string[]> {
  return Object.fromEntries(
    groups.map((g) => {
      const defaults = g.options.filter((o) => o.isDefault).map((o) => o.id);
      if (defaults.length === 0 && g.minSelect > 0) defaults.push(g.options[0].id);
      return [g.id, defaults.slice(0, g.maxSelect)];
    }),
  );
}

export function useOptionSelection(item: ItemDetail | null) {
  const [picked, setPicked] = useState<Record<string, string[]>>(() => (item ? defaultSelection(item.optionGroups) : {}));
  const [qty, setQty] = useState(1);

  const toggle = (group: OptionGroupView, optionId: string) =>
    setPicked((p) => {
      const current = p[group.id] ?? [];
      if (group.maxSelect === 1) return { ...p, [group.id]: group.minSelect === 0 && current[0] === optionId ? [] : [optionId] };
      if (current.includes(optionId)) return { ...p, [group.id]: current.filter((x) => x !== optionId) };
      if (current.length >= group.maxSelect) return p;
      return { ...p, [group.id]: [...current, optionId] };
    });

  const summary = useMemo(() => {
    if (!item) return { optionIds: [], unit: 0, calories: 0, missing: [] as string[] };
    const optionIds = Object.values(picked).flat();
    const chosen = item.optionGroups.flatMap((g) => g.options).filter((o) => optionIds.includes(o.id));
    const missing = item.optionGroups.filter((g) => (picked[g.id]?.length ?? 0) < g.minSelect).map((g) => g.name);
    return {
      optionIds,
      unit: item.priceSatang + chosen.reduce((a, o) => a + o.priceDeltaSatang, 0),
      calories: item.calories + chosen.reduce((a, o) => a + o.caloriesDelta, 0),
      missing,
    };
  }, [item, picked]);

  return { picked, toggle, qty, setQty, ...summary, reset: (i: ItemDetail) => setPicked(defaultSelection(i.optionGroups)) };
}

export function OptionGroups({
  groups,
  picked,
  onToggle,
}: {
  groups: OptionGroupView[];
  picked: Record<string, string[]>;
  onToggle: (g: OptionGroupView, optionId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => {
        const count = picked[g.id]?.length ?? 0;
        const rule =
          g.minSelect > 0 ? (g.maxSelect === 1 ? 'เลือก 1' : `เลือก ${g.minSelect}-${g.maxSelect}`) : `ไม่บังคับ เลือกได้ ${g.maxSelect}`;
        return (
          <fieldset key={g.id}>
            <legend className="mb-3 flex w-full items-baseline justify-between gap-3">
              <span className="text-base font-bold">{g.name}</span>
              <span className={clsx('text-sm', g.minSelect > count ? 'font-semibold text-danger' : 'text-muted')}>{rule}</span>
            </legend>
            <div className="flex flex-wrap gap-2" role={g.maxSelect === 1 ? 'radiogroup' : 'group'} aria-label={g.name}>
              {g.options.map((o) => {
                const selected = picked[g.id]?.includes(o.id) ?? false;
                const full = !selected && g.maxSelect > 1 && count >= g.maxSelect;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role={g.maxSelect === 1 ? 'radio' : 'checkbox'}
                    aria-checked={selected}
                    disabled={full}
                    onClick={() => onToggle(g, o.id)}
                    className={clsx(
                      'press inline-flex min-h-11 items-center gap-2 rounded-chip border px-4 text-[15px] font-medium disabled:cursor-not-allowed disabled:opacity-40',
                      selected ? 'border-text bg-text text-bg' : 'border-line bg-surface text-text hover:border-text/40',
                    )}
                  >
                    {selected && <Check aria-hidden className="size-4" />}
                    {o.name}
                    {o.priceDeltaSatang > 0 && (
                      <span className={clsx('tabular text-sm', selected ? 'text-bg/75' : 'text-muted')}>+{baht(o.priceDeltaSatang)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  size = 'md',
  label = 'จำนวน',
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}) {
  const btn = size === 'sm' ? 'size-8' : size === 'lg' ? 'size-14' : 'size-11';
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-1 rounded-chip border border-line bg-surface p-1">
      <button
        type="button"
        className={clsx('press grid place-items-center rounded-full hover:bg-surface-2 disabled:opacity-35', btn)}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label="ลดจำนวน"
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <output aria-live="polite" className={clsx('tabular text-center font-bold', size === 'lg' ? 'w-10 text-xl' : 'w-7')}>
        {value}
      </output>
      <button
        type="button"
        className={clsx('press grid place-items-center rounded-full hover:bg-surface-2 disabled:opacity-35', btn)}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label="เพิ่มจำนวน"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
