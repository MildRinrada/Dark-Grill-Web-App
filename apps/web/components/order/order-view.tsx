'use client';

import { CircleX, Clock, Crown, MapPin, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { baht, clockTime, FULFILLMENT_LABEL, PAYMENT_LABEL, STATUS_LABEL } from '@/lib/format';
import { useRoom } from '@/lib/socket';
import type { OrderView } from '@/lib/types';
import { useNotify } from '../providers/feedback';
import { useSession } from '../providers/session';
import { Button, Spinner } from '../ui';
import { CrownBurst } from './crown-burst';
import { PaymentPanel } from './payment-panel';
import { RiderRoute, Tracker } from './tracker';

export function OrderTracking({ id, token }: { id: string; token?: string }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [missing, setMissing] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const { user } = useSession();
  const notify = useNotify();
  const q = token ? `?t=${encodeURIComponent(token)}` : '';

  const load = useCallback(async () => {
    try {
      const next = await api<OrderView>(`/orders/${id}${q}`);
      setOrder((prev) => {
        if (prev && prev.status !== 'COMPLETED' && next.status === 'COMPLETED' && next.crownsEarned > 0) setCelebrate(true);
        return next;
      });
    } catch {
      setMissing(true);
    }
  }, [id, q]);

  useEffect(() => {
    void load();
  }, [load, user?.id]);

  useRoom(`order:${id}`, { 'order.status_changed': () => void load() }, { orderToken: token });

  if (missing) {
    return (
      <div className="py-24 text-center">
        <p className="text-lg font-semibold">ไม่พบออเดอร์นี้</p>
        <p className="mt-1 text-muted">ลิงก์อาจไม่ครบ หรือออเดอร์เป็นของบัญชีอื่น</p>
        <Link href="/account" className="mt-4 inline-block font-semibold text-accent-text underline">
          ดูออเดอร์ของฉัน
        </Link>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="grid place-items-center py-32">
        <Spinner label="กำลังโหลดออเดอร์" />
      </div>
    );
  }

  const waitingPayment = order.status === 'PENDING_PAYMENT' && order.payment?.status === 'PENDING';
  const ended = order.status === 'CANCELLED' || order.status === 'EXPIRED';

  const cancel = async () => {
    try {
      setOrder(await api<OrderView>(`/orders/${id}/cancel${q}`, { method: 'POST' }));
      notify('ยกเลิกออเดอร์แล้ว', 'success');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'ยกเลิกไม่สำเร็จ', 'error');
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pt-6">
      <CrownBurst trigger={celebrate || null} label={`+${order.crownsEarned} Crowns`} />
      <header>
        <p className="text-sm text-muted">
          ออเดอร์ <span className="tabular font-semibold text-text">#{order.number}</span> · {FULFILLMENT_LABEL[order.fulfillment.type]}
          {order.fulfillment.tableNo && ` · โต๊ะ ${order.fulfillment.tableNo}`}
        </p>
        <h1 className="mt-1 font-display-th text-4xl font-black" aria-live="polite">
          {STATUS_LABEL[order.status]}
        </h1>
        {!ended && order.status !== 'COMPLETED' && order.eta.readyAt && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-muted">
            <Clock aria-hidden className="size-4" />
            {order.fulfillment.type === 'DELIVERY' && order.eta.deliveredAt
              ? `ถึงประมาณ ${clockTime(order.eta.deliveredAt)}`
              : `พร้อมประมาณ ${clockTime(order.eta.readyAt)}`}
          </p>
        )}
      </header>

      {waitingPayment && <PaymentPanel order={order} onChanged={load} />}

      {!waitingPayment && !ended && (
        <section aria-label="สถานะออเดอร์" className="rounded-card border border-line bg-surface p-5 pt-6">
          <Tracker order={order} />
        </section>
      )}

      {order.status === 'OUT_FOR_DELIVERY' || (order.status === 'COMPLETED' && order.fulfillment.type === 'DELIVERY') ? (
        <RiderRoute order={order} />
      ) : null}

      {ended && (
        <section className="flex items-start gap-3 rounded-card border border-line bg-surface p-5">
          <CircleX aria-hidden className="mt-0.5 size-6 shrink-0 text-danger" />
          <div>
            <p className="font-semibold">{order.status === 'EXPIRED' ? 'หมดเวลาชำระเงิน ออเดอร์ถูกปิดแล้ว' : 'ออเดอร์นี้ถูกยกเลิก'}</p>
            <p className="text-muted">
              {order.payment?.status === 'REFUNDED' ? 'คืนเงินเข้าช่องทางเดิมแล้ว' : 'ไม่มีการตัดเงิน'} สั่งใหม่ได้จากหน้าเมนู
            </p>
            <Link href="/menu" className="mt-3 inline-flex font-semibold text-accent-text underline">
              กลับไปเมนู
            </Link>
          </div>
        </section>
      )}

      {order.status === 'COMPLETED' && order.crownsEarned > 0 && (
        <p className="flex items-center gap-2 rounded-card bg-ink px-5 py-4 font-semibold text-bun">
          <Crown aria-hidden className="size-5 text-cheese" /> ได้รับ {order.crownsEarned} Crowns จากออเดอร์นี้
        </p>
      )}

      <section aria-labelledby="items-title" className="rounded-card border border-line bg-surface p-5">
        <h2 id="items-title" className="font-bold">
          รายการ
        </h2>
        <ul className="mt-3 divide-y divide-line">
          {order.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-3">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                {i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="56px" className="object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {i.qty} x {i.name}
                </p>
                {i.options.length > 0 && <p className="text-sm text-muted">{i.options.join(' · ')}</p>}
              </div>
              <p className="tabular font-semibold">{baht(i.lineTotalSatang)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-[15px]">
          <div className="flex justify-between">
            <dt className="text-muted">ค่าอาหาร</dt>
            <dd className="tabular">{baht(order.totals.subtotalSatang)}</dd>
          </div>
          {order.totals.discountSatang > 0 && (
            <div className="flex justify-between text-success">
              <dt>ส่วนลด{order.promoCode ? ` (${order.promoCode})` : ''}</dt>
              <dd className="tabular">-{baht(order.totals.discountSatang)}</dd>
            </div>
          )}
          {order.totals.deliverySatang > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">ค่าส่ง</dt>
              <dd className="tabular">{baht(order.totals.deliverySatang)}</dd>
            </div>
          )}
          <div className="flex justify-between pt-1 font-bold">
            <dt>รวม {order.payment ? `· ${PAYMENT_LABEL[order.payment.method]}` : ''}</dt>
            <dd className="tabular">{baht(order.totals.grandTotalSatang)}</dd>
          </div>
        </dl>
      </section>

      <p className="flex items-start gap-2 text-sm text-muted">
        <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
        {order.branch.name} · {order.branch.address}
      </p>

      {order.canCancel && (
        <Button variant="danger" onClick={cancel} className="self-start">
          ยกเลิกออเดอร์
        </Button>
      )}

      {order.status === 'COMPLETED' && user && <ReviewBox order={order} onDone={load} />}
    </div>
  );
}

function ReviewBox({ order, onDone }: { order: OrderView; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const notify = useNotify();

  if (order.review) {
    return (
      <section className="rounded-card border border-line bg-surface p-5">
        <p className="flex items-center gap-1 font-semibold">
          {Array.from({ length: order.review.rating }, (_, i) => (
            <Star key={i} aria-hidden className="size-4 fill-cheese text-cheese" />
          ))}
          <span className="sr-only">{order.review.rating} ดาว</span>
        </p>
        {order.review.comment && <p className="mt-1">{order.review.comment}</p>}
        {order.review.reply && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">ร้านตอบ: {order.review.reply}</p>}
      </section>
    );
  }

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api<{ url: string }>('/uploads', { method: 'POST', body: fd });
      setPhoto(r.url);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'อัปโหลดรูปไม่สำเร็จ', 'error');
    }
  };

  return (
    <section aria-labelledby="review-title" className="rounded-card border border-line bg-surface p-5">
      <h2 id="review-title" className="font-bold">
        รีวิวออเดอร์นี้
      </h2>
      <div className="mt-3 flex gap-1" role="radiogroup" aria-label="ให้คะแนน">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} ดาว`}
            onClick={() => setRating(n)}
            className="press grid size-11 place-items-center rounded-full hover:bg-surface-2"
          >
            <Star aria-hidden className={`size-7 ${n <= rating ? 'fill-cheese text-cheese' : 'text-line'}`} />
          </button>
        ))}
      </div>
      <label htmlFor="review-comment" className="sr-only">
        ความเห็น
      </label>
      <textarea
        id="review-comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="รสชาติ ความร้อน ความเร็ว เล่าให้ร้านฟังได้เลย"
        className="mt-3 w-full rounded-control border border-line bg-surface p-3 hover:border-text/30 focus:border-text focus:outline-none"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="press inline-flex h-10 cursor-pointer items-center rounded-chip border border-line px-4 text-sm font-semibold hover:border-text/40">
          {photo ? 'เปลี่ยนรูป' : 'แนบรูป'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </label>
        {photo && <span className="text-sm text-success">แนบรูปแล้ว</span>}
        <Button
          className="ml-auto"
          disabled={!rating}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/orders/${order.id}/review`, {
                method: 'POST',
                body: { rating, comment: comment.trim() || undefined, photoUrl: photo ?? undefined },
              });
              notify('ขอบคุณสำหรับรีวิว', 'success');
              onDone();
            } catch (e) {
              notify(e instanceof ApiError ? e.message : 'ส่งรีวิวไม่สำเร็จ', 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          ส่งรีวิว
        </Button>
      </div>
    </section>
  );
}
