'use client';

import clsx from 'clsx';
import { Flame, ShoppingBag, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Branch } from '@/lib/types';
import { Listbox } from './listbox';
import { useCart } from './providers/cart';
import { useSession } from './providers/session';

export const BRANCH_COOKIE = 'branch';

export function readBranchCookie(): string {
  if (typeof document === 'undefined') return 'br_siam';
  return document.cookie.match(/(?:^|; )branch=([^;]+)/)?.[1] ?? 'br_siam';
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={clsx('press inline-flex items-center gap-1.5', className)} aria-label="Dark Grill หน้าแรก">
      <Flame aria-hidden className="size-6 text-flame" strokeWidth={2.4} />
      <span className="font-display text-[22px] uppercase leading-none tracking-wide">Dark Grill</span>
    </Link>
  );
}

export function CartButton({ className }: { className?: string }) {
  const { cart, bump, registerTarget } = useCart();
  const count = cart?.itemCount ?? 0;
  return (
    <Link
      href="/cart"
      ref={registerTarget}
      className={clsx('press relative inline-flex size-11 items-center justify-center rounded-full bg-text text-bg', className)}
      aria-label={`ตะกร้า ${count} ชิ้น`}
    >
      <ShoppingBag className="size-5" aria-hidden />
      {count > 0 && (
        <span
          key={bump}
          className="badge-pop tabular absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs font-bold text-accent-ink"
          aria-hidden
        >
          {count}
        </span>
      )}
    </Link>
  );
}

export function BranchPicker({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const { setContext } = useCart();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [value, setValue] = useState('br_siam');

  useEffect(() => {
    setValue(readBranchCookie());
    api<{ data: Branch[] }>('/branches')
      .then((r) => setBranches(r.data))
      .catch(() => undefined);
  }, []);

  if (!branches.length) return <div className="h-11 w-40 rounded-control skeleton" aria-hidden />;

  return (
    <Listbox
      label="สาขา"
      hideLabel={compact}
      value={value}
      className={compact ? 'w-44' : 'w-full'}
      options={branches.map((b) => ({
        value: b.id,
        label: b.name,
        description: `${b.isOpen ? 'เปิดอยู่' : 'ปิดแล้ว'} ${b.opensAt}-${b.closesAt}`,
      }))}
      onChange={async (id) => {
        setValue(id);
        document.cookie = `${BRANCH_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
        await setContext({ branchId: id });
        router.refresh();
      }}
    />
  );
}

const NAV = [
  { href: '/menu', label: 'เมนู' },
  { href: '/build', label: 'แต่งเบอร์เกอร์' },
  { href: '/account', label: 'ออเดอร์และแต้ม' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { user } = useSession();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/92 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Logo />
        <nav aria-label="หลัก" className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={pathname.startsWith(n.href) ? 'page' : undefined}
              className="press rounded-full px-4 py-2 text-[15px] font-medium text-muted hover:text-text aria-[current=page]:bg-surface-2 aria-[current=page]:text-text"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <BranchPicker compact />
          </div>
          <Link
            href={user ? '/account' : '/login'}
            className="press inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface hover:border-text/40"
            aria-label={user ? 'บัญชีของฉัน' : 'เข้าสู่ระบบ'}
          >
            <UserRound className="size-5" aria-hidden />
          </Link>
          <CartButton />
        </div>
      </div>
    </header>
  );
}
