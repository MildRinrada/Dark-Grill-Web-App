import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, StockReason } from '@prisma/client';
import { CatalogService } from '../catalog/catalog.service';
import { PrismaService } from '../common/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

type OrderForStock = Prisma.OrderGetPayload<{ include: { items: true } }>;

/**
 * Recipe-based stock (BOM). Selling an item draws down its ingredients, and any
 * menu item the branch can no longer make is switched off automatically. Items the
 * stock engine switched off come back on their own once stock is received again;
 * items a person switched off stay off.
 */
@Injectable()
export class StockService {
  private readonly logger = new Logger('Stock');

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Ingredient quantities an order consumes: recipe x qty, option adjustments, and builder layers. */
  async requirements(order: OrderForStock, db: Prisma.TransactionClient = this.prisma) {
    const need = new Map<string, number>();
    const add = (id: string, qty: number) => need.set(id, (need.get(id) ?? 0) + qty);
    const itemIds = order.items.map((i) => i.menuItemId).filter((x): x is string => !!x);
    const optionIds = order.items.flatMap((i) => i.optionIds);
    const [recipes, options] = await Promise.all([
      db.recipeLine.findMany({ where: { menuItemId: { in: itemIds } } }),
      db.option.findMany({ where: { id: { in: optionIds }, ingredientId: { not: null } } }),
    ]);
    for (const item of order.items) {
      for (const r of recipes.filter((r) => r.menuItemId === item.menuItemId)) add(r.ingredientId, r.qty * item.qty);
      for (const o of options.filter((o) => item.optionIds.includes(o.id))) add(o.ingredientId!, o.ingredientQty * item.qty);
      for (const layer of item.layers) add(layer, item.qty);
    }
    return need;
  }

  async apply(
    db: Prisma.TransactionClient,
    branchId: string,
    deltas: Map<string, number>,
    reason: StockReason,
    meta: { orderId?: string; actorId?: string; note?: string } = {},
  ) {
    for (const [ingredientId, delta] of deltas) {
      if (delta === 0) continue;
      await db.branchIngredient.upsert({
        where: { branchId_ingredientId: { branchId, ingredientId } },
        create: { branchId, ingredientId, quantity: Math.max(0, delta), reorderPoint: 0 },
        update: { quantity: { increment: delta } },
      });
      await db.stockMovement.create({
        data: { branchId, ingredientId, delta, reason, orderId: meta.orderId, actorId: meta.actorId, note: meta.note },
      });
    }
  }

  async deductForOrder(db: Prisma.TransactionClient, order: OrderForStock) {
    const need = await this.requirements(order, db);
    const deltas = new Map([...need].map(([id, qty]) => [id, -qty]));
    await this.apply(db, order.branchId, deltas, 'SALE', { orderId: order.id });
    await db.order.update({ where: { id: order.id }, data: { stockDeducted: true } });
    return [...need.keys()];
  }

  async restockForOrder(db: Prisma.TransactionClient, order: OrderForStock) {
    const need = await this.requirements(order, db);
    await this.apply(db, order.branchId, need, 'REFUND', { orderId: order.id, note: 'Order cancelled before cooking' });
    await db.order.update({ where: { id: order.id }, data: { stockDeducted: false } });
    return [...need.keys()];
  }

  /** Re-checks every menu item that uses the touched ingredients and flips availability where needed. */
  async reconcileAvailability(branchId: string, ingredientIds: string[]) {
    if (!ingredientIds.length) return;
    const items = await this.prisma.menuItem.findMany({
      where: { recipe: { some: { ingredientId: { in: ingredientIds } } } },
      include: { recipe: true, availability: { where: { branchId } } },
    });
    const stock = await this.prisma.branchIngredient.findMany({ where: { branchId } });
    const qty = new Map(stock.map((s) => [s.ingredientId, s.quantity]));

    const changed: { menuItemId: string; isAvailable: boolean }[] = [];
    for (const item of items) {
      const canMake = item.recipe.every((r) => (qty.get(r.ingredientId) ?? 0) >= r.qty);
      const row = item.availability[0];
      const isAvailable = row?.isAvailable ?? true;
      if (!canMake && isAvailable) {
        await this.prisma.menuAvailability.upsert({
          where: { branchId_menuItemId: { branchId, menuItemId: item.id } },
          create: { branchId, menuItemId: item.id, isAvailable: false, autoDisabled: true },
          update: { isAvailable: false, autoDisabled: true },
        });
        changed.push({ menuItemId: item.id, isAvailable: false });
      } else if (canMake && !isAvailable && row?.autoDisabled) {
        await this.prisma.menuAvailability.update({
          where: { branchId_menuItemId: { branchId, menuItemId: item.id } },
          data: { isAvailable: true, autoDisabled: false },
        });
        changed.push({ menuItemId: item.id, isAvailable: true });
      }
    }

    const low = stock.filter((s) => ingredientIds.includes(s.ingredientId) && s.quantity <= s.reorderPoint);
    if (low.length) this.realtime.emit('admin', 'stock.low', { branchId, ingredientIds: low.map((l) => l.ingredientId) });

    if (changed.length) {
      this.logger.log(`Availability changed at ${branchId}: ${JSON.stringify(changed)}`);
      await this.catalog.invalidateMenu();
      this.realtime.emit(`branch:${branchId}`, 'menu.availability_changed', { branchId, changes: changed });
    }
  }
}
