'use client';

import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { forwardRef } from 'react';
import { baht } from '@/lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'promo';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-105 disabled:bg-surface-2 disabled:text-muted',
  secondary: 'border border-line bg-surface text-text hover:border-text/40 disabled:text-muted',
  ghost: 'text-text hover:bg-surface-2 disabled:text-muted',
  danger: 'border border-danger/40 bg-transparent text-danger hover:bg-danger hover:text-promo-ink disabled:opacity-50',
  promo: 'bg-promo text-promo-ink hover:brightness-110 disabled:opacity-60',
};
const SIZE: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm gap-1.5',
  md: 'h-11 px-5 text-[15px] gap-2',
  lg: 'h-13 px-7 text-base gap-2.5',
  xl: 'h-16 px-9 text-lg gap-3',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'press inline-flex select-none items-center justify-center rounded-chip font-semibold disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function Chip({ selected, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={clsx(
        'press inline-flex min-h-10 items-center gap-1.5 rounded-chip border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45',
        selected ? 'border-text bg-text text-bg' : 'border-line bg-surface text-text hover:border-text/40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Price({
  satang,
  compareAt,
  size = 'md',
  className,
}: {
  satang: number;
  compareAt?: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const big = size === 'lg' ? 'text-3xl' : size === 'md' ? 'text-lg' : 'text-base';
  return (
    <span className={clsx('tabular inline-flex items-baseline gap-2', className)}>
      <span className={clsx('font-bold text-accent-text', big)}>{baht(satang)}</span>
      {compareAt && compareAt > satang ? (
        <span className="text-sm text-muted line-through">
          <span className="sr-only">ราคาปกติ </span>
          {baht(compareAt)}
        </span>
      ) : null}
    </span>
  );
}

export function Spinner({ label = 'กำลังโหลด' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-muted">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  id,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  'h-12 w-full rounded-control border border-line bg-surface px-4 text-base text-text placeholder:text-muted/80 hover:border-text/30 focus:border-text focus:outline-none aria-[invalid=true]:border-danger disabled:opacity-50';
