'use client';

import clsx from 'clsx';
import { BarChart3, ChefHat, ClipboardList, LayoutDashboard, LogOut, Megaphone, Package, UtensilsCrossed, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Branch, Role } from '@/lib/types';
import { Listbox } from '../listbox';
import { useSession } from '../providers/session';
import { Logo } from '../site-header';

const NAV: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; roles: Role[] }[] = [
  { href: '/admin', label: 'ภาพรวม', icon: LayoutDashboard, roles: ['OWNER', 'MANAGER'] },
  { href: '/admin/orders', label: 'ออเดอร์', icon: ClipboardList, roles: ['OWNER', 'MANAGER', 'CASHIER'] },
  { href: '/admin/menu', label: 'เมนู', icon: UtensilsCrossed, roles: ['OWNER', 'MANAGER'] },
  { href: '/admin/stock', label: 'สต็อกและสูตร', icon: Package, roles: ['OWNER', 'MANAGER'] },
  { href: '/admin/insights', label: 'วิเคราะห์เมนู', icon: BarChart3, roles: ['OWNER', 'MANAGER'] },
  { href: '/admin/marketing', label: 'โปรและรีวิว', icon: Megaphone, roles: ['OWNER', 'MANAGER'] },
  { href: '/admin/staff', label: 'พนักงาน', icon: Users, roles: ['OWNER', 'MANAGER'] },
];

const BranchCtx = createContext<string>('br_siam');
export const useAdminBranch = () => useContext(BranchCtx);

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useSession();
  const pathname = usePathname();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState(user?.branchId ?? 'br_siam');
  const canSwitch = user?.role === 'OWNER' || !user?.branchId;

  useEffect(() => {
    api<{ data: Branch[] }>('/branches').then((r) => setBranches(r.data));
  }, []);

  const nav = NAV.filter((n) => user && n.roles.includes(user.role));

  return (
    <BranchCtx.Provider value={branchId}>
      <div data-theme="light" className="min-h-dvh bg-bg text-text lg:grid lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3 px-4 py-4 lg:block">
            <Logo />
            <p className="text-sm text-muted lg:mt-1">หลังร้าน · {user?.name}</p>
          </div>
          <nav
            aria-label="หลังร้าน"
            className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible"
          >
            {nav.map((n) => {
              const current = n.href === '/admin' ? pathname === '/admin' : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={current ? 'page' : undefined}
                  className={clsx(
                    'press flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium',
                    current ? 'bg-ink text-bun' : 'text-muted hover:bg-surface-2 hover:text-text',
                  )}
                >
                  <n.icon className={clsx('size-[18px]', current && 'text-flame')} />
                  {n.label}
                </Link>
              );
            })}
            <Link
              href="/kitchen"
              className="press flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-muted hover:bg-surface-2 hover:text-text"
            >
              <ChefHat className="size-[18px]" /> จอครัว
            </Link>
          </nav>
          <div className="hidden flex-col gap-3 border-t border-line p-4 lg:flex">
            {canSwitch && branches.length > 0 ? (
              <Listbox
                label="สาขา"
                value={branchId}
                onChange={setBranchId}
                options={branches.map((b) => ({ value: b.id, label: b.name }))}
              />
            ) : (
              <p className="text-sm text-muted">{branches.find((b) => b.id === branchId)?.name}</p>
            )}
            <button
              type="button"
              onClick={logout}
              className="press flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text"
            >
              <LogOut aria-hidden className="size-4" /> ออกจากระบบ
            </button>
          </div>
        </aside>
        <main id="main" className="min-w-0 px-4 py-6 lg:px-8">
          {canSwitch && branches.length > 0 && (
            <div className="mb-4 max-w-xs lg:hidden">
              <Listbox
                label="สาขา"
                value={branchId}
                onChange={setBranchId}
                options={branches.map((b) => ({ value: b.id, label: b.name }))}
              />
            </div>
          )}
          {children}
        </main>
      </div>
    </BranchCtx.Provider>
  );
}

export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <h1 className="font-display-th text-3xl font-black sm:text-4xl">{title}</h1>
      {children}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('rounded-card border border-line bg-surface p-5', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
