'use client';

import { Flame, QrCode } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useCart } from '@/components/providers/cart';
import { BRANCH_COOKIE } from '@/components/site-header';
import { api } from '@/lib/api';
import type { Branch } from '@/lib/types';

/** Landing for the QR sticker on each table: binds the cart to the branch and table, then opens the menu. */
export default function TableEntry() {
  const { branch: slug, table } = useParams<{ branch: string; table: string }>();
  const router = useRouter();
  const { setContext } = useCart();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [error, setError] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const { data } = await api<{ data: Branch[] }>('/branches');
      const b = data.find((x) => x.slug === slug);
      if (!b || !/^[0-9A-Za-z-]{1,10}$/.test(table)) return setError(true);
      setBranch(b);
      document.cookie = `${BRANCH_COOKIE}=${b.id}; path=/; max-age=${60 * 60 * 6}; samesite=lax`;
      await setContext({ branchId: b.id, channel: 'QR', tableNo: table });
      setTimeout(() => router.replace('/menu'), 900);
    })().catch(() => setError(true));
  }, [slug, table, router, setContext]);

  return (
    <main id="main" data-theme="dark" className="grid min-h-dvh place-items-center bg-bg px-6 text-center text-text">
      {error ? (
        <div>
          <QrCode aria-hidden className="mx-auto size-12 text-muted" />
          <h1 className="mt-4 text-2xl font-bold">QR นี้ใช้ไม่ได้</h1>
          <p className="mt-2 text-muted">แจ้งพนักงานเพื่อขอ QR ของโต๊ะใหม่</p>
        </div>
      ) : (
        <div>
          <Flame aria-hidden className="mx-auto size-12 text-flame" />
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-muted">{branch?.name ?? 'Dark Grill'}</p>
          <h1 className="mt-2 font-display text-[28vw] leading-none sm:text-[160px]">
            <span className="sr-only">โต๊ะ </span>
            {table}
          </h1>
          <p className="mt-2 text-lg" role="status">
            กำลังเปิดเมนูสำหรับโต๊ะนี้
          </p>
        </div>
      )}
    </main>
  );
}
