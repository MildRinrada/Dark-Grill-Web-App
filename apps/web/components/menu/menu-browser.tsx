'use client';

import clsx from 'clsx';
import { Beef, CupSoda, Drumstick, Flame, Leaf, Package, RotateCcw, Search, SearchX, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSocketMenu } from './use-socket-menu';
import type { MenuCard as Card, MenuPayload } from '@/lib/types';
import { Chip } from '../ui';
import { AddSheet } from './add-sheet';
import { MenuCard } from './menu-card';

const ICONS: Record<string, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  flame: Flame,
  beef: Beef,
  package: Package,
  drumstick: Drumstick,
  'cup-soda': CupSoda,
};

export function MenuBrowser({ initial, branchId }: { initial: MenuPayload; branchId: string }) {
  const menu = useSocketMenu(initial, branchId);
  const [query, setQuery] = useState('');
  const [spicy, setSpicy] = useState(false);
  const [veg, setVeg] = useState(false);
  const [active, setActive] = useState(initial.categories[0]?.id ?? '');
  const [adding, setAdding] = useState<{ item: Card; el: HTMLElement | null } | null>(null);
  const sections = useRef<Record<string, HTMLElement | null>>({});
  const filtering = query.trim() !== '' || spicy || veg;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.categories
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) =>
            (!q || `${i.name} ${i.nameEn} ${i.description}`.toLowerCase().includes(q)) &&
            (!spicy || i.spicyLevel > 0) &&
            (!veg || i.isVegetarian),
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [menu, query, spicy, veg]);

  // highlight the category whose section is in view
  useEffect(() => {
    if (filtering) return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id.replace('cat-', ''));
      },
      { rootMargin: '-140px 0px -55% 0px' },
    );
    Object.values(sections.current).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [filtering, filtered]);

  const jump = (id: string) => {
    setActive(id);
    sections.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <div className="sticky top-16 z-30 -mx-4 border-b border-line bg-bg/95 px-4 pb-3 pt-3 backdrop-blur-md">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาเบอร์เกอร์ ฟรายส์ เชค"
            aria-label="ค้นหาเมนู"
            className="h-12 w-full rounded-chip border border-line bg-surface pl-12 pr-12 text-base shadow-card placeholder:text-muted hover:border-text/30 focus:border-text focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="press absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full hover:bg-surface-2"
              aria-label="ล้างคำค้นหา"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>

        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4" role="group" aria-label="หมวดเมนูและตัวกรอง">
          {menu.categories.map((c) => {
            const Icon = ICONS[c.icon] ?? Package;
            const selected = !filtering && active === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-current={selected ? 'true' : undefined}
                onClick={() => {
                  setQuery('');
                  setSpicy(false);
                  setVeg(false);
                  requestAnimationFrame(() => jump(c.id));
                }}
                className={clsx(
                  'press flex min-w-[76px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border px-3 py-2.5 text-[13px] font-semibold',
                  selected ? 'border-ink bg-ink text-bun' : 'border-line bg-surface text-text hover:border-text/40',
                )}
              >
                <Icon aria-hidden className={clsx('size-5', selected ? 'text-flame' : 'text-accent-text')} />
                {c.name}
              </button>
            );
          })}
          <span className="mx-1 w-px shrink-0 self-stretch bg-line" aria-hidden />
          <Chip selected={spicy} onClick={() => setSpicy((v) => !v)} className="shrink-0 self-center">
            <Flame aria-hidden className="size-4" />
            เผ็ด
          </Chip>
          <Chip selected={veg} onClick={() => setVeg((v) => !v)} className="shrink-0 self-center">
            <Leaf aria-hidden className="size-4" />
            มังสวิรัติ
          </Chip>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <SearchX aria-hidden className="size-10 text-muted" />
          <p className="text-lg font-semibold">ไม่พบเมนูที่ตรงกับ &ldquo;{query || 'ตัวกรองนี้'}&rdquo;</p>
          <p className="text-muted">ลองคำอื่น หรือล้างตัวกรองเพื่อดูเมนูทั้งหมด</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSpicy(false);
              setVeg(false);
            }}
            className="press mt-2 inline-flex items-center gap-2 rounded-chip border border-line bg-surface px-5 py-2.5 font-semibold hover:border-text/40"
          >
            <RotateCcw aria-hidden className="size-4" />
            ล้างตัวกรอง
          </button>
        </div>
      ) : (
        filtered.map((c, ci) => (
          <section
            key={c.id}
            id={`cat-${c.id}`}
            ref={(el) => void (sections.current[c.id] = el)}
            aria-labelledby={`h-${c.id}`}
            className="scroll-mt-48 pt-8"
          >
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h2 id={`h-${c.id}`} className="font-display-th text-2xl font-extrabold sm:text-3xl">
                {c.name}
                <span className="ml-3 font-display text-base font-normal uppercase tracking-wider text-muted">{c.nameEn}</span>
              </h2>
              <span className="text-sm text-muted">{c.items.length} รายการ</span>
            </div>
            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
              {c.items.map((item, i) => (
                <MenuCard
                  key={item.id}
                  item={item}
                  featured={!filtering && ci === 0 && i === 0}
                  priority={ci === 0 && i < 3}
                  onQuickAdd={(it, el) => setAdding({ item: it, el })}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <AddSheet item={adding?.item ?? null} sourceEl={adding?.el ?? null} branchId={branchId} onClose={() => setAdding(null)} />
    </>
  );
}
