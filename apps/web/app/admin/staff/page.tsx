'use client';

import { UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageTitle, Panel } from '@/components/admin/admin-shell';
import { Listbox } from '@/components/listbox';
import { useNotify } from '@/components/providers/feedback';
import { useSession } from '@/components/providers/session';
import { Button, Field, inputClass } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { Branch, Role } from '@/lib/types';

interface Staff {
  id: string;
  name: string | null;
  phone: string | null;
  role: Role;
  staffBranchId: string | null;
}

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'เจ้าของ',
  MANAGER: 'ผู้จัดการ',
  CASHIER: 'แคชเชียร์',
  KITCHEN: 'ครัว',
  RIDER: 'ไรเดอร์',
  CUSTOMER: 'ลูกค้า (ถอดสิทธิ์)',
};

export default function StaffPage() {
  const { user } = useSession();
  const notify = useNotify();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [roles, setRoles] = useState<{ role: Role; can: string[] }[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState({ phone: '', name: '', role: 'CASHIER' as Role, branchId: 'br_siam' });

  const load = useCallback(async () => {
    const [s, r, b] = await Promise.all([
      api<{ data: Staff[] }>('/admin/staff'),
      api<{ data: { role: Role; can: string[] }[] }>('/admin/roles'),
      api<{ data: Branch[] }>('/branches'),
    ]);
    setStaff(s.data);
    setRoles(r.data);
    setBranches(b.data);
  }, []);

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

  const roleOptions = (['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'RIDER', 'CUSTOMER'] as Role[])
    .filter((r) => r !== 'OWNER' || user?.role === 'OWNER')
    .map((r) => ({ value: r, label: ROLE_LABEL[r] }));
  const branchName = (id: string | null) => (id ? (branches.find((b) => b.id === id)?.name ?? id) : 'ทุกสาขา');

  return (
    <>
      <PageTitle title="พนักงานและสิทธิ์" />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="ทีม">
          <ul className="divide-y divide-line">
            {staff.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-40 flex-1">
                  <p className="font-semibold">{s.name ?? s.phone}</p>
                  <p className="tabular text-sm text-muted">
                    {s.phone} · {branchName(s.staffBranchId)}
                  </p>
                </div>
                <div className="w-48">
                  <Listbox
                    label={`บทบาทของ ${s.name ?? s.phone}`}
                    hideLabel
                    value={s.role}
                    options={roleOptions}
                    onChange={(role) => {
                      if (s.id === user?.id) return notify('เปลี่ยนบทบาทตัวเองไม่ได้', 'info');
                      void run(
                        () => api(`/admin/staff/${s.id}`, { method: 'PATCH', body: { role } }),
                        'เปลี่ยนบทบาทแล้ว มีผลเมื่อพนักงานต่ออายุการเข้าสู่ระบบ',
                      );
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="เพิ่มพนักงาน">
            <div className="flex flex-col gap-3">
              <Field id="sphone" label="เบอร์มือถือ" hint="พนักงานเข้าสู่ระบบด้วย OTP เบอร์นี้">
                <input
                  id="sphone"
                  inputMode="numeric"
                  className={inputClass}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                />
              </Field>
              <Field id="sname" label="ชื่อ">
                <input id="sname" className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Listbox
                label="บทบาท"
                value={form.role}
                onChange={(role) => setForm({ ...form, role })}
                options={roleOptions.filter((r) => r.value !== 'CUSTOMER')}
              />
              <Listbox
                label="สาขา"
                value={form.branchId}
                onChange={(branchId) => setForm({ ...form, branchId })}
                options={branches.map((b) => ({ value: b.id, label: b.name }))}
              />
              <Button
                disabled={form.phone.length !== 10 || !form.name}
                onClick={() =>
                  run(
                    () => api('/admin/staff', { method: 'POST', body: form }).then(() => setForm({ ...form, phone: '', name: '' })),
                    'เพิ่มพนักงานแล้ว',
                  )
                }
              >
                <UserPlus aria-hidden className="size-4" /> เพิ่ม
              </Button>
            </div>
          </Panel>
          <Panel title="สิทธิ์ตามบทบาท">
            <dl className="flex flex-col gap-3">
              {roles.map((r) => (
                <div key={r.role}>
                  <dt className="font-semibold">{ROLE_LABEL[r.role]}</dt>
                  <dd className="text-sm text-muted">{r.can.join(' · ')}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
