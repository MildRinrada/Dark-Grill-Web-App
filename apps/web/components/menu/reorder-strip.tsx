'use client';

import { RotateCcw } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { baht, shortDate } from '@/lib/format';
import type { OrderView } from '@/lib/types';
import { useCart } from '../providers/cart';
import { useNotify } from '../providers/feedback';
import { useSession } from '../providers/session';
import { Button } from '../ui';

/** "Order again" in one tap: habit is the strongest predictor of coming back. */
export function ReorderStrip() {
  const { user } = useSession();
  const { refresh } = useCart();
  const notify = useNotify();
  const router = useRouter();
  const [last, setLast] = useState<OrderView | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return setLast(null);
    api<{ order: OrderView | null }>('/orders/last')
      .then((r) => setLast(r.order))
      .catch(() => undefined);
  }, [user]);

  if (!last) return null;

  const reorder = async () => {
    setBusy(true);
    try {
      const r = await api<{ skipped: string[] }>(`/orders/${last.id}/reorder`, { method: 'POST' });
      await refresh();
      if (r.skipped.length) notify(`บางเมนูไม่มีขายแล้ว: ${r.skipped.join(', ')}`, 'info');
      router.push('/cart');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'สั่งซ้ำไม่สำเร็จ', 'error');
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="ออเดอร์ที่แล้ว"
      className="mt-4 flex items-center gap-4 rounded-card border border-line bg-surface p-3 pr-4 shadow-card"
    >
      <div className="flex -space-x-3">
        {last.items.slice(0, 3).map((i) => (
          <div key={i.id} className="relative size-12 overflow-hidden rounded-full border-2 border-surface bg-surface-2">
            {i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="48px" className="object-cover" />}
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted">ออเดอร์ที่แล้ว {shortDate(last.createdAt)}</p>
        <p className="truncate font-semibold">{last.items.map((i) => `${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`).join(', ')}</p>
      </div>
      <Button onClick={reorder} loading={busy} size="sm" className="shrink-0">
        <RotateCcw aria-hidden className="size-4" />
        สั่งซ้ำ {baht(last.totals.subtotalSatang)}
      </Button>
    </section>
  );
}
