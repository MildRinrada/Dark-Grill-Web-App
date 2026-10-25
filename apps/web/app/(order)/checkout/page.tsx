'use client';

import { Banknote, Bike, CreditCard, LocateFixed, MapPin, QrCode, Store, Utensils } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Totals } from '@/components/cart/totals';
import { Listbox } from '@/components/listbox';
import { useCart } from '@/components/providers/cart';
import { useNotify } from '@/components/providers/feedback';
import { useSession } from '@/components/providers/session';
import { Segmented } from '@/components/segmented';
import { Button, Field, inputClass, Spinner } from '@/components/ui';
import { api, ApiError, newIdempotencyKey } from '@/lib/api';
import { clockTime, FULFILLMENT_LABEL } from '@/lib/format';
import type { CartView, FulfillmentType, OrderView, PaymentMethod } from '@/lib/types';

interface Address {
  id: string;
  label: string;
  line1: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}

const LANDMARKS = [
  { value: 'ratchathewi', label: 'ราชเทวี', lat: 13.7516, lng: 100.5316 },
  { value: 'victory', label: 'อนุสาวรีย์ชัยฯ', lat: 13.765, lng: 100.5383 },
  { value: 'silom', label: 'สีลม', lat: 13.7286, lng: 100.5341 },
  { value: 'ekkamai', label: 'เอกมัย', lat: 13.7197, lng: 100.5853 },
  { value: 'ladprao', label: 'ลาดพร้าว (ไกลเกินเขตส่ง)', lat: 13.816, lng: 100.561 },
];

function timeSlots(): { value: string; label: string }[] {
  const start = new Date(Date.now() + 30 * 60_000);
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(start.getTime() + i * 15 * 60_000);
    return { value: d.toISOString(), label: `วันนี้ ${clockTime(d)}` };
  });
}

