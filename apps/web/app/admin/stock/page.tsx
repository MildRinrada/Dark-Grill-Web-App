'use client';

import clsx from 'clsx';
import { AlertTriangle, PackagePlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageTitle, Panel, useAdminBranch } from '@/components/admin/admin-shell';
import { Listbox } from '@/components/listbox';
import { useNotify } from '@/components/providers/feedback';
import { Segmented } from '@/components/segmented';
import { Button, Field, inputClass, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { clockTime, shortDate } from '@/lib/format';

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  kind: string;
  quantity: number;
  reorderPoint: number;
  isLow: boolean;
  costPerUnitSatang: number;
}
interface Movement {
  id: string;
  delta: number;
  reason: string;
  note: string | null;
  createdAt: string;
  ingredient: { name: string; unit: string };
}
interface MenuItem {
  id: string;
  name: string;
  isArchived: boolean;
  recipe: { ingredientId: string; qty: number; ingredient: { name: string; unit: string } }[];
}

const REASON: Record<string, string> = {
  RECEIVE: 'รับเข้า',
  WASTE: 'ของเสีย',
  ADJUST: 'นับจริง',
  REFUND: 'คืนจากออเดอร์ยกเลิก',
  SALE: 'ขาย',
};

export default function StockPage() {
  const branchId = useAdminBranch();
  const notify = useNotify();
  const [rows, setRows] = useState<Ingredient[] | null>(null);
  const [moves, setMoves] = useState<Movement[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [form, setForm] = useState({ ingredientId: '', reason: 'RECEIVE' as 'RECEIVE' | 'WASTE' | 'ADJUST', quantity: '', note: '' });
  const [recipeFor, setRecipeFor] = useState('');
  const [recipe, setRecipe] = useState<{ ingredientId: string; qty: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [i, m] = await Promise.all([
      api<{ data: Ingredient[] }>(`/admin/ingredients?branchId=${branchId}`),
      api<{ data: Movement[] }>(`/admin/stock-movements?branchId=${branchId}`),
    ]);
    setRows(i.data);
    setMoves(m.data);
    setForm((f) => ({ ...f, ingredientId: f.ingredientId || i.data[0]?.id || '' }));
  }, [branchId]);

  useEffect(() => {
    void load();
    api<{ data: MenuItem[] }>('/admin/menu-items').then((r) => {
      const live = r.data.filter((x) => !x.isArchived && x.recipe.length);
      setItems(live);
      setRecipeFor(live[0]?.id ?? '');
    });
  }, [load]);

  useEffect(() => {
    const item = items.find((i) => i.id === recipeFor);
    setRecipe(item ? item.recipe.map((r) => ({ ingredientId: r.ingredientId, qty: String(r.qty) })) : []);
  }, [recipeFor, items]);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<{ quantity: number }>('/admin/stock-movements', {
        method: 'POST',
        body: {
          branchId,
          ingredientId: form.ingredientId,
          reason: form.reason,
          quantity: Number(form.quantity),
          note: form.note || undefined,
        },
      });
      notify(`บันทึกแล้ว คงเหลือ ${r.quantity}`, 'success');
      setForm((f) => ({ ...f, quantity: '', note: '' }));
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveRecipe = async () => {
    try {
      await api(`/admin/recipes/${recipeFor}`, {
        method: 'PUT',
        body: { lines: recipe.filter((r) => Number(r.qty) > 0).map((r) => ({ ingredientId: r.ingredientId, qty: Number(r.qty) })) },
      });
      notify('บันทึกสูตรแล้ว การตัดสต็อกครั้งถัดไปใช้สูตรนี้', 'success');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'บันทึกสูตรไม่สำเร็จ', 'error');
    }
  };

  if (!rows) {
    return (
      <div className="grid place-items-center py-20">
        <Spinner />
      </div>
    );
  }
  const unit = rows.find((r) => r.id === form.ingredientId)?.unit ?? '';
  const sorted = [...rows].sort((a, b) => Number(b.isLow) - Number(a.isLow) || a.name.localeCompare(b.name, 'th'));

  return (
    <>
      <PageTitle title="สต็อกและสูตร" />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="คงเหลือที่สาขา">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[15px]">
              <thead className="text-left text-sm text-muted">
                <tr>
                  <th className="pb-2 font-semibold">วัตถุดิบ</th>
                  <th className="pb-2 text-right font-semibold">คงเหลือ</th>
                  <th className="pb-2 text-right font-semibold">จุดสั่งซื้อ</th>
                  <th className="pb-2 font-semibold">
                    <span className="sr-only">สถานะ</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-2">{r.name}</td>
                    <td className={clsx('tabular py-2 text-right font-semibold', r.isLow && 'text-danger')}>
                      {Math.round(r.quantity * 10) / 10} {r.unit}
                    </td>
                    <td className="tabular py-2 text-right text-muted">{r.reorderPoint}</td>
                    <td className="py-2 pl-3">
                      {r.isLow && (
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-danger">
                          <AlertTriangle aria-hidden className="size-4" /> ต้องสั่ง
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="บันทึกสต็อก">
            <div className="flex flex-col gap-4">
              <Listbox
                label="วัตถุดิบ"
                value={form.ingredientId}
                onChange={(v) => setForm({ ...form, ingredientId: v })}
                options={rows.map((r) => ({ value: r.id, label: r.name }))}
              />
              <Segmented
                label="ประเภท"
                value={form.reason}
                onChange={(v) => setForm({ ...form, reason: v })}
                options={[
                  { value: 'RECEIVE', label: 'รับเข้า' },
                  { value: 'WASTE', label: 'ของเสีย' },
                  { value: 'ADJUST', label: 'นับจริง' },
                ]}
              />
              <Field id="qty" label={form.reason === 'ADJUST' ? `จำนวนที่นับได้ (${unit})` : `จำนวน (${unit})`}>
                <input
                  id="qty"
                  inputMode="decimal"
                  className={inputClass}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </Field>
              <Field id="mnote" label="หมายเหตุ">
                <input
                  id="mnote"
                  className={inputClass}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="เลขใบส่งของ, สาเหตุของเสีย"
                />
              </Field>
              <Button onClick={submit} loading={busy} disabled={!(Number(form.quantity) > 0)}>
                <PackagePlus aria-hidden className="size-4" /> บันทึก
              </Button>
            </div>
          </Panel>

          <Panel title="ล่าสุด">
            {moves.length === 0 ? (
              <p className="text-muted">ยังไม่มีการบันทึก</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {moves.slice(0, 8).map((m) => (
                  <li key={m.id} className="flex justify-between gap-3">
                    <span>
                      <span className="font-semibold">{REASON[m.reason] ?? m.reason}</span> {m.ingredient.name}
                    </span>
                    <span className={clsx('tabular', m.delta < 0 ? 'text-danger' : 'text-success')}>
                      {m.delta > 0 ? '+' : ''}
                      {Math.round(m.delta * 10) / 10} {m.ingredient.unit}
                      <span className="ml-2 text-muted">
                        {shortDate(m.createdAt)} {clockTime(m.createdAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="สูตร (BOM) ขายแล้วตัดวัตถุดิบตามนี้" className="mt-4">
        <div className="max-w-sm">
          <Listbox label="เมนู" value={recipeFor} onChange={setRecipeFor} options={items.map((i) => ({ value: i.id, label: i.name }))} />
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {recipe.map((r, idx) => {
            const ing = rows.find((x) => x.id === r.ingredientId);
            return (
              <li key={r.ingredientId} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
                <label htmlFor={`rq-${idx}`} className="flex-1 text-[15px]">
                  {ing?.name ?? r.ingredientId}
                </label>
                <input
                  id={`rq-${idx}`}
                  inputMode="decimal"
                  value={r.qty}
                  onChange={(e) => setRecipe((list) => list.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))}
                  className="tabular h-10 w-20 rounded-lg border border-line bg-surface px-2 text-right focus:border-text focus:outline-none"
                />
                <span className="w-10 text-sm text-muted">{ing?.unit}</span>
              </li>
            );
          })}
        </ul>
        <Button className="mt-4" variant="secondary" onClick={saveRecipe}>
          บันทึกสูตร
        </Button>
      </Panel>
    </>
  );
}
