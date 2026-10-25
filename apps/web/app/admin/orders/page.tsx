'use client';

import { Banknote, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageTitle, useAdminBranch } from '@/components/admin/admin-shell';
import { useNotify } from '@/components/providers/feedback';
import { useSession } from '@/components/providers/session';
import { Sheet } from '@/components/sheet';
import { Button, Chip, Field, inputClass, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { baht, clockTime, FULFILLMENT_LABEL, PAYMENT_LABEL, PAYMENT_STATUS_LABEL, shortDate, STATUS_LABEL } from '@/lib/format';
import { useRoom } from '@/lib/socket';
import type { OrderStatus } from '@/lib/types';

interface Row {
  id: string;
  number: string;
  status: OrderStatus;
  channel: string;
  fulfillmentType: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
  tableNo: string | null;
  grandTotalSatang: number;
  createdAt: string;
  items: { name: string; qty: number }[];
  payments: { id: string; method: 'PROMPTPAY' | 'CARD' | 'CASH'; status: string }[];
  user: { phone: string | null; name: string | null } | null;
}

const FILTERS: { key: string; label: string; status?: string }[] = [
  { key: 'active', label: 'กำลังดำเนินการ', status: 'PAID,ACCEPTED,PREPARING,READY,OUT_FOR_DELIVERY' },
  { key: 'pending', label: 'รอชำระ', status: 'PENDING_PAYMENT' },
  { key: 'done', label: 'สำเร็จ', status: 'COMPLETED' },
  { key: 'void', label: 'ยกเลิก/หมดเวลา', status: 'CANCELLED,EXPIRED' },
  { key: 'all', label: 'ทั้งหมด' },
];

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  PAID: 'ACCEPTED',
  ACCEPTED: 'PREPARING',
  PREPARING: 'READY',
};

