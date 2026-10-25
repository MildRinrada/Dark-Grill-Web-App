'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRef, useSyncExternalStore } from 'react';
import { LAYER_HEIGHT, LAYER_OVERLAP, LayerShape, LayerSvg } from '../burger/layer';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const LAYERS: { shape: LayerShape; color: string; th: string; en: string }[] = [
  { shape: 'bun-top', color: '#E3A04F', th: 'บริยอชปิ้งเนย', en: 'Butter-toasted brioche' },
  { shape: 'sauce', color: '#FF8A00', th: 'สไปซี่มาโย', en: 'Spicy mayo' },
  { shape: 'leaf', color: '#5DBB4C', th: 'ผักกาดแก้วกรอบ', en: 'Crisp lettuce' },
  { shape: 'ring', color: '#3E8E41', th: 'ฮาลาเปโนสด', en: 'Fresh jalapeño' },
  { shape: 'cheese', color: '#F7B32B', th: 'เชดดาร์ละลาย', en: 'Melted cheddar' },
  { shape: 'patty', color: '#6B3A22', th: 'เนื้อสแมช 120 กรัม', en: 'Smashed beef 120 g' },
  { shape: 'cheese', color: '#F7B32B', th: 'เชดดาร์ชั้นที่สอง', en: 'Second cheddar' },
  { shape: 'patty', color: '#6B3A22', th: 'เนื้อสแมชชั้นที่สอง', en: 'Second patty' },
  { shape: 'ring', color: '#B7679B', th: 'หอมแดงย่าง', en: 'Grilled red onion' },
  { shape: 'bun-bottom', color: '#E3A04F', th: 'ฐานบริยอช', en: 'Brioche heel' },
];

const SCALE = 1.1; // layer svg is 300 wide; rendered at 330 px max

/** y offset (top) of each layer when stacked, so overlaps read as one burger. */
function stackedTops() {
  const tops: number[] = [];
  let y = 0;
  for (const l of LAYERS) {
    tops.push(y);
    y += (LAYER_HEIGHT[l.shape] - LAYER_OVERLAP[l.shape]) * SCALE;
  }
  return { tops, height: y + 20 * SCALE };
}

/**
 * "Explode & stack": scroll pulls the signature burger apart layer by layer with
 * the ingredient names, then stacks it back. It shows height and layering, the two
 * visual cues the appetite research ties to wanting the food.
 */
export function ExplodeStack() {
  const root = useRef<HTMLElement>(null);
  const reduce = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
  const { tops, height } = stackedTops();
  const center = (LAYERS.length - 1) / 2;
  const spread = 40;

  useGSAP(
    () => {
      if (reduce) return;
      const layers = gsap.utils.toArray<HTMLElement>('[data-layer]');
      const labels = gsap.utils.toArray<HTMLElement>('[data-label]');
      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        scrollTrigger: { trigger: root.current, start: 'top top', end: '+=180%', scrub: 0.6, pin: '[data-pin]' },
      });
      tl.to(layers, { y: (i) => (i - center) * spread, duration: 1, stagger: 0.02 }, 0)
        .to(labels, { opacity: 1, x: 0, duration: 0.5, stagger: 0.04 }, 0.35)
        .to({}, { duration: 0.6 })
        .to(labels, { opacity: 0, x: 16, duration: 0.3 }, '>')
        .to(layers, { y: 0, duration: 0.9, stagger: { each: 0.03, from: 'end' }, ease: 'back.out(1.4)' }, '<0.1');
    },
    { scope: root, dependencies: [reduce] },
  );

  return (
    <section ref={root} className="relative" aria-labelledby="stack-title">
      <div
        data-pin
        className="flex min-h-[100svh] flex-col items-center justify-center gap-10 overflow-hidden px-4 py-20 lg:flex-row lg:gap-16 lg:pr-56"
      >
        <div className="max-w-md text-center lg:text-left">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-flame">Built tall</p>
          <h2 id="stack-title" className="mt-2 font-display-th text-4xl font-black leading-[1.05] sm:text-5xl">
            สิบชั้น ทุกชั้นทำสดตอนสั่ง
          </h2>
          <p className="mt-4 text-[17px] text-muted">
            เลื่อนลงเพื่อแยกชั้นไฟร์กริลล์ดูว่ามีอะไรอยู่ข้างใน ตั้งแต่บริยอชปิ้งเนยจนถึงเนื้อสแมชสองชั้นที่ย่างบนเตาเหล็กร้อนจัด
          </p>
        </div>

        <div className="relative" style={{ width: 300 * SCALE, maxWidth: '86vw', height: reduce ? undefined : height }}>
          {reduce ? (
            <ol className="flex flex-col gap-3" aria-label="ส่วนประกอบไฟร์กริลล์จากบนลงล่าง">
              {LAYERS.map((l, i) => (
                <li key={i} className="flex items-center gap-4">
                  <LayerSvg shape={l.shape} color={l.color} className="w-40 shrink-0" />
                  <span className="text-[15px] font-semibold">{l.th}</span>
                </li>
              ))}
            </ol>
          ) : (
            <ol aria-label="ส่วนประกอบไฟร์กริลล์จากบนลงล่าง">
              {LAYERS.map((l, i) => (
                <li
                  key={i}
                  data-layer
                  className="absolute inset-x-0 will-change-transform"
                  style={{ top: tops[i], zIndex: LAYERS.length - i }}
                >
                  <LayerSvg shape={l.shape} color={l.color} className="w-full drop-shadow-[0_6px_10px_rgb(0_0_0/0.35)]" />
                  <span
                    data-label
                    className="absolute left-full top-1/2 ml-6 hidden w-44 opacity-0 sm:block"
                    style={{ transform: 'translate(-16px, -50%)' }}
                  >
                    <span className="block text-[15px] font-bold leading-tight">{l.th}</span>
                    <span className="block text-xs uppercase tracking-wider text-muted">{l.en}</span>
                  </span>
                  <span className="sr-only">{l.th}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
