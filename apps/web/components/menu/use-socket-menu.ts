'use client';

import { useEffect, useState } from 'react';
import { useRoom } from '@/lib/socket';
import type { MenuPayload } from '@/lib/types';

/** Server-rendered menu that patches sold-out flags live from the branch room. */
export function useSocketMenu(initial: MenuPayload, branchId: string) {
  const [menu, setMenu] = useState(initial);
  useEffect(() => setMenu(initial), [initial]);

  useRoom(`branch:${branchId}`, {
    'menu.availability_changed': (payload: { changes: { menuItemId: string; isAvailable: boolean }[] }) => {
      const changes = new Map(payload.changes.map((c) => [c.menuItemId, c.isAvailable]));
      setMenu((m) => ({
        ...m,
        categories: m.categories.map((c) => ({
          ...c,
          items: c.items.map((i) => (changes.has(i.id) ? { ...i, isAvailable: changes.get(i.id)! } : i)),
        })),
      }));
    },
  });

  return menu;
}
