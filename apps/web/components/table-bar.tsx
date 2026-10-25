'use client';

import { BellRing, Receipt, X } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useCart } from './providers/cart';
import { useNotify } from './providers/feedback';

/** Shown while the cart is bound to a table (QR ordering): call staff or ask for the bill. */
export function TableBar() {
  const { cart, setContext } = useCart();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  if (!cart?.tableNo || cart.channel !== 'QR') return null;

  const call = async (reason: 'HELP' | 'BILL') => {
    setBusy(true);
    try {
      await api('/tables/call', { method: 'POST', body: { branchId: cart.branchId, tableNo: cart.tableNo, reason } });
      notify(reason === 'BILL' ? 'แจ้งขอเช็กบิลแล้ว พนักงานกำลังมา' : 'เรียกพนักงานแล้ว', 'success');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'เรียกไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-line bg-ink text-bun">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-2 px-4 text-sm">
        <span className="font-semibold">โต๊ะ {cart.tableNo}</span>
        <span className="text-bun/60">· สั่งและจ่ายจากโต๊ะได้เลย</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => call('HELP')}
            className="press inline-flex h-9 items-center gap-1.5 rounded-full px-3 font-semibold hover:bg-white/10 disabled:opacity-50"
          >
            <BellRing aria-hidden className="size-4 text-flame" /> เรียกพนักงาน
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => call('BILL')}
            className="press hidden h-9 items-center gap-1.5 rounded-full px-3 font-semibold hover:bg-white/10 disabled:opacity-50 sm:inline-flex"
          >
            <Receipt aria-hidden className="size-4 text-flame" /> ขอเช็กบิล
          </button>
          <button
            type="button"
            onClick={() => setContext({ channel: 'WEB', tableNo: null })}
            className="press grid size-9 place-items-center rounded-full hover:bg-white/10"
            aria-label="ออกจากโหมดสั่งที่โต๊ะ"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
