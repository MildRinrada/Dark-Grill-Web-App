import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { PaymentMethod, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { randomBytes } from 'crypto';
import { CartService, CartWithItems, FulfillmentInput } from '../cart/cart.service';
import { AuthUser, STAFF_ROLES } from '../common/auth';
import { env } from '../common/env';
import { AppError, conflict, forbidden, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { bangkok, isWithinHours } from '../common/time';
import { PaymentsService } from '../payments/payments.service';
import { ORDERS_QUEUE, OrderLifecycleService } from './lifecycle.service';

const orderInclude = {
  items: true,
  payments: { orderBy: { createdAt: 'desc' } },
  events: { orderBy: { at: 'asc' } },
  branch: { select: { id: true, name: true, address: true, lat: true, lng: true } },
  review: true,
} satisfies Prisma.OrderInclude;

export type OrderView = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly payments: PaymentsService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly redis: RedisService,
    @InjectQueue(ORDERS_QUEUE) private readonly ordersQueue: Queue,
  ) {}

  private async nextNumber(branchId: string) {
    const day = bangkok().dateKey;
    const key = `ordno:${branchId}:${day}`;
    const n = await this.redis.client.incr(key);
    if (n === 1) await this.redis.client.expire(key, 2 * 86400);
    return `${day.slice(5).replace('-', '')}${String(n).padStart(3, '0')}`;
  }

  async create(
    cart: CartWithItems,
    user: AuthUser | null,
    input: { fulfillment: FulfillmentInput; paymentMethod: PaymentMethod; note?: string },
  ) {
    if (!cart.items.length) throw new AppError('CART_EMPTY', 'Your cart is empty');
    if (input.fulfillment.type === 'DINE_IN' && !cart.tableNo && cart.channel !== 'KIOSK') {
      throw new AppError('TABLE_REQUIRED', 'Scan the QR on your table to order for dine-in');
    }
    if (input.fulfillment.type === 'DELIVERY' && !user) {
      throw new AppError('UNAUTHENTICATED', 'Sign in to order delivery', 401);
    }
    if (input.paymentMethod === 'CASH' && input.fulfillment.type === 'DELIVERY') {
      throw new AppError('PAYMENT_METHOD_INVALID', 'Delivery orders are paid online');
    }

    const { quote, eta, address, branch } = await this.carts.quote(cart, user?.id ?? null, input.fulfillment);
    if (quote.issues.length) throw new AppError('CART_INVALID', quote.issues[0].message, 422, quote.issues);
    if (quote.promo && !quote.promo.valid) throw new AppError('PROMO_INVALID', quote.promo.message, 422);
    const scheduledAt = input.fulfillment.scheduledAt ? new Date(input.fulfillment.scheduledAt) : null;
    if (env.enforceOpeningHours && !isWithinHours(branch.opensAt, branch.closesAt, scheduledAt ?? new Date())) {
      throw new AppError('BRANCH_CLOSED', `${branch.name} is open ${branch.opensAt}-${branch.closesAt}`, 422);
    }

    const number = await this.nextNumber(branch.id);
    const order = await this.prisma.$transaction(async (tx) => {
      if (quote.promo?.valid) {
        // Conditional increment so the last use of a limited code cannot be taken twice.
        const promo = await tx.promotion.findUniqueOrThrow({ where: { code: quote.promo.code } });
        const claimed = await tx.promotion.updateMany({
          where: { id: promo.id, ...(promo.usageLimit !== null ? { usedCount: { lt: promo.usageLimit } } : {}) },
          data: { usedCount: { increment: 1 } },
        });
        if (claimed.count === 0) throw conflict('PROMO_INVALID', 'This code has just been fully used');
      }
      const created = await tx.order.create({
        data: {
          number,
          publicToken: randomBytes(16).toString('base64url'),
          userId: user?.id,
          branchId: branch.id,
          channel: cart.channel,
          status: 'PENDING_PAYMENT',
          fulfillmentType: input.fulfillment.type,
          tableNo: cart.tableNo,
          address: address ?? undefined,
          scheduledAt,
          note: input.note,
          promoCode: quote.promo?.valid ? quote.promo.code : null,
          subtotalSatang: quote.subtotalSatang,
          discountSatang: quote.discountSatang,
          deliverySatang: quote.deliverySatang,
          grandTotalSatang: quote.grandTotalSatang,
          costSatang: quote.costSatang,
          etaReadyAt: eta ? new Date(eta.readyAt) : null,
          etaDeliveredAt: eta?.deliveredAt ? new Date(eta.deliveredAt) : null,
          items: {
            create: quote.lines.map((l) => ({
              menuItemId: l.menuItemId,
              name: l.name,
              imageUrl: l.imageUrl,
              qty: l.qty,
              unitPriceSatang: l.unitPriceSatang,
              lineTotalSatang: l.lineTotalSatang,
              costSatang: l.costSatang,
              optionIds: l.optionIds,
              optionNames: l.optionNames,
              layers: l.layers.map((x) => x.id),
              note: l.note,
            })),
          },
          events: { create: { status: 'PENDING_PAYMENT', actorId: user?.id } },
        },
      });
      await this.payments.create(created, input.paymentMethod, tx);
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({ where: { id: cart.id }, data: { promoCode: null } });
      return created;
    });

    // Online payments must land within 15 minutes; counter cash orders get 30.
    const windowMs = (input.paymentMethod === 'CASH' ? 30 : 15) * 60_000;
    await this.ordersQueue.add(
      'expire-payment',
      { orderId: order.id },
      { delay: windowMs, jobId: `expire-${order.id}`, removeOnComplete: true },
    );

    return this.view(await this.load(order.id));
  }

  private async load(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw notFound('Order');
    return order;
  }

  /** Owners, staff, and guests holding the order's public token may read it. */
  async getFor(id: string, user: AuthUser | null, token?: string) {
    const order = await this.load(id);
    const isStaff = !!user && STAFF_ROLES.includes(user.role);
    const isOwner = !!user && order.userId === user.id;
    if (!isStaff && !isOwner && (!token || token !== order.publicToken)) throw notFound('Order');
    return this.view(order);
  }

  async list(userId: string, cursor: string | undefined, limit: number) {
    const rows = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: orderInclude,
    });
    const page = rows.slice(0, limit);
    return { data: page.map((o) => this.view(o)), nextCursor: rows.length > limit ? page[page.length - 1].id : null };
  }

  async cancel(id: string, user: AuthUser | null, token?: string) {
    const order = await this.load(id);
    const isOwner = (!!user && order.userId === user.id) || (!!token && token === order.publicToken);
    if (!isOwner) throw notFound('Order');
    if (order.status !== 'PENDING_PAYMENT' && order.status !== 'PAID') {
      throw conflict('TOO_LATE_TO_CANCEL', 'The kitchen has already started this order');
    }
    await this.lifecycle.transition(id, 'CANCELLED', user, 'Cancelled by customer');
    return this.view(await this.load(id));
  }

  async reorder(id: string, user: AuthUser, cart: CartWithItems) {
    const order = await this.load(id);
    if (order.userId !== user.id) throw notFound('Order');
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await this.prisma.cart.update({ where: { id: cart.id }, data: { branchId: order.branchId, promoCode: null } });
    const live = await this.prisma.menuItem.findMany({
      where: { id: { in: order.items.map((i) => i.menuItemId).filter((x): x is string => !!x) }, isArchived: false },
      select: { id: true },
    });
    const liveIds = new Set(live.map((l) => l.id));
    const skipped: string[] = [];
    for (const item of order.items) {
      if (!item.menuItemId || !liveIds.has(item.menuItemId)) {
        skipped.push(item.name);
        continue;
      }
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          menuItemId: item.menuItemId,
          qty: item.qty,
          optionIds: item.optionIds,
          layers: item.layers,
          note: item.note,
        },
      });
    }
    return { cartId: cart.id, skipped };
  }

  async review(id: string, user: AuthUser, input: { rating: number; comment?: string; photoUrl?: string }) {
    const order = await this.load(id);
    if (order.userId !== user.id) throw notFound('Order');
    if (order.status !== 'COMPLETED') throw conflict('NOT_COMPLETED', 'Review after you receive your order');
    if (order.review) throw conflict('ALREADY_REVIEWED', 'You already reviewed this order');
    return this.prisma.review.create({ data: { orderId: id, userId: user.id, ...input } });
  }

  async lastOrder(userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { userId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      include: orderInclude,
    });
    return { order: order ? this.view(order) : null };
  }

  view(o: OrderView) {
    const payment = o.payments[0] ?? null;
    return {
      id: o.id,
      number: o.number,
      publicToken: o.publicToken,
      status: o.status,
      channel: o.channel,
      fulfillment: { type: o.fulfillmentType, tableNo: o.tableNo, address: o.address, scheduledAt: o.scheduledAt },
      branch: o.branch,
      note: o.note,
      items: o.items.map((i) => ({
        id: i.id,
        menuItemId: i.menuItemId,
        name: i.name,
        imageUrl: i.imageUrl,
        qty: i.qty,
        options: i.optionNames,
        layers: i.layers,
        unitPriceSatang: i.unitPriceSatang,
        lineTotalSatang: i.lineTotalSatang,
      })),
      totals: {
        subtotalSatang: o.subtotalSatang,
        discountSatang: o.discountSatang,
        deliverySatang: o.deliverySatang,
        grandTotalSatang: o.grandTotalSatang,
      },
      promoCode: o.promoCode,
      crownsEarned: o.crownsEarned,
      eta: { readyAt: o.etaReadyAt, deliveredAt: o.etaDeliveredAt },
      payment: payment && {
        id: payment.id,
        method: payment.method,
        status: payment.status,
        amountSatang: payment.amountSatang,
        qrPayload: payment.status === 'PENDING' ? payment.qrPayload : null,
        redirectUrl: payment.status === 'PENDING' ? payment.redirectUrl : null,
        expiresAt: payment.expiresAt,
      },
      events: o.events.map((e) => ({ status: e.status, at: e.at, note: e.note })),
      review: o.review && { rating: o.review.rating, comment: o.review.comment, reply: o.review.reply },
      canCancel: o.status === 'PENDING_PAYMENT' || o.status === 'PAID',
      createdAt: o.createdAt,
    };
  }

  /** New payment attempt for an order still waiting for money (e.g. switch QR to card). */
  async retryPayment(orderId: string, method: PaymentMethod, user: AuthUser | null, token?: string) {
    const order = await this.load(orderId);
    const isOwner = (!!user && order.userId === user.id) || (!!token && token === order.publicToken);
    if (!isOwner) throw forbidden();
    if (order.status !== 'PENDING_PAYMENT') throw conflict('NOT_AWAITING_PAYMENT', 'This order is not waiting for payment');
    await this.prisma.payment.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: 'FAILED' } });
    const payment = await this.payments.create(order, method);
    return {
      id: payment.id,
      method: payment.method,
      status: payment.status,
      amountSatang: payment.amountSatang,
      qrPayload: payment.qrPayload,
      redirectUrl: payment.redirectUrl,
      expiresAt: payment.expiresAt,
    };
  }
}
