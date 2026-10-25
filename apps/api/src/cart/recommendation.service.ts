import { Injectable } from '@nestjs/common';
import { BUILDER_ITEM_ID, CatalogService, MenuCard } from '../catalog/catalog.service';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import type { CartWithItems } from './cart.service';

interface Suggestion extends MenuCard {
  reasonCode: 'COMPLETE_MEAL_SIDE' | 'COMPLETE_MEAL_DRINK' | 'OFTEN_TOGETHER';
  reason: string;
  /** how many past orders contained both this item and something in the cart */
  pairedOrders: number;
}

/**
 * Within-basket recommendation (rule-based, Phase 2). It looks at the whole basket,
 * finds the meal part that is missing, and ranks candidates by how often they were
 * bought together with what is already in the basket. Returns at most one item: the
 * design doc limits upsell to one prompt per step, and it never adds anything itself.
 */
@Injectable()
export class RecommendationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly redis: RedisService,
  ) {}

  async forCart(cart: CartWithItems): Promise<{ suggestion: Suggestion | null }> {
    if (cart.items.length === 0) return { suggestion: null };
    const menu = await this.catalog.menu(cart.branchId);
    const kindOf = new Map<string, string>();
    for (const c of menu.categories) for (const i of c.items) kindOf.set(i.id, c.kind);
    kindOf.set(BUILDER_ITEM_ID, 'BURGER');

    const inCart = new Set(cart.items.map((l) => l.menuItemId).filter((x): x is string => !!x));
    const kinds = new Set([...inCart].map((id) => kindOf.get(id)));
    const hasMain = kinds.has('BURGER') || kinds.has('COMBO');

    let targetKind: string | null = null;
    let reasonCode: Suggestion['reasonCode'] = 'OFTEN_TOGETHER';
    if (hasMain && !kinds.has('SIDE') && !kinds.has('COMBO')) {
      targetKind = 'SIDE';
      reasonCode = 'COMPLETE_MEAL_SIDE';
    } else if (!kinds.has('DRINK') && !kinds.has('COMBO')) {
      targetKind = 'DRINK';
      reasonCode = 'COMPLETE_MEAL_DRINK';
    } else if (kinds.has('COMBO') && !kinds.has('SIDE')) {
      targetKind = 'SIDE';
    }
    if (!targetKind) return { suggestion: null };

    const candidates = menu.categories
      .filter((c) => c.kind === targetKind)
      .flatMap((c) => c.items)
      .filter((i) => i.isAvailable && !inCart.has(i.id));
    if (!candidates.length) return { suggestion: null };

    const pairs = await this.coOccurrence([...inCart]);
    const best = candidates
      .map((c) => ({ c, score: pairs[c.id] ?? 0 }))
      .sort((a, b) => b.score - a.score || a.c.priceSatang - b.c.priceSatang)[0];

    const reason =
      reasonCode === 'COMPLETE_MEAL_SIDE'
        ? 'เติมของทานเล่นให้ครบมื้อ'
        : reasonCode === 'COMPLETE_MEAL_DRINK'
          ? 'เพิ่มเครื่องดื่มเย็นๆ คู่กับเบอร์เกอร์'
          : 'ลูกค้าที่สั่งแบบเดียวกันมักเพิ่มรายการนี้';
    return { suggestion: { ...best.c, reasonCode, reason, pairedOrders: best.score } };
  }

  private async coOccurrence(itemIds: string[]): Promise<Record<string, number>> {
    const key = `cooc:${[...itemIds].sort().join(',')}`;
    const cached = await this.redis.getJson<Record<string, number>>(key);
    if (cached) return cached;
    const rows = await this.prisma.$queryRaw<{ menuItemId: string; orders: bigint }[]>`
      SELECT b."menuItemId", COUNT(DISTINCT b."orderId") AS orders
      FROM "OrderItem" a
      JOIN "OrderItem" b ON a."orderId" = b."orderId" AND b."menuItemId" <> a."menuItemId"
      JOIN "Order" o ON o.id = a."orderId"
      WHERE a."menuItemId" = ANY(${itemIds}::text[])
        AND o.status = 'COMPLETED' AND o."createdAt" > now() - interval '60 days'
        AND b."menuItemId" IS NOT NULL
      GROUP BY b."menuItemId"`;
    const result = Object.fromEntries(rows.map((r) => [r.menuItemId, Number(r.orders)]));
    await this.redis.setJson(key, result, 900);
    return result;
  }
}