export default function AdminOrders() {
  const branchId = useAdminBranch();
  const { user } = useSession();
  const notify = useNotify();
  const [filter, setFilter] = useState('active');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [refund, setRefund] = useState<Row | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const isManager = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const load = useCallback(
    async (after?: string) => {
      const status = FILTERS.find((f) => f.key === filter)?.status;
      const r = await api<{ data: Row[]; nextCursor: string | null }>(
        `/admin/orders?branchId=${branchId}${status ? `&status=${status}` : ''}${after ? `&cursor=${after}` : ''}`,
      );
      setRows((prev) => (after && prev ? [...prev, ...r.data] : r.data));
      setCursor(r.nextCursor);
    },
    [branchId, filter],
  );

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  useRoom('admin', { 'order.updated': () => void load() });

  const act = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      notify(ok, 'success');
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'ทำรายการไม่สำเร็จ', 'error');
    } finally {
      setBusy(null);
    }
  };

  const nextAction = (r: Row): { to: OrderStatus; label: string } | null => {
    if (NEXT[r.status]) return { to: NEXT[r.status]!, label: STATUS_LABEL[NEXT[r.status]!] };
    if (r.status === 'READY')
      return r.fulfillmentType === 'DELIVERY'
        ? { to: 'OUT_FOR_DELIVERY', label: 'ส่งให้ไรเดอร์' }
        : { to: 'COMPLETED', label: 'ส่งมอบแล้ว' };
    if (r.status === 'OUT_FOR_DELIVERY') return { to: 'COMPLETED', label: 'ส่งถึงแล้ว' };
    return null;
  };

  return (
    <>
      <PageTitle title="ออเดอร์" />
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => (
          <Chip key={f.key} selected={filter === f.key} onClick={() => setFilter(f.key)} className="shrink-0">
            {f.label}
          </Chip>
        ))}
      </div>

      {!rows ? (
        <div className="grid place-items-center py-20">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-8 text-center text-muted">ไม่มีออเดอร์ในกลุ่มนี้</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[860px] text-[15px]">
            <thead className="border-b border-line text-left text-sm text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">ออเดอร์</th>
                <th className="px-4 py-3 font-semibold">รายการ</th>
                <th className="px-4 py-3 font-semibold">ลูกค้า</th>
                <th className="px-4 py-3 text-right font-semibold">ยอด</th>
                <th className="px-4 py-3 font-semibold">สถานะ</th>
                <th className="px-4 py-3 text-right font-semibold">
                  <span className="sr-only">การทำงาน</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pay = r.payments[0];
                const next = nextAction(r);
                return (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 align-top">
                      <p className="tabular font-bold">#{r.number}</p>
                      <p className="text-sm text-muted">
                        {shortDate(r.createdAt)} {clockTime(r.createdAt)} · {r.channel}
                      </p>
                      <p className="text-sm text-muted">
                        {FULFILLMENT_LABEL[r.fulfillmentType]}
                        {r.tableNo && ` โต๊ะ ${r.tableNo}`}
                      </p>
                    </td>
                    <td className="max-w-64 px-4 py-3 align-top text-sm">{r.items.map((i) => `${i.qty}x ${i.name}`).join(', ')}</td>
                    <td className="px-4 py-3 align-top text-sm">
                      {r.user ? (r.user.name ?? r.user.phone) : <span className="text-muted">ผู้เยี่ยมชม</span>}
                    </td>
                    <td className="tabular px-4 py-3 text-right align-top font-semibold">{baht(r.grandTotalSatang)}</td>
                    <td className="px-4 py-3 align-top">
                      <p className="font-semibold">{STATUS_LABEL[r.status]}</p>
                      {pay && (
                        <p className="text-sm text-muted">
                          {PAYMENT_LABEL[pay.method]} · {PAYMENT_STATUS_LABEL[pay.status] ?? pay.status}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap justify-end gap-2">
                        {r.status === 'PENDING_PAYMENT' && pay?.method === 'CASH' && pay.status === 'PENDING' && (
                          <Button
                            size="sm"
                            loading={busy === r.id}
                            onClick={() =>
                              act(r.id, () => api(`/admin/payments/${pay.id}/mark-paid`, { method: 'POST' }), `รับเงินสด #${r.number} แล้ว`)
                            }
                          >
                            <Banknote aria-hidden className="size-4" /> รับเงินสด
                          </Button>
                        )}
                        {next && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={busy === r.id}
                            onClick={() =>
                              act(
                                r.id,
                                () => api(`/admin/orders/${r.id}/status`, { method: 'PATCH', body: { status: next.to } }),
                                `#${r.number}: ${STATUS_LABEL[next.to]}`,
                              )
                            }
                          >
                            {next.label}
                          </Button>
                        )}
                        {isManager && pay?.status === 'SUCCEEDED' && (
                          <Button size="sm" variant="danger" onClick={() => setRefund(r)}>
                            <RotateCcw aria-hidden className="size-4" /> คืนเงิน
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {cursor && (
        <Button variant="ghost" className="mt-3" onClick={() => load(cursor)}>
          โหลดเพิ่ม
        </Button>
      )}

      <Sheet
        open={!!refund}
        onClose={() => setRefund(null)}
        title={`คืนเงินออเดอร์ #${refund?.number ?? ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRefund(null)}>
              ไม่คืนเงิน
            </Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 3}
              loading={busy === refund?.id}
              onClick={async () => {
                const r = refund!;
                await act(
                  r.id,
                  () => api(`/admin/orders/${r.id}/refund`, { method: 'POST', body: { reason } }),
                  `คืนเงิน #${r.number} แล้ว`,
                );
                setRefund(null);
                setReason('');
              }}
            >
              ยืนยันคืนเงิน {refund && baht(refund.grandTotalSatang)}
            </Button>
          </div>
        }
      >
        <p className="text-muted">
          ระบบจะคืนเงินเข้าช่องทางเดิมเต็มจำนวน ถ้าครัวยังไม่เริ่มทำ วัตถุดิบจะคืนเข้าสต็อก และ Crowns ที่ได้จากออเดอร์นี้จะถูกหักคืน
        </p>
        <div className="mt-4">
          <Field id="refund-reason" label="เหตุผล" hint="บันทึกไว้ในประวัติออเดอร์">
            <input
              id="refund-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputClass}
              placeholder="เช่น ของไม่ครบ ลูกค้าขอยกเลิก"
            />
          </Field>
        </div>
      </Sheet>
    </>
  );
}
