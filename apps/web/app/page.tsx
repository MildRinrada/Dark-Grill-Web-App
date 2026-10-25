import { ChefHat, Crown, Globe, MessageCircle, MonitorSmartphone, QrCode } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { BrandHeader } from '@/components/home/brand-header';
import { LazyExplode } from '@/components/home/lazy-explode';
import { Hero } from '@/components/home/hero';
import { baht } from '@/lib/format';
import { getBranches, getMenu } from '@/lib/server-api';

export default async function HomePage() {
  const [menu, branches] = await Promise.all([getMenu('br_siam'), getBranches()]);
  const all = menu?.categories.flatMap((c) => c.items) ?? [];
  const signature = menu?.categories.find((c) => c.slug === 'signature')?.items ?? [];
  const feature = all.find((i) => i.id === 'mi_fire_grill') ?? signature[0] ?? null;
  const lineup = signature.filter((i) => i.id !== feature?.id);
  const next = [...lineup.slice(0, 2), ...all.filter((i) => i.id === 'mi_combo_grill')].slice(0, 3);

  return (
    <div data-theme="dark" className="min-h-dvh bg-bg text-text">
      <BrandHeader />
      <main id="main">
        <Hero feature={feature} next={next} />

        <LazyExplode />

        {lineup.length >= 3 && (
          <section className="mx-auto max-w-6xl px-4 py-24" aria-labelledby="lineup-title">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <h2 id="lineup-title" className="max-w-[14ch] font-display-th text-4xl font-black leading-[1.05] sm:text-5xl">
                ซิกเนเจอร์ที่คนสั่งซ้ำ
              </h2>
              <Link
                href="/menu"
                className="press rounded-chip border border-line px-5 py-2.5 font-semibold hover:border-flame hover:text-flame"
              >
                เมนูทั้งหมด
              </Link>
            </div>
            <div className="grid gap-4 md:grid-cols-[1.35fr_1fr] md:grid-rows-2">
              {lineup.slice(0, 3).map((item, i) => (
                <Link
                  key={item.id}
                  href={`/menu/${item.slug}`}
                  className={`press group relative isolate flex overflow-hidden rounded-[28px] bg-surface ${i === 0 ? 'min-h-[420px] md:row-span-2 md:min-h-[560px]' : 'min-h-[260px]'}`}
                >
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    sizes={i === 0 ? '(min-width: 768px) 640px, 100vw' : '(min-width: 768px) 460px, 100vw'}
                    className="-z-10 object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
                  />
                  <div className="absolute inset-0 -z-10 bg-gradient-to-t from-char via-char/40 to-transparent" aria-hidden />
                  <div className="mt-auto flex w-full items-end justify-between gap-4 p-6">
                    <div>
                      <h3 className={`font-display-th font-black leading-tight ${i === 0 ? 'text-4xl' : 'text-2xl'}`}>{item.name}</h3>
                      {i === 0 && <p className="mt-2 max-w-[38ch] text-muted">{item.description}</p>}
                    </div>
                    <span className="tabular shrink-0 rounded-chip bg-accent px-4 py-2 font-bold text-accent-ink">
                      {baht(item.priceSatang)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="relative overflow-hidden border-y border-line bg-surface" aria-labelledby="build-title">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-2">
            <div className="relative aspect-square overflow-hidden rounded-[28px]">
              <Image
                src="/images/menu/build-float.jpg"
                alt="วัตถุดิบเบอร์เกอร์ลอยแยกชั้น ขนมปัง ผักกาด มะเขือเทศ หัวหอม ชีส เนื้อ"
                fill
                sizes="(min-width: 768px) 560px, 100vw"
                className="object-cover"
              />
            </div>
            <div>
              <ChefHat aria-hidden className="size-10 text-flame" />
              <h2 id="build-title" className="mt-4 max-w-[14ch] font-display-th text-4xl font-black leading-[1.05] sm:text-5xl">
                แต่งเบอร์เกอร์เองทีละชั้น
              </h2>
              <p className="mt-4 max-w-[44ch] text-[17px] text-muted">
                เลือกขนมปัง เนื้อ ชีส ผัก และซอส เห็นชั้นซ้อนขึ้นตรงหน้า ราคาและแคลอรีอัปเดตทันทีทุกครั้งที่เพิ่ม
              </p>
              <Link
                href="/build"
                className="press mt-8 inline-flex h-14 items-center rounded-chip bg-accent px-8 text-lg font-bold text-accent-ink hover:brightness-105"
              >
                เริ่มแต่งเลย
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-24" aria-labelledby="channels-title">
          <div className="grid gap-12 md:grid-cols-[1fr_1.2fr]">
            <div>
              <Crown aria-hidden className="size-10 text-cheese" />
              <h2 id="channels-title" className="mt-4 font-display-th text-4xl font-black leading-[1.05] sm:text-5xl">
                ทุก ฿10 ได้ 1 Crown
              </h2>
              <p className="mt-4 max-w-[40ch] text-[17px] text-muted">
                สะสมได้ทุกช่องทาง แลกฟรายส์ ส่งฟรี หรือส่วนลด ทำภารกิจรายเดือนรับ Crowns เพิ่ม เลื่อนระดับ Bronze, Silver, Gold
              </p>
              <Link
                href="/account"
                className="press mt-6 inline-flex rounded-chip border border-line px-6 py-3 font-semibold hover:border-cheese hover:text-cheese"
              >
                ดู Crowns ของฉัน
              </Link>
            </div>
            <ul className="divide-y divide-line border-y border-line">
              {[
                { icon: Globe, title: 'เว็บและมือถือ', text: 'เปิดเร็ว ติดตั้งเป็นแอปได้ ไม่ต้องดาวน์โหลด' },
                { icon: MessageCircle, title: 'LINE', text: 'สั่งในแชท รับแจ้งสถานะทุกขั้นผ่าน LINE OA' },
                { icon: QrCode, title: 'สแกน QR ที่โต๊ะ', text: 'สั่งและจ่ายจากโต๊ะ ไม่ต้องต่อคิว' },
                { icon: MonitorSmartphone, title: 'ตู้ Kiosk หน้าร้าน', text: 'จอใหญ่ ภาพเต็มจอ จ่ายพร้อมเพย์หรือเงินสด' },
              ].map((c) => (
                <li key={c.title} className="flex items-start gap-4 py-5">
                  <c.icon aria-hidden className="mt-1 size-6 shrink-0 text-flame" />
                  <div>
                    <p className="text-lg font-bold">{c.title}</p>
                    <p className="text-muted">{c.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-display text-3xl uppercase">Dark Grill</p>
            <p className="mt-2 max-w-[36ch] text-muted">เบอร์เกอร์ย่างไฟแรง สามสาขาในกรุงเทพฯ เปิดทุกวัน 10:00-22:00</p>
          </div>
          <div>
            <p className="font-semibold">สาขา</p>
            <ul className="mt-3 space-y-2 text-muted">
              {(branches?.data ?? []).map((b) => (
                <li key={b.id}>
                  {b.name}{' '}
                  <span className="text-sm">
                    {b.opensAt}-{b.closesAt}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold">สำหรับร้าน</p>
            <ul className="mt-3 space-y-2">
              <li>
                <Link className="text-muted hover:text-text" href="/kiosk">
                  โหมด Kiosk
                </Link>
              </li>
              <li>
                <Link className="text-muted hover:text-text" href="/t/siam/12">
                  ตัวอย่าง QR โต๊ะ 12
                </Link>
              </li>
              <li>
                <Link className="text-muted hover:text-text" href="/kitchen">
                  จอครัว (KDS)
                </Link>
              </li>
              <li>
                <Link className="text-muted hover:text-text" href="/admin">
                  หลังร้าน
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <p className="border-t border-line px-4 py-6 text-center text-sm text-muted">ภาพอาหาร: Unsplash ใช้เพื่อการสาธิต</p>
      </footer>
    </div>
  );
}
