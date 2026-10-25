'use client';

import clsx from 'clsx';
import { Star } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageTitle, Panel, useAdminBranch } from '@/components/admin/admin-shell';
import { Listbox } from '@/components/listbox';
import { useNotify } from '@/components/providers/feedback';
import { Button, Field, inputClass } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { baht, shortDate } from '@/lib/format';

interface Promo {
  id: string;
  code: string;
  description: string;
  type: 'PERCENT' | 'FIXED' | 'FREE_DELIVERY';
  value: number;
  minSubtotalSatang: number;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
  endsAt: string | null;
}
interface Campaign {
  id: string;
  name: string;
  type: string;
  startTime: string | null;
  endTime: string | null;
  isActive: boolean;
}
interface Review {
  id: string;
  rating: number;
  comment: string | null;
  reply: string | null;
  createdAt: string;
  order: { number: string; items: { name: string; qty: number }[] };
  user: { name: string | null };
}

const promoValue = (p: Promo) => (p.type === 'PERCENT' ? `${p.value}%` : p.type === 'FIXED' ? baht(p.value) : 'ส่งฟรี');

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} className="press">
      <span className={clsx('relative block h-7 w-12 rounded-full transition-colors', on ? 'bg-success' : 'bg-line')}>
        <span
          className={clsx('absolute top-1 size-5 rounded-full bg-surface transition-transform', on ? 'translate-x-6' : 'translate-x-1')}
        />
      </span>
    </button>
  );
}

export default function Marketing() {
  const branchId = useAdminBranch();
  const notify = useNotify();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ code: '', description: '', type: 'PERCENT' as Promo['type'], value: '10', min: '0', limit: '' });

  const load = useCallback(async () => {
    const [p, c, r] = await Promise.all([
      api<{ data: Promo[] }>('/admin/promotions'),
      api<{ data: Campaign[] }>('/admin/campaigns'),
      api<{ data: Review[] }>(`/admin/reviews?branchId=${branchId}`),
    ]);
    setPromos(p.data);
    setCampaigns(c.data);
    setReviews(r.data);
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      notify(ok, 'success');
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'ทำรายการไม่สำเร็จ', 'error');
    }
  };

  const create = () =>
    run(
      () =>
        api('/admin/promotions', {
          method: 'POST',
          body: {
            code: form.code,
            description: form.description || form.code,
            type: form.type,
            value: form.type === 'PERCENT' ? Number(form.value) : form.type === 'FIXED' ? Math.round(Number(form.value) * 100) : 0,
            minSubtotalSatang: Math.round(Number(form.min || 0) * 100),
            usageLimit: form.limit ? Number(form.limit) : null,
          },
        }).then(() => setForm({ ...form, code: '', description: '' })),
      'สร้างโค้ดแล้ว',
    );

  return (
    <>
      <PageTitle title="โปรโมชันและรีวิว" />
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Panel title="โค้ดส่วนลด">
          <ul className="divide-y divide-line">
            {promos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="font-display text-xl tracking-wider">{p.code}</span>
                <span className="flex-1 text-sm text-muted">
                  {promoValue(p)} · {p.description}
                  {p.minSubtotalSatang > 0 && ` · ขั้นต่ำ ${baht(p.minSubtotalSatang)}`}
                </span>
                <span className="tabular text-sm text-muted">
                  ใช้แล้ว {p.usedCount}
                  {p.usageLimit !== null && `/${p.usageLimit}`}
                </span>
                <Switch
                  on={p.isActive}
                  label={`${p.code} ${p.isActive ? 'เปิดใช้' : 'ปิด'}`}
                  onToggle={() =>
                    run(
                      () => api(`/admin/promotions/${p.id}`, { method: 'PATCH', body: { isActive: !p.isActive } }),
                      p.isActive ? 'ปิดโค้ดแล้ว' : 'เปิดโค้ดแล้ว',
                    )
                  }
                />
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-3 rounded-2xl bg-surface-2 p-4 sm:grid-cols-2">
            <Field id="pcode" label="โค้ด" hint="A-Z 0-9 3-20 ตัว">
              <input
                id="pcode"
                className={inputClass}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })}
              />
            </Field>
            <Listbox
              label="ประเภท"
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v })}
              options={[
                { value: 'PERCENT', label: 'ลดเป็น %' },
                { value: 'FIXED', label: 'ลดเป็นบาท' },
                { value: 'FREE_DELIVERY', label: 'ส่งฟรี' },
              ]}
            />
            {form.type !== 'FREE_DELIVERY' && (
              <Field id="pval" label={form.type === 'PERCENT' ? 'เปอร์เซ็นต์' : 'บาท'}>
                <input
                  id="pval"
                  inputMode="decimal"
                  className={inputClass}
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                />
              </Field>
            )}
            <Field id="pmin" label="ยอดขั้นต่ำ (บาท)">
              <input
                id="pmin"
                inputMode="decimal"
                className={inputClass}
                value={form.min}
                onChange={(e) => setForm({ ...form, min: e.target.value })}
              />
            </Field>
            <Field id="plim" label="จำกัดจำนวนครั้ง" hint="เว้นว่าง = ไม่จำกัด">
              <input
                id="plim"
                inputMode="numeric"
                className={inputClass}
                value={form.limit}
                onChange={(e) => setForm({ ...form, limit: e.target.value })}
              />
            </Field>
            <Field id="pdesc" label="คำอธิบาย">
              <input
                id="pdesc"
                className={inputClass}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <Button className="sm:col-span-2" disabled={form.code.length < 3} onClick={create}>
              สร้างโค้ด
            </Button>
          </div>
        </Panel>

        <Panel title="แคมเปญอัตโนมัติ">
          <ul className="divide-y divide-line">
            {campaigns.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <div className="flex-1">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-sm text-muted">
                    {c.type}
                    {c.startTime && ` · ${c.startTime}-${c.endTime}`}
                  </p>
                </div>
                <Switch
                  on={c.isActive}
                  label={`${c.name} ${c.isActive ? 'เปิด' : 'ปิด'}`}
                  onToggle={() =>
                    run(() => api(`/admin/campaigns/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } }), 'อัปเดตแคมเปญแล้ว')
                  }
                />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="รีวิวล่าสุด" className="mt-4">
        <ul className="divide-y divide-line">
          {reviews.slice(0, 20).map((r) => (
            <li key={r.id} className="py-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex" aria-label={`${r.rating} ดาว`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} aria-hidden className={clsx('size-4', i < r.rating ? 'fill-cheese text-cheese' : 'text-line')} />
                  ))}
                </span>
                <span className="font-semibold">{r.user.name ?? 'ลูกค้า'}</span>
                <span className="text-sm text-muted">
                  #{r.order.number} · {shortDate(r.createdAt)}
                </span>
              </div>
              {r.comment && <p className="mt-1">{r.comment}</p>}
              {r.reply ? (
                <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">ร้านตอบ: {r.reply}</p>
              ) : (
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(() => api(`/admin/reviews/${r.id}/reply`, { method: 'POST', body: { reply: replies[r.id] } }), 'ตอบรีวิวแล้ว');
                  }}
                >
                  <label htmlFor={`reply-${r.id}`} className="sr-only">
                    ตอบรีวิว
                  </label>
                  <input
                    id={`reply-${r.id}`}
                    className={`${inputClass} h-10`}
                    placeholder="ตอบลูกค้า"
                    value={replies[r.id] ?? ''}
                    onChange={(e) => setReplies({ ...replies, [r.id]: e.target.value })}
                  />
                  <Button type="submit" size="sm" variant="secondary" disabled={!replies[r.id]?.trim()}>
                    ตอบ
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
