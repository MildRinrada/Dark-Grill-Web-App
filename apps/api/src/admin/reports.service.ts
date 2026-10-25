import { Injectable } from '@nestjs/common';
import { BUILDER_ITEM_ID } from '../catalog/catalog.service';
import { PrismaService } from '../common/prisma.service';
import { bangkok } from '../common/time';

const SOLD = `('PAID','ACCEPTED','PREPARING','READY','OUT_FOR_DELIVERY','COMPLETED')`;

export type MenuClass = 'STAR' | 'PLOWHORSE' | 'PUZZLE' | 'DOG';

export interface EngineeringInput {
  id: string;
  name: string;
  qty: number;
  revenueSatang: number;
  costSatang: number;
}

/**
 * Kasavana & Smith menu engineering. Popularity is "high" at 70% of an equal share
 * (0.7 / n of units sold); contribution margin is "high" at or above the
 * unit-weighted average margin of the menu.
 */
export function classifyMenu(rows: EngineeringInput[]) {
  const n = rows.length;
  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const totalCm = rows.reduce((a, r) => a + (r.revenueSatang - r.costSatang), 0);
  const popularityThreshold = n ? (totalQty / n) * 0.7 : 0;
  const cmThreshold = totalQty ? totalCm / totalQty : 0;
  const items = rows.map((r) => {
    const cm = r.qty ? (r.revenueSatang - r.costSatang) / r.qty : 0;
    const popular = r.qty >= popularityThreshold && r.qty > 0;
    const profitable = cm >= cmThreshold && r.qty > 0;
    const klass: MenuClass = popular ? (profitable ? 'STAR' : 'PLOWHORSE') : profitable ? 'PUZZLE' : 'DOG';
    return {
      ...r,
      unitMarginSatang: Math.round(cm),
      mixPercent: totalQty ? Math.round((r.qty / totalQty) * 1000) / 10 : 0,
      class: klass,
    };
  });
  return { popularityThreshold: Math.round(popularityThreshold * 10) / 10, cmThresholdSatang: Math.round(cmThreshold), items };
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async sales(branchId: string, days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const [daily, byChannel, topItems, hours, today] = await Promise.all([
      this.prisma.$queryRawUnsafe<{ day: string; orders: bigint; revenue: bigint }[]>(
        `SELECT to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM-DD') AS day,
                COUNT(*) AS orders, COALESCE(SUM("grandTotalSatang"),0) AS revenue
         FROM "Order" WHERE "branchId" = $1 AND status IN ${SOLD} AND "createdAt" >= $2
         GROUP BY day ORDER BY day`,
        branchId,
        since,
      ),
      this.prisma.$queryRawUnsafe<{ channel: string; orders: bigint; revenue: bigint }[]>(
        `SELECT channel::text, COUNT(*) AS orders, COALESCE(SUM("grandTotalSatang"),0) AS revenue
         FROM "Order" WHERE "branchId" = $1 AND status IN ${SOLD} AND "createdAt" >= $2
         GROUP BY channel ORDER BY revenue DESC`,
        branchId,
        since,
      ),
      this.prisma.$queryRawUnsafe<{ name: string; menuItemId: string; qty: bigint; revenue: bigint }[]>(
        `SELECT oi."menuItemId", MAX(oi.name) AS name, SUM(oi.qty) AS qty, SUM(oi."lineTotalSatang") AS revenue
         FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
         WHERE o."branchId" = $1 AND o.status IN ${SOLD} AND o."createdAt" >= $2
         GROUP BY oi."menuItemId" ORDER BY qty DESC LIMIT 8`,
        branchId,
        since,
      ),
      this.prisma.$queryRawUnsafe<{ hour: number; orders: bigint }[]>(
        `SELECT EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok'))::int AS hour, COUNT(*) AS orders
         FROM "Order" WHERE "branchId" = $1 AND status IN ${SOLD} AND "createdAt" >= $2
         GROUP BY hour ORDER BY hour`,
        branchId,
        since,
      ),
      this.prisma.$queryRawUnsafe<{ orders: bigint; revenue: bigint; pending: bigint }[]>(
        `SELECT COUNT(*) FILTER (WHERE status IN ${SOLD}) AS orders,
                COALESCE(SUM("grandTotalSatang") FILTER (WHERE status IN ${SOLD}),0) AS revenue,
                COUNT(*) FILTER (WHERE status IN ('PAID','ACCEPTED','PREPARING')) AS pending
         FROM "Order" WHERE "branchId" = $1
           AND ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok')::date = $2::date`,
        branchId,
        bangkok().dateKey,
      ),
    ]);

    const totalsOrders = daily.reduce((a, d) => a + Number(d.orders), 0);
    const totalsRevenue = daily.reduce((a, d) => a + Number(d.revenue), 0);
    const peak = Array.from({ length: 24 }, (_, h) => Number(hours.find((x) => x.hour === h)?.orders ?? 0));
    return {
      range: { days, since },
      totals: {
        orders: totalsOrders,
        revenueSatang: totalsRevenue,
        aovSatang: totalsOrders ? Math.round(totalsRevenue / totalsOrders) : 0,
      },
      today: {
        orders: Number(today[0]?.orders ?? 0),
        revenueSatang: Number(today[0]?.revenue ?? 0),
        inKitchen: Number(today[0]?.pending ?? 0),
      },
      daily: daily.map((d) => ({
        date: d.day,
        orders: Number(d.orders),
        revenueSatang: Number(d.revenue),
        aovSatang: Number(d.orders) ? Math.round(Number(d.revenue) / Number(d.orders)) : 0,
      })),
      byChannel: byChannel.map((c) => ({ channel: c.channel, orders: Number(c.orders), revenueSatang: Number(c.revenue) })),
      topItems: topItems.map((t) => ({ menuItemId: t.menuItemId, name: t.name, qty: Number(t.qty), revenueSatang: Number(t.revenue) })),
      peakHours: peak,
    };
  }

  async menuEngineering(branchId: string, days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const [items, sold] = await Promise.all([
      this.prisma.menuItem.findMany({
        where: { isArchived: false },
        select: { id: true, name: true, imageUrl: true, priceSatang: true, costSatang: true, category: { select: { name: true } } },
      }),
      this.prisma.$queryRawUnsafe<{ menuItemId: string; qty: bigint; revenue: bigint; cost: bigint }[]>(
        `SELECT oi."menuItemId", SUM(oi.qty) AS qty, SUM(oi."lineTotalSatang") AS revenue, SUM(oi."costSatang") AS cost
         FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
         WHERE o."branchId" = $1 AND o.status IN ${SOLD} AND o."createdAt" >= $2
         GROUP BY oi."menuItemId"`,
        branchId,
        since,
      ),
    ]);
    const byId = new Map(sold.map((s) => [s.menuItemId, s]));
    const result = classifyMenu(
      items
        .filter((i) => i.id !== BUILDER_ITEM_ID)
        .map((i) => {
          const s = byId.get(i.id);
          return {
            id: i.id,
            name: i.name,
            qty: Number(s?.qty ?? 0),
            revenueSatang: Number(s?.revenue ?? 0),
            costSatang: Number(s?.cost ?? 0),
          };
        }),
    );
    const meta = new Map(items.map((i) => [i.id, i]));
    return {
      days,
      ...result,
      items: result.items.map((r) => ({
        ...r,
        imageUrl: meta.get(r.id)?.imageUrl,
        category: meta.get(r.id)?.category.name,
        priceSatang: meta.get(r.id)?.priceSatang,
      })),
    };
  }

  /**
   * Baseline demand forecast: the average of the same weekday over the last four
   * weeks, by hour and by item, converted into ingredients through the recipes.
   */
  async forecast(branchId: string, dateKey: string) {
    const target = new Date(`${dateKey}T12:00:00+07:00`);
    const weekday = target.getUTCDay();
    const lookbacks = [1, 2, 3, 4].map((w) => {
      const d = new Date(target.getTime() - w * 7 * 86400_000);
      return bangkok(d).dateKey;
    });
    const [hourly, units] = await Promise.all([
      this.prisma.$queryRawUnsafe<{ hour: number; orders: bigint }[]>(
        `SELECT EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok'))::int AS hour, COUNT(*) AS orders
         FROM "Order" WHERE "branchId" = $1 AND status IN ${SOLD}
           AND to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM-DD') = ANY($2::text[])
         GROUP BY hour`,
        branchId,
        lookbacks,
      ),
      this.prisma.$queryRawUnsafe<{ menuItemId: string; name: string; qty: bigint }[]>(
        `SELECT oi."menuItemId", MAX(oi.name) AS name, SUM(oi.qty) AS qty
         FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
         WHERE o."branchId" = $1 AND o.status IN ${SOLD} AND oi."menuItemId" IS NOT NULL
           AND to_char((o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM-DD') = ANY($2::text[])
         GROUP BY oi."menuItemId"`,
        branchId,
        lookbacks,
      ),
    ]);
    const weeks = lookbacks.length;
    const byHour = Array.from({ length: 24 }, (_, h) => {
      const row = hourly.find((x) => x.hour === h);
      return Math.round((Number(row?.orders ?? 0) / weeks) * 10) / 10;
    });
    const items = units
      .map((u) => ({ menuItemId: u.menuItemId, name: u.name, expectedUnits: Math.ceil(Number(u.qty) / weeks) }))
      .sort((a, b) => b.expectedUnits - a.expectedUnits);

    const recipes = await this.prisma.recipeLine.findMany({
      where: { menuItemId: { in: items.map((i) => i.menuItemId) } },
      include: { ingredient: { include: { stock: { where: { branchId } } } } },
    });
    const prep = new Map<string, { id: string; name: string; unit: string; need: number; onHand: number }>();
    for (const item of items) {
      for (const r of recipes.filter((r) => r.menuItemId === item.menuItemId)) {
        const p = prep.get(r.ingredientId) ?? {
          id: r.ingredientId,
          name: r.ingredient.name,
          unit: r.ingredient.unit,
          need: 0,
          onHand: r.ingredient.stock[0]?.quantity ?? 0,
        };
        p.need += r.qty * item.expectedUnits;
        prep.set(r.ingredientId, p);
      }
    }
    return {
      date: dateKey,
      weekday,
      basedOn: lookbacks,
      method: 'Average of the same weekday over the previous 4 weeks',
      expectedOrders: Math.round(byHour.reduce((a, b) => a + b, 0)),
      byHour,
      items,
      ingredients: [...prep.values()]
        .map((p) => ({ ...p, need: Math.ceil(p.need), shortfall: Math.max(0, Math.ceil(p.need - p.onHand)) }))
        .sort((a, b) => b.shortfall - a.shortfall || b.need - a.need),
    };
  }
}
