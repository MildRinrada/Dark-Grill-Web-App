'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CartButton, Logo } from '../site-header';

/** Transparent over the hero, gains a surface once the page scrolls. */
export function BrandHeader() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={clsx(
        'fixed inset-x-0 top-0 z-40 transition-colors duration-300',
        solid ? 'border-b border-line bg-bg/85 backdrop-blur-md' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Logo />
        <nav aria-label="หลัก" className="ml-auto hidden items-center gap-1 sm:flex">
          <Link href="/menu" className="press rounded-full px-4 py-2 font-medium text-muted hover:text-text">
            เมนู
          </Link>
          <Link href="/build" className="press rounded-full px-4 py-2 font-medium text-muted hover:text-text">
            แต่งเอง
          </Link>
          <Link href="/account" className="press rounded-full px-4 py-2 font-medium text-muted hover:text-text">
            Crowns
          </Link>
        </nav>
        <Link
          href="/menu"
          className="press ml-auto inline-flex h-11 items-center rounded-chip bg-accent px-5 font-bold text-accent-ink hover:brightness-105 sm:ml-2"
        >
          สั่งเลย
        </Link>
        <CartButton className="!bg-surface !text-text" />
      </div>
    </header>
  );
}
