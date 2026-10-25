'use client';

import clsx from 'clsx';
import { ChefHat, Receipt, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { baht } from '@/lib/format';
import { useCart } from './providers/cart';

const TABS = [
  { href: '/menu', label: 'เมนู', icon: UtensilsCrossed },
  { href: '/build', label: 'แต่งเอง', icon: ChefHat },
  { href: '/account', label: 'ออเดอร์', icon: Receipt },
];

/** Phone-only bottom navigation with a cart bar that appears once the cart has items. */
export function MobileTabBar() {
  const pathname = usePathname();
  const { cart } = useCart();
  const count = cart?.itemCount ?? 0;
  const showCartBar = count > 0 && !['/cart', '/checkout'].includes(pathname) && !pathname.startsWith('/orders');

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      {showCartBar && (
        <div className="px-3 pb-2">
          <Link href="/cart" className="press flex h-14 items-center justify-between rounded-chip bg-ink px-5 text-bun shadow-2xl">
            <span className="flex items-center gap-3 font-semibold">
              <span className="tabular grid size-8 place-items-center rounded-full bg-flame text-sm font-bold text-ink">{count}</span>
              ดูตะกร้า
            </span>
            <span className="tabular font-bold">{baht(cart?.grandTotalSatang ?? 0)}</span>
          </Link>
        </div>
      )}
      <nav aria-label="เมนูด้านล่าง" className="border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <ul className="grid grid-cols-4">
          {[...TABS, { href: '/cart', label: 'ตะกร้า', icon: ShoppingBag }].map((t) => {
            const current = pathname === t.href || (t.href !== '/' && pathname.startsWith(t.href));
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={current ? 'page' : undefined}
                  className={clsx(
                    'press flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold',
                    current ? 'text-text' : 'text-muted',
                  )}
                >
                  <t.icon aria-hidden className={clsx('size-5', current && 'text-accent-text')} />
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
