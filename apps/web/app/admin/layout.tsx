import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/admin-shell';
import { StaffGate } from '@/components/staff-gate';

export const metadata: Metadata = { title: 'หลังร้าน' };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffGate roles={['OWNER', 'MANAGER', 'CASHIER']} next="/admin">
      <AdminShell>{children}</AdminShell>
    </StaffGate>
  );
}