export default function CheckoutPage() {
  const { cart, refresh } = useCart();
  const { user, ready } = useSession();
  const notify = useNotify();
  const router = useRouter();

  const dineInAllowed = !!cart?.tableNo || cart?.channel === 'KIOSK';
  const [type, setType] = useState<FulfillmentType>('PICKUP');
  const [payment, setPayment] = useState<PaymentMethod>('PROMPTPAY');
  const [when, setWhen] = useState('asap');
  const [note, setNote] = useState('');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [quote, setQuote] = useState<CartView | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [form, setForm] = useState({ label: '', line1: '', landmark: 'ratchathewi' });
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const idemKey = useRef<string | null>(null);
  const slots = useMemo(timeSlots, []);

  useEffect(() => {
    if (cart?.tableNo) setType('DINE_IN');
  }, [cart?.tableNo]);

  useEffect(() => {
    if (!user) return;
    api<{ data: Address[] }>('/me/addresses').then((r) => {
      setAddresses(r.data);
      setAddressId((id) => id ?? r.data.find((a) => a.isDefault)?.id ?? r.data[0]?.id ?? null);
    });
  }, [user]);

  useEffect(() => {
    if (type === 'DELIVERY' && payment === 'CASH') setPayment('PROMPTPAY');
  }, [type, payment]);

  const fulfillment = useMemo(
    () => ({
      type,
      ...(type === 'DELIVERY' && addressId ? { addressId } : {}),
      scheduledAt: when === 'asap' ? null : when,
    }),
    [type, addressId, when],
  );

  const runQuote = useCallback(async () => {
    if (!cart || cart.lines.length === 0) return;
    setQuoting(true);
    try {
      setQuote(await api<CartView>('/carts/me/quote', { method: 'POST', body: { fulfillment } }));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'คำนวณราคาไม่สำเร็จ', 'error');
    } finally {
      setQuoting(false);
    }
    // a changed order is a new request, so it gets a new idempotency key
    idemKey.current = null;
  }, [cart, fulfillment, notify]);

  useEffect(() => {
    void runQuote();
  }, [runQuote]);

  const saveAddress = async () => {
    const point = geo ?? LANDMARKS.find((l) => l.value === form.landmark)!;
    try {
      const created = await api<Address>('/me/addresses', {
        method: 'POST',
        body: { label: form.label || 'ที่อยู่ใหม่', line1: form.line1, lat: point.lat, lng: point.lng },
      });
      setAddresses((a) => [created, ...a]);
      setAddressId(created.id);
      setAdding(false);
      setForm({ label: '', line1: '', landmark: 'ratchathewi' });
      setGeo(null);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'บันทึกที่อยู่ไม่สำเร็จ', 'error');
    }
  };

  const place = async () => {
    if (!quote) return;
    setPlacing(true);
    idemKey.current ??= newIdempotencyKey();
    try {
      const order = await api<OrderView>('/orders', {
        method: 'POST',
        idempotencyKey: idemKey.current,
        body: { fulfillment, paymentMethod: payment, note: note.trim() || undefined },
      });
      await refresh();
      router.push(`/orders/${order.id}?t=${order.publicToken}`);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'สั่งไม่สำเร็จ ลองอีกครั้ง', 'error');
      setPlacing(false);
    }
  };

  if (!cart || !ready) {
    return (
      <div className="grid place-items-center py-32">
        <Spinner />
      </div>
    );
  }
  if (cart.lines.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="text-lg font-semibold">ตะกร้าว่าง</p>
        <Link href="/menu" className="mt-4 inline-block font-semibold text-accent-text underline">
          กลับไปเลือกเมนู
        </Link>
      </div>
    );
  }

  const issues = quote?.issues ?? [];
  const blocked = type === 'DELIVERY' && (!user || !addressId);

  return (
    <div className="grid gap-8 pt-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <div className="flex flex-col gap-8">
        <h1 className="font-display-th text-4xl font-black">ชำระเงิน</h1>

        <Segmented
          label="รับอาหารแบบไหน"
          value={type}
          onChange={setType}
          options={[
            { value: 'DELIVERY', label: FULFILLMENT_LABEL.DELIVERY, description: 'ส่งถึงที่ในระยะ 7 กม.', icon: Bike },
            { value: 'PICKUP', label: FULFILLMENT_LABEL.PICKUP, description: 'สั่งก่อน ไม่ต้องรอคิว', icon: Store },
            {
              value: 'DINE_IN',
              label: FULFILLMENT_LABEL.DINE_IN,
              description: dineInAllowed ? (cart.tableNo ? `โต๊ะ ${cart.tableNo}` : 'สั่งจากตู้ Kiosk') : 'สแกน QR ที่โต๊ะเพื่อใช้',
              icon: Utensils,
              disabled: !dineInAllowed,
            },
          ]}
        />

        {type === 'DELIVERY' && (
          <section aria-labelledby="addr-title" className="flex flex-col gap-3">
            <h2 id="addr-title" className="text-base font-bold">
              ส่งที่
            </h2>
            {!user ? (
              <div className="rounded-2xl border border-line bg-surface p-4">
                <p>เข้าสู่ระบบเพื่อใช้ที่อยู่ที่บันทึกไว้และสั่งเดลิเวอรี</p>
                <Link
                  href="/login?next=/checkout"
                  className="press mt-3 inline-flex h-11 items-center rounded-chip bg-text px-5 font-semibold text-bg"
                >
                  เข้าสู่ระบบด้วยเบอร์โทร
                </Link>
              </div>
            ) : (
              <>
                <div role="radiogroup" aria-labelledby="addr-title" className="flex flex-col gap-2">
                  {addresses.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={addressId === a.id}
                      onClick={() => setAddressId(a.id)}
                      className={`press flex items-start gap-3 rounded-2xl border bg-surface p-4 text-left ${addressId === a.id ? 'border-text ring-2 ring-text' : 'border-line hover:border-text/40'}`}
                    >
                      <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-text" />
                      <span>
                        <span className="block font-semibold">{a.label}</span>
                        <span className="block text-sm text-muted">{a.line1}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {adding ? (
                  <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
                    <Field id="addr-label" label="ชื่อเรียก">
                      <input
                        id="addr-label"
                        className={inputClass}
                        value={form.label}
                        onChange={(e) => setForm({ ...form, label: e.target.value })}
                        placeholder="บ้าน, ออฟฟิศ"
                      />
                    </Field>
                    <Field id="addr-line" label="ที่อยู่" hint="บ้านเลขที่ ซอย อาคาร ชั้น">
                      <input
                        id="addr-line"
                        className={inputClass}
                        value={form.line1}
                        onChange={(e) => setForm({ ...form, line1: e.target.value })}
                      />
                    </Field>
                    <div className="flex flex-col gap-2">
                      <Listbox
                        label="ย่านที่ส่ง"
                        value={form.landmark}
                        options={LANDMARKS.map((l) => ({ value: l.value, label: l.label }))}
                        onChange={(v) => {
                          setForm({ ...form, landmark: v });
                          setGeo(null);
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        onClick={() =>
                          navigator.geolocation?.getCurrentPosition(
                            (p) => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }),
                            () => notify('อ่านตำแหน่งไม่ได้ ใช้ย่านที่เลือกแทน', 'info'),
                          )
                        }
                      >
                        <LocateFixed aria-hidden className="size-4" />
                        {geo ? 'ใช้ตำแหน่งปัจจุบันแล้ว' : 'ใช้ตำแหน่งปัจจุบัน'}
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={saveAddress} disabled={form.line1.trim().length < 3}>
                        บันทึกที่อยู่
                      </Button>
                      <Button variant="ghost" onClick={() => setAdding(false)}>
                        ยกเลิก
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="secondary" className="self-start" onClick={() => setAdding(true)}>
                    เพิ่มที่อยู่ใหม่
                  </Button>
                )}
              </>
            )}
          </section>
        )}

        {type !== 'DINE_IN' && (
          <Listbox
            label="เวลา"
            value={when}
            onChange={setWhen}
            options={[
              { value: 'asap', label: 'เร็วที่สุด', description: quote?.eta ? `พร้อมประมาณ ${clockTime(quote.eta.readyAt)}` : undefined },
              ...slots,
            ]}
          />
        )}

        <Segmented
          label="ชำระเงิน"
          value={payment}
          onChange={setPayment}
          options={[
            { value: 'PROMPTPAY', label: 'พร้อมเพย์', description: 'สแกน QR จากแอปธนาคาร', icon: QrCode },
            { value: 'CARD', label: 'บัตร', description: 'เครดิต/เดบิต', icon: CreditCard },
            {
              value: 'CASH',
              label: 'เงินสด',
              description: type === 'DELIVERY' ? 'ไม่รองรับเดลิเวอรี' : 'จ่ายที่เคาน์เตอร์',
              icon: Banknote,
              disabled: type === 'DELIVERY',
            },
          ]}
        />

        <Field id="note" label="หมายเหตุถึงร้าน" hint="เช่น ไม่เอาช้อนส้อม แยกซอส">
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            rows={2}
            className={`${inputClass} h-auto py-3`}
          />
        </Field>
      </div>

      <aside className="rounded-card border border-line bg-surface p-5 shadow-card lg:sticky lg:top-24">
        <h2 className="font-bold">สรุปออเดอร์</h2>
        <ul className="mt-3 flex flex-col gap-1.5 text-[15px]">
          {cart.lines.map((l) => (
            <li key={l.lineId} className="flex justify-between gap-3">
              <span className="text-muted">
                {l.qty} x {l.name}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-line pt-4" aria-busy={quoting}>
          {quote ? <Totals cart={quote} showDelivery={type === 'DELIVERY'} /> : <Spinner />}
        </div>
        {quote?.eta && (
          <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            {type === 'DELIVERY' && quote.eta.deliveredAt
              ? `ถึงประมาณ ${clockTime(quote.eta.deliveredAt)}`
              : `พร้อมประมาณ ${clockTime(quote.eta.readyAt)}`}
            {quote.eta.kitchenBusy && (
              <span className="block text-muted">ครัวคิวแน่นช่วงนี้ เราเลื่อนเวลาให้ตามจริงแทนการรับเกินกำลัง</span>
            )}
          </p>
        )}
        {issues.length > 0 && (
          <p role="alert" className="mt-3 text-sm font-semibold text-danger">
            {issues[0].message}
          </p>
        )}
        <Button
          size="xl"
          className="mt-5 w-full"
          onClick={place}
          loading={placing}
          disabled={!quote || quoting || issues.length > 0 || blocked}
        >
          ยืนยันสั่งซื้อ
        </Button>
        <p className="mt-3 text-center text-xs text-muted">ราคาคำนวณใหม่ที่ระบบทุกครั้งก่อนตัดเงิน</p>
      </aside>
    </div>
  );
}
