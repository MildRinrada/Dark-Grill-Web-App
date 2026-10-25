'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { baht } from '@/lib/format';
import type { ItemDetail, MenuCard } from '@/lib/types';
import { useCart } from '../providers/cart';
import { useNotify } from '../providers/feedback';
import { Sheet } from '../sheet';
import { Button } from '../ui';
import { OptionGroups, QtyStepper, useOptionSelection } from './option-picker';

export function AddSheet({
  item,
  branchId,
  sourceEl,
  onClose,
  theme,
}: {
  theme?: 'light' | 'dark';
  item: MenuCard | null;
  branchId: string;
  sourceEl: HTMLElement | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [slow, setSlow] = useState(false);
  const { add, busy } = useCart();
  const notify = useNotify();
  const sel = useOptionSelection(null);

  useEffect(() => {
    if (!item) return;
    setDetail(null);
    sel.setQty(1);
    // A skeleton only appears if loading passes ~300 ms, so fast loads never flash.
    const timer = setTimeout(() => setSlow(true), 300);
    api<ItemDetail>(`/menu/items/${item.id}?branchId=${branchId}`)
      .then((d) => {
        setDetail(d);
        sel.reset(d);
      })
      .catch(() => notify('โหลดรายละเอียดไม่สำเร็จ', 'error'))
      .finally(() => {
        clearTimeout(timer);
        setSlow(false);
      });
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, branchId]);

  const optionIds = Object.values(sel.picked).flat();
  const chosen = detail?.optionGroups.flatMap((g) => g.options).filter((o) => optionIds.includes(o.id)) ?? [];
  const unit = (detail?.priceSatang ?? 0) + chosen.reduce((a, o) => a + o.priceDeltaSatang, 0);
  const missing = detail?.optionGroups.filter((g) => (sel.picked[g.id]?.length ?? 0) < g.minSelect) ?? [];

  const submit = async () => {
    if (!detail) return;
    const ok = await add({ menuItemId: detail.id, qty: sel.qty, optionIds }, sourceEl, detail.imageUrl);
    if (ok) {
      notify(`เพิ่ม ${detail.name} แล้ว`, 'success');
      onClose();
    }
  };

  return (
    <Sheet
      theme={theme}
      open={!!item}
      onClose={onClose}
      title={item?.name ?? ''}
      footer={
        <div className="flex items-center gap-3">
          <QtyStepper value={sel.qty} onChange={sel.setQty} />
          <Button size="lg" className="flex-1" disabled={!detail || missing.length > 0} loading={busy} onClick={submit}>
            {missing.length ? `เลือก${missing[0].name}` : `เพิ่มลงตะกร้า ${baht(unit * sel.qty)}`}
          </Button>
        </div>
      }
    >
      {item && (
        <div className="flex flex-col gap-5">
          <div className="flex gap-4">
            <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-surface-2">
              <Image src={item.imageUrl} alt="" fill sizes="96px" className="object-cover" />
            </div>
            <p className="text-[15px] text-muted">{item.description}</p>
          </div>
          {detail ? (
            <OptionGroups groups={detail.optionGroups} picked={sel.picked} onToggle={sel.toggle} />
          ) : slow ? (
            <div className="flex flex-col gap-3" aria-hidden>
              <div className="skeleton h-5 w-32 rounded-full" />
              <div className="flex gap-2">
                <div className="skeleton h-11 w-24 rounded-full" />
                <div className="skeleton h-11 w-28 rounded-full" />
                <div className="skeleton h-11 w-20 rounded-full" />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
