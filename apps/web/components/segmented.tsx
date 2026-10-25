'use client';

import clsx from 'clsx';
import { useId, useRef } from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  disabled?: boolean;
}

/** Radio group drawn as selectable cards. Arrow keys move the selection. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = 3,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (v: T) => void;
  columns?: 2 | 3;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.filter((o) => !o.disabled);

  const onKey = (e: React.KeyboardEvent, current: T) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = enabled.findIndex((o) => o.value === current);
    const next = enabled[(i + dir + enabled.length) % enabled.length];
    onChange(next.value);
    refs.current[options.indexOf(next)]?.focus();
  };

  return (
    <fieldset>
      <legend id={id} className="mb-3 text-base font-bold">
        {label}
      </legend>
      <div role="radiogroup" aria-labelledby={id} className={clsx('grid gap-2', columns === 3 ? 'sm:grid-cols-3' : 'grid-cols-2')}>
        {options.map((o, i) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => void (refs.current[i] = el)}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={o.disabled}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => onKey(e, o.value)}
              className={clsx(
                'press flex items-start gap-3 rounded-2xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-45',
                selected ? 'border-text bg-surface ring-2 ring-text' : 'border-line bg-surface hover:border-text/40',
              )}
            >
              {o.icon && <o.icon aria-hidden className={clsx('mt-0.5 size-5 shrink-0', selected ? 'text-accent-text' : 'text-muted')} />}
              <span>
                <span className="block font-semibold">{o.label}</span>
                {o.description && <span className="block text-sm text-muted">{o.description}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
