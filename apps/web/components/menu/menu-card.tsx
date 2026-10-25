'use client';

import clsx from 'clsx';
import { Clock, Flame, Leaf, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRef, ViewTransition } from 'react';
import { baht } from '@/lib/format';
import type { MenuCard as Card } from '@/lib/types';

export function discountPercent(item: Pick<Card, 'priceSatang' | 'compareAtSatang'>) {
  if (!item.compareAtSatang || item.compareAtSatang <= item.priceSatang) return 0;
  return Math.round((1 - item.priceSatang / item.compareAtSatang) * 100);
}

export function SpiceMarks({ level }: { level: number }) {
  if (!level) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-sauce" aria-label={`เผ็ดระดับ ${level} จาก 3`}>
      {Array.from({ length: level }, (_, i) => (
        <Flame key={i} aria-hidden className="size-3.5" strokeWidth={2.4} />
      ))}
    </span>
  );
}

export function MenuCard({
  item,
  onQuickAdd,
  featured,
  priority,
}: {
  item: Card;
  onQuickAdd: (item: Card, imageEl: HTMLElement | null) => void;
  featured?: boolean;
  priority?: boolean;
}) {
  const off = discountPercent(item);
  const imageEl = useRef<HTMLDivElement>(null);
  return (
    <article
      className={clsx(
        'group relative flex overflow-hidden rounded-card border border-line bg-surface shadow-card',
        featured ? 'flex-col sm:col-span-2 sm:flex-row' : 'flex-col',
        !item.isAvailable && 'opacity-70',
      )}
    >
      <Link
        href={`/menu/${item.slug}`}
        className={clsx(
          'relative block overflow-hidden bg-surface-2',
          featured ? 'aspect-[4/3] sm:aspect-auto sm:w-[58%]' : 'aspect-[4/3]',
        )}
        aria-label={`${item.name} ดูรายละเอียด`}
      >
        <ViewTransition name={`menu-img-${item.id}`} share="morph" default="none">
          <div ref={imageEl} className="absolute inset-0">
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              priority={priority}
              sizes={
                featured
                  ? '(min-width: 1024px) 560px, (min-width: 640px) 60vw, 100vw'
                  : '(min-width: 1024px) 280px, (min-width: 640px) 45vw, 100vw'
              }
              className={clsx(
                'object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]',
                !item.isAvailable && 'grayscale',
              )}
            />
          </div>
        </ViewTransition>
        {off > 0 && (
          <span className="absolute left-3 top-3 rounded-chip bg-promo px-2.5 py-1 text-xs font-bold text-promo-ink">ลด {off}%</span>
        )}
        {!item.isAvailable && (
          <span className="absolute inset-x-3 bottom-3 rounded-chip bg-ink/85 px-3 py-1.5 text-center text-sm font-semibold text-bun">
            หมดชั่วคราว
          </span>
        )}
      </Link>

      <div className={clsx('flex flex-1 flex-col gap-2 p-4', featured && 'sm:justify-center sm:p-7')}>
        <div className="flex items-start justify-between gap-2">
          <h3 className={clsx('font-display-th font-bold leading-tight', featured ? 'text-2xl sm:text-3xl' : 'text-[17px]')}>
            <Link href={`/menu/${item.slug}`} className="hover:underline">
              {item.name}
            </Link>
          </h3>
        </div>
        {featured && <p className="max-w-[44ch] text-[15px] text-muted">{item.description}</p>}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          <span className="tabular">{item.calories} kcal</span>
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden className="size-3.5" />
            {item.prepMinutes} นาที
          </span>
          {item.isVegetarian && (
            <span className="inline-flex items-center gap-1 text-success">
              <Leaf aria-hidden className="size-3.5" />
              มังสวิรัติ
            </span>
          )}
          <SpiceMarks level={item.spicyLevel} />
        </p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-1">
          <span className="tabular flex items-baseline gap-2">
            <span className={clsx('font-bold text-accent-text', featured ? 'text-2xl' : 'text-lg')}>{baht(item.priceSatang)}</span>
            {off > 0 && (
              <span className="text-sm text-muted line-through">
                <span className="sr-only">ราคาปกติ </span>
                {baht(item.compareAtSatang!)}
              </span>
            )}
          </span>
          <button
            type="button"
            disabled={!item.isAvailable}
            onClick={() => onQuickAdd(item, imageEl.current)}
            className="press grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--flame)_70%,transparent)] hover:brightness-105 disabled:bg-surface-2 disabled:text-muted disabled:shadow-none"
            aria-label={item.isAvailable ? `เพิ่ม ${item.name} ลงตะกร้า` : `${item.name} หมดชั่วคราว`}
          >
            <Plus className="size-5" strokeWidth={2.6} aria-hidden />
          </button>
        </div>
      </div>
    </article>
  );
}
