'use client';

import { FlaskConical, ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Button, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { baht } from '@/lib/format';

interface PaymentInfo {
  id: string;
  orderId: string;
  orderNumber: string;
  amountSatang: number;
  status: string;
}

/**
 * Stand-in for a bank's hosted card page. It never asks for card details: in
 * production the customer would land on the gateway's own page instead.
 */
function MockGateway() {
  const params = useSearchParams();
  const router = useRouter();
  const pid = params.get('pid') ?? '';
  const t = params.get('t') ?? '';
  const [info, setInfo] = useState<PaymentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'succeeded' | 'failed' | null>(null);

  useEffect(() => {
    api<PaymentInfo>(`/payments/${pid}?t=${encodeURIComponent(t)}`)
      .then(setInfo)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'ไม่พบรายการชำระเงิน'));
  }, [pid, t]);

  const finish = async (outcome: 'succeeded' | 'failed') => {
    if (!info) return;
    setBusy(outcome);
    await api(`/dev/payments/${info.id}/simulate`, { method: 'POST', body: { outcome } }).catch(() => undefined);
    router.replace(`/orders/${info.orderId}?t=${encodeURIComponent(t)}`);
  };

  if (error) return <p className="py-24 text-center text-danger">{error}</p>;
  if (!info) {
    return (
      <div className="grid place-items-center py-32">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto mt-10 max-w-md rounded-card border border-line bg-surface p-6 shadow-card">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
        <FlaskConical aria-hidden className="size-4" /> Mock payment gateway · test mode
      </p>
      <h1 className="mt-3 text-2xl font-bold">ยืนยันการชำระด้วยบัตร</h1>
      <p className="mt-1 text-muted">ออเดอร์ #{info.orderNumber}</p>
      <p className="tabular mt-6 text-4xl font-bold">{baht(info.amountSatang)}</p>
      <p className="mt-6 flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        หน้านี้จำลองหน้าชำระเงินของธนาคาร ระบบจริงจะพาไปหน้าของผู้ให้บริการชำระเงินโดยตรง และร้านไม่เคยเห็นเลขบัตร
      </p>
      <div className="mt-6 flex flex-col gap-2">
        <Button size="lg" loading={busy === 'succeeded'} disabled={!!busy || info.status !== 'PENDING'} onClick={() => finish('succeeded')}>
          อนุมัติการชำระ
        </Button>
        <Button
          size="lg"
          variant="ghost"
          loading={busy === 'failed'}
          disabled={!!busy || info.status !== 'PENDING'}
          onClick={() => finish('failed')}
        >
          จำลองบัตรถูกปฏิเสธ
        </Button>
      </div>
    </div>
  );
}

export default function MockPayPage() {
  return (
    <Suspense>
      <MockGateway />
    </Suspense>
  );
}
