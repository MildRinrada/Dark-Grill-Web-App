'use client';

import { ArrowLeft, Clock, Flame, Leaf, ShieldCheck, Star, Wheat } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, ViewTransition } from 'react';
import { baht } from '@/lib/format';
import type { ItemDetail } from '@/lib/types';
import { useCart } from '../providers/cart';
import { useNotify } from '../providers/feedback';
import { Steam } from '../steam';
import { Button } from '../ui';
import { discountPercent, SpiceMarks } from './menu-card';
import { OptionGroups, QtyStepper, useOptionSelection } from './option-picker';

export function ProductView({ item }: { item: ItemDetail }) {
  const sel = useOptionSelection(item);
  const { add, busy } = useCart();
  const notify = useNotify();
  const router = useRouter();
  const imageRef = useRef<HTMLDivElement>(null);
  const off = discountPercent(item);
  const hot = item.category.kind === 'BURGER' || item.category.kind === 'COMBO';

  const submit = async () => {
    const ok = await add({ menuItemId: item.id, qty: sel.qty, optionIds: sel.optionIds }, imageRef.current, item.imageUrl);
    if (ok) notify(`เพิ่ม ${item.name} x${sel.qty} แล้ว`, 'success');
  };

  return (
    <article className="pb-28 md:grid md:grid-cols-[1.1fr_1fr] md:gap-10 md:pb-10 md:pt-8">
      <div className="-mx-4 md:mx-0">
        <div className="relative md:sticky md:top-24">
          <ViewTransition name={`menu-img-${item.id}`} share="morph" default="none">
            <div ref={imageRef} className="relative aspect-square w-full overflow-hidden bg-surface-2 md:rounded-[28px]">
              <Image src={item.imageUrl} alt={item.name} fill priority sizes="(min-width: 768px) 560px, 100vw" className="object-cover" />
              {hot && <Steam className="left-[30%] top-[14%] w-[40%]" />}
            </div>
          </ViewTransition>
          <button
            type="button"
            onClick={() => (history.length > 1 ? router.back() : router.push('/menu'))}
            className="press absolute left-4 top-4 grid size-11 place-items-center rounded-full bg-surface/90 shadow-card backdrop-blur hover:bg-surface"
            aria-label="กลับไปหน้าเมนู"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </button>
          {off > 0 && (
            <span className="absolute right-4 top-4 rounded-chip bg-promo px-3 py-1.5 text-sm font-bold text-promo-ink">ลด {off}%</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6 pt-6 md:pt-0">
        <header className="flex flex-col gap-3">
          <Link href="/menu" className="text-sm font-semibold text-muted hover:text-text">
            {item.category.name}
          </Link>
          <h1 className="max-w-[16ch] font-display-th text-4xl font-black leading-[1.05] sm:text-5xl">{item.name}</h1>
          <p className="font-display text-lg uppercase tracking-wider text-muted">{item.nameEn}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="tabular flex items-baseline gap-2">
              <span className="text-3xl font-bold text-accent-text">{baht(item.priceSatang)}</span>
              {off > 0 && (
                <span className="text-lg text-muted line-through">
                  <span className="sr-only">ราคาปกติ </span>
                  {baht(item.compareAtSatang!)}
                </span>
              )}
            </span>
            {item.rating.average && (
              <span className="inline-flex items-center gap-1 text-[15px]">
                <Star aria-hidden className="size-4 fill-cheese text-cheese" />
                <strong>{item.rating.average}</strong>
                <span className="text-muted">({item.rating.count} รีวิว)</span>
              </span>
            )}
          </div>
          <p className="max-w-[52ch] text-[17px] leading-relaxed text-muted">{item.description}</p>
        </header>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-surface p-3">
            <dt className="text-xs font-semibold text-muted">พลังงาน</dt>
            <dd className="tabular text-lg font-bold">{sel.calories} kcal</dd>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-3">
            <dt className="flex items-center gap-1 text-xs font-semibold text-muted">
              <Clock aria-hidden className="size-3.5" /> เวลาปรุง
            </dt>
            <dd className="tabular text-lg font-bold">~{item.prepMinutes} นาที</dd>
          </div>
          <div className="col-span-2 rounded-2xl border border-line bg-surface p-3 sm:col-span-1">
            <dt className="flex items-center gap-1 text-xs font-semibold text-muted">
              <Wheat aria-hidden className="size-3.5" /> สารก่อภูมิแพ้
            </dt>
            <dd className="text-[15px] font-semibold">{item.allergens.length ? item.allergens.join(', ') : 'ไม่มีที่ต้องแจ้ง'}</dd>
          </div>
        </dl>

        <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck aria-hidden className="size-4 text-success" />
            ปรุงสุกใหม่ทุกออเดอร์ เวลารอคำนวณจากคิวครัวจริง
          </span>
          {item.isVegetarian && (
            <span className="inline-flex items-center gap-1.5 text-success">
              <Leaf aria-hidden className="size-4" /> มังสวิรัติ
            </span>
          )}
          {item.spicyLevel > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <SpiceMarks level={item.spicyLevel} /> เผ็ด
            </span>
          )}
        </p>

        {item.ingredients.length > 0 && (
          <p className="text-[15px]">
            <span className="font-semibold">วัตถุดิบ: </span>
            <span className="text-muted">{item.ingredients.filter((n) => !n.includes('กล่อง')).join(' · ')}</span>
          </p>
        )}

        {item.optionGroups.length > 0 && <OptionGroups groups={item.optionGroups} picked={sel.picked} onToggle={sel.toggle} />}

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-md md:static md:rounded-card md:border md:p-4">
          {!item.isAvailable ? (
            <p className="py-3 text-center font-semibold text-muted">
              <Flame aria-hidden className="mr-1 inline size-4" />
              เมนูนี้หมดชั่วคราวที่สาขานี้
            </p>
          ) : (
            <div className="mx-auto flex max-w-6xl items-center gap-3">
              <QtyStepper value={sel.qty} onChange={sel.setQty} />
              <Button size="lg" className="flex-1" disabled={sel.missing.length > 0} loading={busy} onClick={submit}>
                {sel.missing.length ? `เลือก${sel.missing[0]}` : `เพิ่มลงตะกร้า ${baht(sel.unit * sel.qty)}`}
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
