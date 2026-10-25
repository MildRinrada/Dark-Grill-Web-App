'use client';

import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export interface ListboxOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

/**
 * Button-triggered listbox used instead of a native <select>. Keyboard: arrows,
 * Home/End, typeahead, Enter/Space to choose, Escape to close.
 */
export function Listbox<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  hideLabel,
}: {
  label: string;
  value: T;
  options: ListboxOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  hideLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    list.current?.focus();
    const onDoc = (e: MouseEvent) => {
      if (!list.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, options, value]);

  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
    button.current?.focus();
  };

  const move = (from: number, step: number) => {
    let i = from;
    for (let n = 0; n < options.length; n++) {
      i = (i + step + options.length) % options.length;
      if (!options[i].disabled) return i;
    }
    return from;
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') setActive((a) => move(a, 1));
    else if (e.key === 'ArrowUp') setActive((a) => move(a, -1));
    else if (e.key === 'Home') setActive(move(-1, 1));
    else if (e.key === 'End') setActive(move(options.length, -1));
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      if (e.key === 'Escape') button.current?.focus();
      return;
    } else if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { text: now - typed.current.at < 700 ? typed.current.text + e.key : e.key, at: now };
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text.toLowerCase()));
      if (hit >= 0) setActive(hit);
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <div className={clsx('relative', className)}>
      <span id={`${id}-label`} className={hideLabel ? 'sr-only' : 'mb-1.5 block text-sm font-semibold'}>
        {label}
      </span>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="press flex h-11 w-full items-center justify-between gap-3 rounded-control border border-line bg-surface pl-4 pr-3 text-left text-[15px] font-medium text-text hover:border-text/40"
      >
        <span id={`${id}-value`} className="truncate">
          {current?.label ?? 'เลือก'}
        </span>
        <ChevronDown aria-hidden className={clsx('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          ref={list}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${id}-label`}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onKey}
          className="absolute left-0 right-0 z-50 mt-2 max-h-72 min-w-56 overflow-auto rounded-2xl border border-line bg-surface p-1.5 shadow-card focus:outline-none"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={clsx(
                'flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-[15px]',
                i === active && 'bg-surface-2',
                o.disabled && 'cursor-not-allowed opacity-45',
              )}
            >
              <Check aria-hidden className={clsx('mt-0.5 size-4 shrink-0', o.value === value ? 'text-accent-text' : 'invisible')} />
              <span className="flex flex-col">
                <span className="font-medium">{o.label}</span>
                {o.description && <span className="text-sm text-muted">{o.description}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
