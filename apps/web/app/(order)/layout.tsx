import { MobileTabBar } from '@/components/mobile-tab-bar';
import { SiteHeader } from '@/components/site-header';
import { TableBar } from '@/components/table-bar';

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="light" className="min-h-dvh bg-bg text-text">
      <SiteHeader />
      <TableBar />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-32 md:pb-16">
        {children}
      </main>
      <MobileTabBar />
    </div>
  );
}
