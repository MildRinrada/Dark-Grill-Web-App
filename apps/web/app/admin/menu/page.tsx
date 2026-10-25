'use client';

import clsx from 'clsx';
import { Archive, ArchiveRestore, Pencil, Plus, Upload } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { PageTitle, useAdminBranch } from '@/components/admin/admin-shell';
import { Listbox } from '@/components/listbox';
import { useNotify } from '@/components/providers/feedback';
import { Sheet } from '@/components/sheet';
import { Button, Field, inputClass, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { baht } from '@/lib/format';

interface Item {
  id: string;
  slug: string;
  categoryId: string;
  category: { id: string; name: string; kind: string };
  name: string;
  nameEn: string;
  description: string;
  priceSatang: number;
  compareAtSatang: number | null;
  costSatang: number;
  imageUrl: string;
  calories: number;
  prepMinutes: number;
  spicyLevel: number;
  isVegetarian: boolean;
  isSignature: boolean;
  isArchived: boolean;
  isAvailable: boolean | null;
  autoDisabled: boolean | null;
  allergens: string[];
}

interface Category {
  id: string;
  name: string;
  _count: { items: number };
}

type Draft = {
  id?: string;
  slug: string;
  categoryId: string;
  name: string;
  nameEn: string;
  description: string;
  price: string;
  compareAt: string;
  cost: string;
  imageUrl: string;
  calories: string;
  prepMinutes: string;
  spicyLevel: string;
  isVegetarian: boolean;
  isSignature: boolean;
};

const empty = (categoryId: string): Draft => ({
  slug: '',
  categoryId,
  name: '',
  nameEn: '',
  description: '',
  price: '',
  compareAt: '',
  cost: '',
  imageUrl: '/images/menu/classic-smash.jpg',
  calories: '',
  prepMinutes: '10',
  spicyLevel: '0',
  isVegetarian: false,
  isSignature: false,
});

const toSatang = (v: string) => Math.round(Number(v || 0) * 100);

export default function AdminMenu() {
  const branchId = useAdminBranch();
  const notify = useNotify();
  const [items, setItems] = useState<Item[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [i, c] = await Promise.all([
      api<{ data: Item[] }>(`/admin/menu-items?branchId=${branchId}`),
      api<{ data: Category[] }>('/admin/categories'),
    ]);
    setItems(i.data.filter((x) => x.id !== 'mi_build_your_own'));
    setCats(c.data);
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (item: Item) => {
    try {
      await api(`/admin/menu-items/${item.id}/availability`, { method: 'PATCH', body: { branchId, isAvailable: !item.isAvailable } });
      setItems((list) => list!.map((x) => (x.id === item.id ? { ...x, isAvailable: !item.isAvailable, autoDisabled: false } : x)));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'เปลี่ยนไม่สำเร็จ', 'error');
    }
  };

  const archive = async (item: Item, restore: boolean) => {
    try {
      await api(restore ? `/admin/menu-items/${item.id}/restore` : `/admin/menu-items/${item.id}`, { method: restore ? 'POST' : 'DELETE' });
      notify(restore ? `นำ ${item.name} กลับมาขายแล้ว` : `เก็บ ${item.name} เข้าคลังแล้ว`, 'success');
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'ทำรายการไม่สำเร็จ', 'error');
    }
  };

  const edit = (i: Item) =>
    setDraft({
      id: i.id,
      slug: i.slug,
      categoryId: i.categoryId,
      name: i.name,
      nameEn: i.nameEn,
      description: i.description,
      price: String(i.priceSatang / 100),
      compareAt: i.compareAtSatang ? String(i.compareAtSatang / 100) : '',
      cost: String(i.costSatang / 100),
      imageUrl: i.imageUrl,
      calories: String(i.calories),
      prepMinutes: String(i.prepMinutes),
      spicyLevel: String(i.spicyLevel),
      isVegetarian: i.isVegetarian,
      isSignature: i.isSignature,
    });

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const body = {
      categoryId: draft.categoryId,
      name: draft.name,
      nameEn: draft.nameEn,
      description: draft.description,
      priceSatang: toSatang(draft.price),
      compareAtSatang: draft.compareAt ? toSatang(draft.compareAt) : null,
      costSatang: toSatang(draft.cost),
      imageUrl: draft.imageUrl,
      calories: Number(draft.calories || 0),
      prepMinutes: Number(draft.prepMinutes || 1),
      spicyLevel: Number(draft.spicyLevel || 0),
      isVegetarian: draft.isVegetarian,
      isSignature: draft.isSignature,
    };
    try {
      if (draft.id) await api(`/admin/menu-items/${draft.id}`, { method: 'PATCH', body });
      else await api('/admin/menu-items', { method: 'POST', body: { ...body, slug: draft.slug } });
      notify('บันทึกเมนูแล้ว', 'success');
      setDraft(null);
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api<{ url: string }>('/uploads', { method: 'POST', body: fd });
      setDraft((d) => d && { ...d, imageUrl: r.url });
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'อัปโหลดไม่สำเร็จ', 'error');
    }
  };

  if (!items) {
    return (
      <div className="grid place-items-center py-20">
        <Spinner />
      </div>
    );
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => d && { ...d, ...patch });

  return (
    <>
      <PageTitle title="เมนู">
        <Button onClick={() => setDraft(empty(cats[0]?.id ?? ''))}>
          <Plus aria-hidden className="size-4" /> เพิ่มเมนู
        </Button>
      </PageTitle>
      <p className="-mt-3 mb-6 text-sm text-muted">
        แต่ละหมวดแสดงได้ไม่เกิน 12 รายการ เพื่อไม่ให้ลูกค้าเลือกยาก ปิด/เปิดขายมีผลเฉพาะสาขาที่เลือก
      </p>

      {cats.map((c) => {
        const list = items.filter((i) => i.categoryId === c.id);
        const active = list.filter((i) => !i.isArchived).length;
        return (
          <section key={c.id} className="mb-8" aria-labelledby={`cat-${c.id}`}>
            <h2 id={`cat-${c.id}`} className="mb-3 flex items-baseline gap-3 text-xl font-bold">
              {c.name}
              <span className={clsx('tabular text-sm font-medium', active >= 12 ? 'text-danger' : 'text-muted')}>{active}/12</span>
            </h2>
            <ul className="divide-y divide-line rounded-card border border-line bg-surface">
              {list.map((i) => (
                <li key={i.id} className={clsx('flex flex-wrap items-center gap-4 p-3', i.isArchived && 'opacity-55')}>
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                    <Image
                      src={i.imageUrl}
                      alt=""
                      fill
                      sizes="56px"
                      className="object-cover"
                      unoptimized={i.imageUrl.startsWith('/uploads')}
                    />
                  </div>
                  <div className="min-w-40 flex-1">
                    <p className="font-semibold">{i.name}</p>
                    <p className="tabular text-sm text-muted">
                      {baht(i.priceSatang)} · ต้นทุน {baht(i.costSatang)} · กำไร {Math.round((1 - i.costSatang / i.priceSatang) * 100)}%
                    </p>
                    {i.autoDisabled && <p className="text-sm font-semibold text-danger">ปิดอัตโนมัติ: วัตถุดิบไม่พอ</p>}
                  </div>
                  {!i.isArchived && (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!i.isAvailable}
                      aria-label={`${i.name} ${i.isAvailable ? 'ขายอยู่' : 'ปิดขาย'} ที่สาขานี้`}
                      onClick={() => toggle(i)}
                      className="press flex items-center gap-2 text-sm font-semibold"
                    >
                      <span className={clsx('relative h-7 w-12 rounded-full transition-colors', i.isAvailable ? 'bg-success' : 'bg-line')}>
                        <span
                          className={clsx(
                            'absolute top-1 size-5 rounded-full bg-surface transition-transform',
                            i.isAvailable ? 'translate-x-6' : 'translate-x-1',
                          )}
                        />
                      </span>
                      {i.isAvailable ? 'ขายอยู่' : 'ปิดขาย'}
                    </button>
                  )}
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => edit(i)} aria-label={`แก้ไข ${i.name}`}>
                      <Pencil aria-hidden className="size-4" />
                    </Button>
                    {i.isArchived ? (
                      <Button size="sm" variant="ghost" onClick={() => archive(i, true)} aria-label={`นำ ${i.name} กลับมาขาย`}>
                        <ArchiveRestore aria-hidden className="size-4" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        onClick={() => archive(i, false)}
                        aria-label={`เก็บ ${i.name} เข้าคลัง`}
                      >
                        <Archive aria-hidden className="size-4" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <Sheet
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'แก้ไขเมนู' : 'เพิ่มเมนู'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              ยกเลิก
            </Button>
            <Button
              loading={saving}
              disabled={!draft?.name || !draft?.price || (!draft?.id && !/^[a-z0-9-]+$/.test(draft?.slug ?? ''))}
              onClick={save}
            >
              บันทึก
            </Button>
          </div>
        }
      >
        {draft && (
          <div className="grid gap-4 sm:grid-cols-2">
            {!draft.id && (
              <Field id="slug" label="Slug (URL)" hint="a-z 0-9 และขีด เช่น spicy-smash">
                <input id="slug" className={inputClass} value={draft.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} />
              </Field>
            )}
            <Listbox
              label="หมวด"
              value={draft.categoryId}
              onChange={(v) => set({ categoryId: v })}
              options={cats.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Field id="name" label="ชื่อไทย">
              <input id="name" className={inputClass} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field id="nameEn" label="ชื่ออังกฤษ">
              <input id="nameEn" className={inputClass} value={draft.nameEn} onChange={(e) => set({ nameEn: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field id="desc" label="คำอธิบาย">
                <textarea
                  id="desc"
                  rows={2}
                  className={`${inputClass} h-auto py-3`}
                  value={draft.description}
                  onChange={(e) => set({ description: e.target.value })}
                />
              </Field>
            </div>
            <Field id="price" label="ราคา (บาท)">
              <input
                id="price"
                inputMode="decimal"
                className={inputClass}
                value={draft.price}
                onChange={(e) => set({ price: e.target.value })}
              />
            </Field>
            <Field id="compare" label="ราคาเดิม (ขีดฆ่า)" hint="เว้นว่างถ้าไม่ลด">
              <input
                id="compare"
                inputMode="decimal"
                className={inputClass}
                value={draft.compareAt}
                onChange={(e) => set({ compareAt: e.target.value })}
              />
            </Field>
            <Field id="cost" label="ต้นทุน (บาท)" hint="ใช้คำนวณ menu engineering">
              <input
                id="cost"
                inputMode="decimal"
                className={inputClass}
                value={draft.cost}
                onChange={(e) => set({ cost: e.target.value })}
              />
            </Field>
            <Field id="cal" label="แคลอรี">
              <input
                id="cal"
                inputMode="numeric"
                className={inputClass}
                value={draft.calories}
                onChange={(e) => set({ calories: e.target.value })}
              />
            </Field>
            <Field id="prep" label="เวลาปรุง (นาที)">
              <input
                id="prep"
                inputMode="numeric"
                className={inputClass}
                value={draft.prepMinutes}
                onChange={(e) => set({ prepMinutes: e.target.value })}
              />
            </Field>
            <Listbox
              label="ความเผ็ด"
              value={draft.spicyLevel}
              onChange={(v) => set({ spicyLevel: v })}
              options={['0', '1', '2', '3'].map((v) => ({ value: v, label: v === '0' ? 'ไม่เผ็ด' : `ระดับ ${v}` }))}
            />
            <div className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-sm font-semibold">รูป</span>
              <div className="flex items-center gap-3">
                <div className="relative size-16 overflow-hidden rounded-xl bg-surface-2">
                  {draft.imageUrl && (
                    <Image
                      src={draft.imageUrl}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover"
                      unoptimized={draft.imageUrl.startsWith('/uploads')}
                    />
                  )}
                </div>
                <label className="press inline-flex h-10 cursor-pointer items-center gap-2 rounded-chip border border-line px-4 text-sm font-semibold hover:border-text/40">
                  <Upload aria-hidden className="size-4" /> อัปโหลดรูปจริงของร้าน
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                  />
                </label>
              </div>
            </div>
            <label className="flex items-center gap-3 text-[15px]">
              <input
                type="checkbox"
                className="size-5 accent-[var(--flame)]"
                checked={draft.isVegetarian}
                onChange={(e) => set({ isVegetarian: e.target.checked })}
              />
              มังสวิรัติ
            </label>
            <label className="flex items-center gap-3 text-[15px]">
              <input
                type="checkbox"
                className="size-5 accent-[var(--flame)]"
                checked={draft.isSignature}
                onChange={(e) => set({ isSignature: e.target.checked })}
              />
              ซิกเนเจอร์
            </label>
          </div>
        )}
      </Sheet>
    </>
  );
}
