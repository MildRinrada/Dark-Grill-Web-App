'use client';

import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { Role } from '@/lib/types';
import { useSession } from './providers/session';
import { Spinner } from './ui';

/** Client-side gate for staff screens. The API enforces roles on every call regardless. */
export function StaffGate({ roles, next, children }: { roles: Role[]; next: string; children: React.ReactNode }) {
  const { user, ready } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [ready, user, router, next]);

  if (!ready || !user) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg">
        <Spinner />
      </div>
    );
  }
  if (!roles.includes(user.role)) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center text-text">
        <div className="flex max-w-sm flex-col items-center gap-3">
          <ShieldAlert aria-hidden className="size-10 text-danger" />
          <h1 className="text-2xl font-bold">หน้านี้สำหรับพนักงาน</h1>
          <p className="text-muted">บัญชีนี้ไม่มีสิทธิ์เข้าถึง ลองเข้าสู่ระบบด้วยบัญชีพนักงาน</p>
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="press mt-2 rounded-chip bg-accent px-5 py-2.5 font-semibold text-accent-ink"
          >
            เปลี่ยนบัญชี
          </Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
