import { Injectable } from '@nestjs/common';
import type { Cart, CartItem, Channel, FulfillmentType } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { BUILDER_ITEM_ID } from '../catalog/catalog.service';
import { AppRequest } from '../common/auth';
import { AppError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { haversineKm } from '../common/time';
import { EtaService } from '../orders/eta.service';
import { PricedIngredient, PricedMenuItem, priceCart, Quote } from './pricing';

export const CART_COOKIE = 'cart_sid';
export const DEFAULT_BRANCH = 'br_siam';

export type CartWithItems = Cart & { items: CartItem[] };

export interface FulfillmentInput {
  type: FulfillmentType;
  addressId?: string;
  lat?: number;
  lng?: number;
  scheduledAt?: string | null;
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eta: EtaService,
  ) {}

  /** Signed-in users own one cart; guests (kiosk, QR table, first visit) are keyed by an httpOnly cookie. */
  async resolve(req: AppRequest, res: Response | null, opts: { create: boolean } = { create: true }): Promise<CartWithItems | null> {
    const include = { items: { orderBy: { createdAt: 'asc' as const } } };
    if (req.user) {
      const cart = await this.prisma.cart.findFirst({ where: { userId: req.user.id }, orderBy: { updatedAt: 'desc' }, include });
      if (cart || !opts.create) return cart;
      return this.prisma.cart.create({ data: { userId: req.user.id, branchId: DEFAULT_BRANCH }, include });
    }
    const sid = req.cookies?.[CART_COOKIE] as string | undefined;
    if (sid) {
      const cart = await this.prisma.cart.findUnique({ where: { sessionKey: sid }, include });
      if (cart) return cart;
    }
    if (!opts.create || !res) return null;
    const sessionKey = randomBytes(24).toString('base64url');
    res.cookie(CART_COOKIE, sessionKey, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 * 86400_000 });
    req.cookies = { ...(req.cookies ?? {}), [CART_COOKIE]: sessionKey };
    return this.prisma.cart.create({ data: { sessionKey, branchId: DEFAULT_BRANCH }, include });
  }

  async adoptGuestCart(sessionKey: string | undefined, userId: string) {
    if (!sessionKey) return;
    const guest = await this.prisma.cart.findUnique({ where: { sessionKey }, include: { items: true } });
    if (!guest || guest.items.length === 0) return;
    await this.prisma.$transaction([
      this.prisma.cart.deleteMany({ where: { userId } }),
      this.prisma.cart.update({ where: { id: guest.id }, data: { userId, sessionKey: null } }),
    ]);
  }

  async setContext(cart: Cart, ctx: { branchId?: string; channel?: Channel; tableNo?: string | null }) {
    if (ctx.branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: ctx.branchId } });
      if (!branch?.isActive) throw notFound('Branch');
    }
    return this.prisma.cart.update({
      where: { id: cart.id },
      data: {
        branchId: ctx.branchId ?? undefined,
        channel: ctx.channel ?? undefined,
        tableNo: ctx.tableNo === undefined ? undefined : ctx.tableNo,
      },
    });
  }

  async addItem(cart: CartWithItems, input: { menuItemId: string; qty: number; optionIds: string[]; layers: string[]; note?: string }) {
    const item = await this.prisma.menuItem.findUnique({ where: { id: input.menuItemId } });
    if (!item || item.isArchived) throw notFound('Menu item');
    if (input.menuItemId !== BUILDER_ITEM_ID && input.layers.length) {
      throw new AppError('BUILD_INVALID', 'Layers are only allowed on build-your-burger');
    }
    const optionKey = [...input.optionIds].sort().join(',');
    // Same item with the same choices stacks into one line instead of a duplicate row.
    const same = cart.items.find(
      (l) =>
        l.menuItemId === input.menuItemId &&
        [...l.optionIds].sort().join(',') === optionKey &&
        l.layers.join(',') === input.layers.join(',') &&
        (l.note ?? '') === (input.note ?? ''),
    );
    if (same) {
      await this.prisma.cartItem.update({ where: { id: same.id }, data: { qty: Math.min(20, same.qty + input.qty) } });
    } else {
      if (cart.items.length >= 30) throw new AppError('CART_FULL', 'A cart holds up to 30 lines');
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          menuItemId: input.menuItemId,
          qty: input.qty,
          optionIds: input.optionIds,
          layers: input.layers,
          note: input.note,
        },
      });
    }
    await this.touch(cart.id);
  }

  async updateItem(cart: CartWithItems, lineId: string, patch: { qty?: number; optionIds?: string[]; note?: string | null }) {
    const line = cart.items.find((l) => l.id === lineId);
    if (!line) throw notFound('Cart line');
    if (patch.qty === 0) {
      await this.prisma.cartItem.delete({ where: { id: lineId } });
    } else {
      await this.prisma.cartItem.update({
        where: { id: lineId },
        data: { qty: patch.qty, optionIds: patch.optionIds, note: patch.note },
      });
    }
    await this.touch(cart.id);
  }

  async removeItem(cart: CartWithItems, lineId: string) {
    if (!cart.items.some((l) => l.id === lineId)) throw notFound('Cart line');
    await this.prisma.cartItem.delete({ where: { id: lineId } });
    await this.touch(cart.id);
  }

  async clear(cart: Cart) {
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await this.prisma.cart.update({ where: { id: cart.id }, data: { promoCode: null } });
  }

  async setPromo(cart: Cart, code: string | null) {
    await this.prisma.cart.update({ where: { id: cart.id }, data: { promoCode: code ? code.trim().toUpperCase() : null } });
  }

  private touch(cartId: string) {
    return this.prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  }

  /** Loads everything the pure pricing engine needs, then prices the cart. */
  async quote(cart: CartWithItems, userId: string | null, fulfillment?: FulfillmentInput) {
    const branch = await this.prisma.branch.findUniqueOrThrow({ where: { id: cart.branchId } });
    const itemIds = [...new Set(cart.items.map((l) => l.menuItemId).filter((x): x is string => !!x))];
    const [items, campaigns, promo] = await Promise.all([
      this.prisma.menuItem.findMany({
        where: { id: { in: itemIds } },
        include: {
          category: true,
          optionGroups: { include: { options: true } },
          availability: { where: { branchId: branch.id } },
        },
      }),
      this.prisma.campaign.findMany({ where: { isActive: true } }),
      cart.promoCode ? this.prisma.promotion.findUnique({ where: { code: cart.promoCode } }) : null,
    ]);
    const ingredientIds = new Set<string>(cart.items.flatMap((l) => l.layers));
    for (const i of items) for (const g of i.optionGroups) for (const o of g.options) if (o.ingredientId) ingredientIds.add(o.ingredientId);
    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: [...ingredientIds] } },
      include: { stock: { where: { branchId: branch.id } } },
    });

    let distanceKm: number | undefined;
    let address: { label: string; line1: string; lat: number; lng: number; note: string | null } | null = null;
    if (fulfillment?.type === 'DELIVERY') {
      if (fulfillment.addressId) {
        if (!userId) throw new AppError('UNAUTHENTICATED', 'Sign in to use saved addresses', 401);
        const a = await this.prisma.address.findFirst({ where: { id: fulfillment.addressId, userId } });
        if (!a) throw notFound('Address');
        address = { label: a.label, line1: a.line1, lat: a.lat, lng: a.lng, note: a.note };
      } else if (fulfillment.lat !== undefined && fulfillment.lng !== undefined) {
        address = { label: 'Pinned location', line1: 'Pinned location', lat: fulfillment.lat, lng: fulfillment.lng, note: null };
      }
      if (address) distanceKm = haversineKm(branch, address);
    }

    const quote: Quote = priceCart({
      branch,
      lines: cart.items,
      items: new Map(items.map((i) => [i.id, { ...i, isAvailable: i.availability[0]?.isAvailable ?? true } as PricedMenuItem])),
      ingredients: new Map(ingredients.map((i) => [i.id, { ...i, inStock: (i.stock[0]?.quantity ?? 0) >= 1 } as PricedIngredient])),
      builderItemId: BUILDER_ITEM_ID,
      campaigns,
      promo,
      promoCode: cart.promoCode,
      userId,
      fulfillment: fulfillment ? { type: fulfillment.type, distanceKm } : null,
      now: new Date(),
    });

    const maxPrep = Math.max(0, ...items.filter((i) => cart.items.some((l) => l.menuItemId === i.id)).map((i) => i.prepMinutes));
    const eta = cart.items.length
      ? await this.eta.estimate({
          branchId: branch.id,
          kitchenStaff: branch.kitchenStaff,
          maxPrepMinutes: maxPrep,
          fulfillment: fulfillment?.type ?? 'PICKUP',
          distanceKm,
          scheduledAt: fulfillment?.scheduledAt ? new Date(fulfillment.scheduledAt) : null,
        })
      : null;

    return { quote, eta, address, distanceKm, branch, maxPrep };
  }

  async view(cart: CartWithItems, userId: string | null, fulfillment?: FulfillmentInput) {
    const { quote, eta, distanceKm } = await this.quote(cart, userId, fulfillment);
    return {
      id: cart.id,
      branchId: cart.branchId,
      channel: cart.channel,
      tableNo: cart.tableNo,
      promoCode: cart.promoCode,
      itemCount: cart.items.reduce((n, l) => n + l.qty, 0),
      ...quote,
      distanceKm: distanceKm === undefined ? null : Math.round(distanceKm * 10) / 10,
      eta,
    };
  }
}
