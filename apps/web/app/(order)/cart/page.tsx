'use client';

import { ShoppingBag, Tag } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CartLine } from '@/components/cart/cart-line';
import { Totals } from '@/components/cart/totals';
import { Upsell } from '@/components/cart/upsell';
import { useCart } from '@/components/providers/cart';
import { Button, inputClass, Spinner } from '@/components/ui';

export default function CartPage() {
  const { cart, busy, update, remove, setPromo } = useCart();
  const [code, setCode] = useState('');

  if (!cart) {
    return (
      <div className="grid place-items-center py-32">
        <Spinner label="กำลังโหลดตะกร้า" />
      </div>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <div className="grid size-20 place-items-center rounded-full bg-surface-2">
          <ShoppingBag aria-hidden className="size-9 text-muted" />
        </div>
        <h1 className="font-display-th text-3xl font-black">ตะกร้ายังว่าง</h1>
        <p className="max-w-[36ch] text-muted">เลือกเบอร์เกอร์สักชิ้น หรือแต่งเองทีละชั้นก็ได้</p>
        <div className="mt-2 flex gap-3">
          <Link href="/menu" className="press inline-flex h-12 items-center rounded-chip bg-accent px-6 font-semibold text-accent-ink">
            ดูเมนู
          </Link>
          <Link href="/build" className="press inline-flex h-12 items-center rounded-chip border border-line bg-surface px-6 font-semibold">
            แต่งเบอร์เกอร์เอง
          </Link>
        </div>
      </div>
    );
  }

  const cartKey = cart.lines.map((l) => `${l.lineId}:${l.qty}`).join('|');
  const hasIssues = cart.issues.length > 0;

  return (
    <div className="grid gap-8 pt-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <section aria-labelledby="cart-title">
        <h1 id="cart-title" className="font-display-th text-4xl font-black">
          ตะกร้า <span className="tabular text-2xl font-bold text-muted">{cart.itemCount} ชิ้น</span>
        </h1>
        {cart.tableNo && <p className="mt-2 inline-flex rounded-chip bg-surface-2 px-3 py-1 text-sm font-semibold">โต๊ะ {cart.tableNo}</p>}
        <ul className="mt-2 divide-y divide-line">
          {cart.lines.map((l) => (
            <CartLine
              key={l.lineId}
              line={l}
              disabled={busy}
              onQty={(qty) => update(l.lineId, { qty })}
              onRemove={() => remove(l.lineId)}
            />
          ))}
        </ul>
        <Upsell cartKey={cartKey} branchId={cart.branchId} />
      </section>

      <aside className="rounded-card border border-line bg-surface p-5 shadow-card lg:sticky lg:top-24">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const next = await setPromo(code.trim() || null);
            if (next?.promo?.valid) setCode('');
          }}
        >
          <label htmlFor="promo" className="sr-only">
            โค้ดส่วนลด
          </label>
          <div className="relative flex-1">
            <Tag aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              id="promo"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={cart.promoCode ?? 'โค้ดส่วนลด'}
              autoComplete="off"
              aria-invalid={cart.promo && !cart.promo.valid ? true : undefined}
              aria-describedby="promo-msg"
              className={`${inputClass} pl-10 uppercase`}
            />
          </div>
          <Button type="submit" variant="secondary" size="lg" disabled={!code.trim()} loading={busy}>
            ใช้โค้ด
          </Button>
        </form>
        {cart.promo && (
          <p id="promo-msg" className={`mt-2 text-sm ${cart.promo.valid ? 'text-success' : 'text-danger'}`}>
            {cart.promo.valid ? `ใช้โค้ด ${cart.promo.code} แล้ว: ${cart.promo.message}` : cart.promo.message}
            {cart.promoCode && (
              <button type="button" className="ml-2 font-semibold underline" onClick={() => setPromo(null)}>
                เอาออก
              </button>
            )}
          </p>
        )}

        <div className="mt-5">
          <Totals cart={cart} />
        </div>

        {hasIssues && (
          <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
            {cart.issues[0].message} แก้ไขรายการก่อนชำระเงิน
          </p>
        )}

        {cart.eta && (
          <p className="mt-4 text-sm text-muted">
            ครัวพร้อมทำใน ~{cart.eta.prepMinutes + cart.eta.queueMinutes} นาที
            {cart.eta.kitchenBusy && ' (ช่วงนี้ครัวคิวแน่น เวลารับจะเลื่อนออกเล็กน้อย)'}
          </p>
        )}

        <Link
          href={hasIssues ? '#' : '/checkout'}
          aria-disabled={hasIssues}
          onClick={(e) => hasIssues && e.preventDefault()}
          className="press mt-5 flex h-14 items-center justify-center rounded-chip bg-accent text-lg font-bold text-accent-ink aria-disabled:cursor-not-allowed aria-disabled:bg-surface-2 aria-disabled:text-muted"
        >
          ไปชำระเงิน
        </Link>
      </aside>
    </div>
  );
}
