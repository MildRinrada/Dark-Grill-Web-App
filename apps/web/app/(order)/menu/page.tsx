import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { MenuBrowser } from '@/components/menu/menu-browser';
import { ReorderStrip } from '@/components/menu/reorder-strip';
import { BranchPicker } from '@/components/site-header';
import { getMenu } from '@/lib/server-api';

export const metadata: Metadata = { title: 'เมนู' };

export default async function MenuPage() {
  const branchId = (await cookies()).get('branch')?.value ?? 'br_siam';
  const menu = await getMenu(branchId);

  return (
    <>
      <section data-theme="dark" className="relative mt-4 overflow-hidden rounded-[28px] bg-bg text-text" aria-labelledby="promo-title">
        <Image
          src="/images/menu/charcoal-bun.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 1152px) 1120px, 100vw"
          className="object-cover object-[70%_40%] opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/80 to-transparent" aria-hidden />
        <div className="relative flex min-h-[200px] flex-col justify-center gap-3 p-6 sm:min-h-[240px] sm:p-10">
          <span className="font-brush -rotate-2 self-start text-lg text-cheese">Earn Crowns</span>
          <h1 id="promo-title" className="max-w-[18ch] font-display-th text-3xl font-black leading-[1.05] sm:text-5xl">
            ลด ฿50 ออเดอร์แรก
          </h1>
          <p className="max-w-[40ch] text-muted">
            ใส่โค้ด <strong className="font-bold text-flame">WELCOME50</strong> เมื่อสั่งครบ ฿200 ทุกช่วงบ่าย 14:00-17:00 เครื่องดื่มลด 20%
          </p>
        </div>
      </section>

      <div className="mt-4 sm:hidden">
        <BranchPicker />
      </div>

      <ReorderStrip />

      {menu ? (
        <div className="mt-2">
          {!menu.branch.isOpen && (
            <p role="status" className="mt-4 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[15px]">
              {menu.branch.name} ปิดอยู่ตอนนี้ คุณยังดูเมนูและนัดเวลารับล่วงหน้าได้
            </p>
          )}
          <MenuBrowser initial={menu} branchId={branchId} />
        </div>
      ) : (
        <div className="py-24 text-center">
          <p className="text-lg font-semibold">โหลดเมนูไม่ได้ในตอนนี้</p>
          <p className="mt-1 text-muted">ระบบหลังร้านอาจกำลังรีสตาร์ต ลองรีเฟรชอีกครั้งในอีกสักครู่</p>
          <Link href="/menu" className="press mt-5 inline-flex rounded-chip bg-accent px-6 py-3 font-semibold text-accent-ink">
            ลองอีกครั้ง
          </Link>
        </div>
      )}
    </>
  );
}
