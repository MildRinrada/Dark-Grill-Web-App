'use client';

import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { baht } from '@/lib/format';
import type { MenuCard } from '@/lib/types';
import { Steam } from '../steam';

function SocialGlyph({ kind }: { kind: 'ig' | 'fb' | 'line' }) {
  if (kind === 'ig')
    return (
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  if (kind === 'fb')
    return (
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden>
        <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.5V21h3z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden>
      <path d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.5 7.2 8.3 7.9.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5s5.8-3.4 7.9-5.9c1.4-1.6 2.1-3.2 2.1-4.9 0-4.4-4.5-8-10-8z" />
    </svg>
  );
}

/**
 * Writes scroll progress and a smoothed pointer/tilt position into CSS variables on
 * the section (--scroll 0..1, --px and --py -0.5..0.5). Layers read them in their
 * transforms, so parallax runs on the compositor with no animation library.
 */
function useParallax(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let frame = 0;
    const tick = () => {
      cur.x += (target.x - cur.x) * 0.08;
      cur.y += (target.y - cur.y) * 0.08;
      const h = el.offsetHeight || 1;
      el.style.setProperty('--scroll', String(Math.min(1, Math.max(0, window.scrollY / h))));
      el.style.setProperty('--px', cur.x.toFixed(4));
      el.style.setProperty('--py', cur.y.toFixed(4));
      frame = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      target.x = e.clientX / window.innerWidth - 0.5;
      target.y = e.clientY / window.innerHeight - 0.5;
    };
    // phones: tilt the layers with the device (no permission prompt on Android)
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      target.x = Math.max(-0.5, Math.min(0.5, e.gamma / 60));
      target.y = Math.max(-0.5, Math.min(0.5, (e.beta - 45) / 90));
    };
    const io = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      if (entry.isIntersecting) frame = requestAnimationFrame(tick);
    });
    io.observe(el);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('deviceorientation', onTilt);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('deviceorientation', onTilt);
    };
  }, [ref]);
}

/**
 * Layered hero: the BURGERS wordmark drifts slowly, the cut-out burger moves faster
 * and floats, and the fries tilt with the pointer, giving the food depth (design
 * doc: hero parallax). Under reduced motion every layer is static.
 */
export function Hero({ feature, next }: { feature: MenuCard | null; next: MenuCard[] }) {
  const ref = useRef<HTMLElement>(null);
  useParallax(ref);

  return (
    <section ref={ref} className="hero relative isolate flex min-h-[100svh] flex-col overflow-hidden pt-20" aria-labelledby="hero-title">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_45%,color-mix(in_srgb,var(--flame)_22%,transparent),transparent_70%)]"
        aria-hidden
      />

      <ul className="absolute left-5 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 lg:flex" aria-label="ติดตามเรา">
        {(['ig', 'fb', 'line'] as const).map((k) => (
          <li key={k}>
            <a
              href="#"
              className="press grid size-10 place-items-center rounded-full border border-line text-muted hover:border-flame hover:text-flame"
              aria-label={{ ig: 'Instagram', fb: 'Facebook', line: 'LINE Official Account' }[k]}
            >
              <SocialGlyph kind={k} />
            </a>
          </li>
        ))}
        <li className="mx-auto mt-2 h-16 w-px bg-line" aria-hidden />
      </ul>

      <div className="relative flex min-h-[380px] flex-1 items-end justify-center">
        <p
          aria-hidden
          className="hero-text absolute inset-x-0 top-[6%] select-none text-center font-display text-[min(29vw,calc((100svh-280px)*0.42))] uppercase leading-[0.8] tracking-[-0.01em] text-flame"
        >
          <span className="hero-rise block">Burgers</span>
        </p>

        <div className="hero-burger relative z-10 w-[min(94vw,700px,calc((100svh-300px)*1.12))]">
          <div className="hero-land">
            <Image
              src="/images/hero-burger-cutout.webp"
              alt="เบอร์เกอร์ไฟร์กริลล์ ซิกเนเจอร์ เนื้อสองชั้น ชีสละลาย ผักสด"
              width={1000}
              height={800}
              priority
              sizes="(min-width: 820px) 760px, 94vw"
              className="h-auto w-full drop-shadow-[0_40px_60px_rgb(0_0_0/0.65)]"
            />
          </div>
          <Steam className="left-[38%] top-[-4%] w-[24%]" />
          <div className="hero-fries absolute bottom-[4%] -right-[2%] w-[32%] sm:-right-[14%]">
            <div className="hero-slide">
              <Image
                src="/images/hero-fries-cutout.webp"
                alt=""
                width={770}
                height={560}
                sizes="260px"
                className="h-auto w-full drop-shadow-[0_24px_30px_rgb(0_0_0/0.6)]"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="z-20 mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 pb-8 pt-4 md:px-8 lg:pl-20">
        <div className="relative max-w-xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-flame">Signature</p>
          <h1 id="hero-title" className="font-display-th text-[40px] font-black leading-[1.02] sm:text-[56px]">
            {feature?.name ?? 'ไฟร์กริลล์ ซิกเนเจอร์'}
          </h1>
          <p className="mt-3 max-w-[42ch] text-[17px] text-muted">
            {feature?.description ?? 'เนื้อสแมชสองชั้นย่างไฟแรง เชดดาร์ละลาย ฮาลาเปโน สไปซี่มาโย'}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={feature ? `/menu/${feature.slug}` : '/menu'}
              className="press inline-flex h-14 items-center gap-3 rounded-chip bg-accent pl-7 pr-2 text-lg font-bold text-accent-ink hover:brightness-105"
            >
              สั่งเลย {feature && <span className="tabular">{baht(feature.priceSatang)}</span>}
              <span className="grid size-10 place-items-center rounded-full bg-ink text-flame">
                <ArrowRight aria-hidden className="size-5" />
              </span>
            </Link>
            <Link
              href="/menu"
              className="press inline-flex h-14 items-center rounded-chip border border-line px-6 font-semibold hover:border-text/50"
            >
              ดูเมนูทั้งหมด
            </Link>
          </div>
        </div>

        {next.length > 0 && (
          <nav aria-label="เมนูถัดไป" className="relative min-w-0 lg:absolute lg:right-8 lg:top-1/2 lg:w-60 lg:-translate-y-1/2">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Next up</p>
            <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 md:-mx-8 md:px-8 lg:mx-0 lg:flex-col lg:px-0">
              {next.map((n) => (
                <li key={n.id} className="shrink-0">
                  <Link
                    href={`/menu/${n.slug}`}
                    className="press group flex w-56 items-center gap-3 rounded-2xl border border-line bg-surface/70 p-2 pr-3 backdrop-blur hover:border-flame/60 lg:w-full"
                  >
                    <span className="relative size-14 shrink-0 overflow-hidden rounded-xl">
                      <Image src={n.imageUrl} alt="" fill sizes="56px" className="object-cover" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{n.name}</span>
                      <span className="tabular text-sm text-flame">{baht(n.priceSatang)}</span>
                    </span>
                    <ArrowUpRight aria-hidden className="size-4 text-muted transition-colors group-hover:text-flame" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </section>
  );
}
