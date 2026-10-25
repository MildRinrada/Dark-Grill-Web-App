'use client';

import { ArrowLeft, Smartphone } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import { useNotify } from '@/components/providers/feedback';
import { useSession } from '@/components/providers/session';
import { Button, Field, inputClass } from '@/components/ui';
import { ApiError } from '@/lib/api';

function LoginForm() {
  const { requestOtp, verifyOtp } = useSession();
  const notify = useNotify();
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/account';
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await requestOtp(phone);
      setDevCode(r.devCode ?? null);
      setStep('code');
      requestAnimationFrame(() => codeRef.current?.focus());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ส่งรหัสไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await verifyOtp(phone, code);
      notify(`ยินดีต้อนรับ${user.name ? ` ${user.name}` : ''}`, 'success');
      const staffHome = user.role === 'KITCHEN' ? '/kitchen' : user.role !== 'CUSTOMER' ? '/admin' : null;
      router.replace(next === '/account' && staffHome ? staffHome : next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ยืนยันไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="grid size-14 place-items-center rounded-2xl bg-ink text-flame">
        <Smartphone aria-hidden className="size-7" />
      </div>
      <h1 className="mt-5 font-display-th text-4xl font-black">เข้าสู่ระบบ</h1>
      <p className="mt-2 text-muted">ใช้เบอร์มือถือ รับรหัส 6 หลักทาง SMS สะสม Crowns และสั่งซ้ำได้ในแตะเดียว</p>

      {step === 'phone' ? (
        <form onSubmit={send} className="mt-8 flex flex-col gap-5" noValidate>
          <Field id="phone" label="เบอร์มือถือ" error={error}>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 10))}
              placeholder="08x xxx xxxx"
              aria-invalid={!!error}
              aria-describedby={error ? 'phone-error' : undefined}
              className={`${inputClass} tabular text-lg tracking-wider`}
            />
          </Field>
          <Button type="submit" size="lg" loading={busy} disabled={phone.length < 10}>
            ส่งรหัส
          </Button>
          <p className="text-sm text-muted">บัญชีทดลอง: ลูกค้า 0811111111 · เจ้าของ 0800000001 · ผู้จัดการ 0800000002 · ครัว 0800000004</p>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-8 flex flex-col gap-5" noValidate>
          <Field id="code" label={`รหัสที่ส่งไป ${phone}`} error={error} hint={devCode ? `โหมดทดสอบ: รหัสคือ ${devCode}` : undefined}>
            <input
              ref={codeRef}
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-invalid={!!error}
              aria-describedby={error ? 'code-error' : devCode ? 'code-hint' : undefined}
              className={`${inputClass} tabular text-center text-2xl tracking-[0.5em]`}
            />
          </Field>
          <Button type="submit" size="lg" loading={busy} disabled={code.length !== 6}>
            ยืนยัน
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setStep('phone');
              setCode('');
              setError(null);
            }}
          >
            <ArrowLeft aria-hidden className="size-4" /> เปลี่ยนเบอร์
          </Button>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
