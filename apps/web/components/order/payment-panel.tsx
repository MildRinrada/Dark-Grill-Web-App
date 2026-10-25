'use client';

import { Banknote, CreditCard, FlaskConical, QrCode, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { baht } from '@/lib/format';
import type { OrderView } from '@/lib/types';
import { useNotify } from '../providers/feedback';
import { Button } from '../ui';

function useCountdown(until: string | null) {
  const [left, setLeft] = useState(() => (until ? new Date(until).getTime() - Date.now() : 0));
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setLeft(new Date(until).getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  const s = Math.max(0, Math.floor(left / 1000));
  return { expired: until ? s === 0 : false, text: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` };
}

export function PaymentPanel({ order, onChanged }: { order: OrderView; onChanged: () => void }) {
  const p = order.payment!;
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const notify = useNotify();
  const countdown = useCountdown(p.expiresAt);

  useEffect(() => {
    if (p.qrPayload)
      import('qrcode')
        .then((QRCode) => QRCode.toDataURL(p.qrPayload!, { margin: 1, width: 560, color: { dark: '#1B1B1B', light: '#FFFFFF' } }))
        .then(setQr);
  }, [p.qrPayload]);

  const simulate = async () => {
    setBusy(true);
    try {
      await api(`/dev/payments/${p.id}/simulate`, { method: 'POST', body: { outcome: 'succeeded' } });
      onChanged();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'จำลองไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  };

  const switchTo = async (method: 'PROMPTPAY' | 'CARD') => {
    setBusy(true);
    try {
      await api('/payments', {
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
        body: { orderId: order.id, method, orderToken: order.publicToken },
      });
      onChanged();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'เปลี่ยนวิธีจ่ายไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (p.method === 'CASH') {
    return (
      <section className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface p-6 text-center">
        <Banknote aria-hidden className="size-10 text-accent-text" />
        <h2 className="text-xl font-bold">ชำระเงินสดที่เคาน์เตอร์</h2>
        <p className="text-muted">แจ้งเลขออเดอร์กับพนักงาน ครัวจะเริ่มทำทันทีที่รับเงิน</p>
        <p className="font-display text-6xl tracking-wide">#{order.number}</p>
        <p className="tabular text-2xl font-bold">{baht(p.amountSatang)}</p>
      </section>
    );
  }

  return (
    <section
      className="flex flex-col items-center gap-4 rounded-card border border-line bg-surface p-6 text-center"
      aria-labelledby="pay-title"
    >
      <h2 id="pay-title" className="flex items-center gap-2 text-xl font-bold">
        {p.method === 'PROMPTPAY' ? <QrCode aria-hidden className="size-6" /> : <CreditCard aria-hidden className="size-6" />}
        {p.method === 'PROMPTPAY' ? 'สแกนจ่ายด้วยพร้อมเพย์' : 'ชำระด้วยบัตร'}
      </h2>
      <p className="tabular text-3xl font-bold">{baht(p.amountSatang)}</p>
      {p.method === 'PROMPTPAY' && (
        <div className="rounded-2xl bg-white p-3">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR พร้อมเพย์ ยอด ${baht(p.amountSatang)}`} width={240} height={240} className="size-60" />
          ) : (
            <div className="skeleton size-60 rounded-xl" />
          )}
        </div>
      )}
      {p.method === 'CARD' && p.redirectUrl && (
        <a href={p.redirectUrl} className="press inline-flex h-12 items-center rounded-chip bg-accent px-6 font-semibold text-accent-ink">
          ไปหน้าชำระเงินของธนาคาร
        </a>
      )}
      {p.expiresAt && (
        <p className={`tabular inline-flex items-center gap-1.5 text-sm ${countdown.expired ? 'text-danger' : 'text-muted'}`}>
          <Timer aria-hidden className="size-4" />
          {countdown.expired ? 'หมดเวลาชำระ' : `ชำระภายใน ${countdown.text} นาที`}
        </p>
      )}
      <p className="text-sm text-muted">หน้านี้อัปเดตเองเมื่อธนาคารยืนยัน ไม่ต้องรีเฟรช</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => switchTo(p.method === 'PROMPTPAY' ? 'CARD' : 'PROMPTPAY')}>
          เปลี่ยนเป็น{p.method === 'PROMPTPAY' ? 'บัตร' : 'พร้อมเพย์'}
        </Button>
      </div>
      <div className="mt-2 w-full rounded-2xl border border-dashed border-line p-3">
        <p className="mb-2 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
          <FlaskConical aria-hidden className="size-3.5" /> โหมดทดสอบ
        </p>
        <Button variant="secondary" size="sm" loading={busy} onClick={simulate}>
          จำลองว่าลูกค้าจ่ายสำเร็จ
        </Button>
      </div>
    </section>
  );
}
