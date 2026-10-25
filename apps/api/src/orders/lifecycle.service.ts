import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { OrderStatus, Prisma, Role } from '@prisma/client';
import { Queue } from 'bullmq';
import { AuthUser } from '../common/auth';
import { AppError, conflict, forbidden, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PaymentsService } from '../payments/payments.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { StockService } from './stock.service';

export const ORDERS_QUEUE = 'orders';
export const NOTIFY_QUEUE = 'notifications';

/** Order state machine from the design doc. */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PAID', 'EXPIRED', 'CANCELLED'],
  PAID: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'],
  READY: ['OUT_FOR_DELIVERY', 'COMPLETED'],
  OUT_FOR_DELIVERY: ['COMPLETED'],
  COMPLETED: [],
  EXPIRED: [],
  CANCELLED: [],
};

/** Which statuses each staff role may move an order into. */
const ROLE_TARGETS: Record<Role, OrderStatus[]> = {
  OWNER: ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'],
  MANAGER: ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'],
  CASHIER: ['ACCEPTED', 'READY', 'COMPLETED', 'CANCELLED'],
  KITCHEN: ['ACCEPTED', 'PREPARING', 'READY'],
  RIDER: ['OUT_FOR_DELIVERY', 'COMPLETED'],
  CUSTOMER: [],
};

type FullOrder = Prisma.OrderGetPayload<{ include: { items: true; payments: true } }>;

@Injectable()
export class OrderLifecycleService {
  private readonly logger = new Logger('Orders');

  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly loyalty: LoyaltyService,
    private readonly payments: PaymentsService,
    private readonly realtime: RealtimeGateway,
    @InjectQueue(NOTIFY_QUEUE) private readonly notifyQueue: Queue,
  ) {}

  assertRoleCanMove(role: Role, to: OrderStatus) {
    if (!ROLE_TARGETS[role].includes(to)) throw forbidden(`${role} cannot move an order to ${to}`);
  }

  /**
   * Moves an order to `to`, running side effects in the same transaction. The update
   * is conditional on the status we read, so two staff tapping at once cannot both win.
   */
  async transition(orderId: string, to: OrderStatus, actor: AuthUser | null, note?: string) {
    const touched: string[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, payments: true } });
      if (!order) throw notFound('Order');
      if (!TRANSITIONS[order.status].includes(to)) {
        throw conflict('INVALID_TRANSITION', `Cannot move from ${order.status} to ${to}`, { from: order.status, to });
      }
      if (to === 'OUT_FOR_DELIVERY' && order.fulfillmentType !== 'DELIVERY') {
        throw conflict('INVALID_TRANSITION', 'Only delivery orders go out for delivery');
      }
      if (to === 'COMPLETED' && order.status === 'READY' && order.fulfillmentType === 'DELIVERY') {
        throw conflict('INVALID_TRANSITION', 'Delivery orders complete after the rider drops them off');
      }
      const moved = await tx.order.updateMany({ where: { id: orderId, status: order.status }, data: { status: to } });
      if (moved.count === 0) throw conflict('ORDER_CHANGED', 'The order was updated by someone else, refresh and retry');
      await tx.orderStatusEvent.create({ data: { orderId, status: to, actorId: actor?.id, note } });

      touched.push(...(await this.sideEffects(tx, order, to)));
      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, payments: true } });
    });

    if (touched.length) await this.stock.reconcileAvailability(result.branchId, touched);
    await this.broadcast(result);
    return result;
  }

  private async sideEffects(tx: Prisma.TransactionClient, order: FullOrder, to: OrderStatus): Promise<string[]> {
    const paid = order.payments.find((p) => p.status === 'SUCCEEDED');
    switch (to) {
      case 'PAID':
        return this.stock.deductForOrder(tx, order);
      case 'CANCELLED': {
        if (paid) await this.payments.refund(paid.id, tx);
        await tx.payment.updateMany({ where: { orderId: order.id, status: 'PENDING' }, data: { status: 'FAILED' } });
        if (order.status === 'PENDING_PAYMENT') await this.releasePromo(tx, order.promoCode);
        if (order.stockDeducted && (order.status === 'PAID' || order.status === 'ACCEPTED')) {
          return this.stock.restockForOrder(tx, order);
        }
        return [];
      }
      case 'EXPIRED':
        await tx.payment.updateMany({ where: { orderId: order.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
        await this.releasePromo(tx, order.promoCode);
        return [];
      case 'COMPLETED':
        await this.loyalty.earnForOrder(tx, { ...order, status: 'COMPLETED' });
        return [];
      default:
        return [];
    }
  }

  private async releasePromo(tx: Prisma.TransactionClient, code: string | null) {
    if (code) await tx.promotion.updateMany({ where: { code, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
  }

  /** Webhook / cashier path. Safe to call more than once for the same payment. */
  async onPaymentSucceeded(paymentId: string, amountSatang: number) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
    if (!payment) throw notFound('Payment');
    if (payment.amountSatang !== amountSatang) {
      throw new AppError('AMOUNT_MISMATCH', 'Paid amount does not match the order', 422, {
        expected: payment.amountSatang,
        received: amountSatang,
      });
    }
    const claimed = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'SUCCEEDED', paidAt: new Date() },
    });
    if (claimed.count === 0) return { duplicate: true };

    if (payment.order.status === 'PENDING_PAYMENT') {
      await this.transition(payment.orderId, 'PAID', null, `Paid by ${payment.method}`);
    } else {
      // Money arrived after the order expired or was cancelled: give it straight back.
      this.logger.warn(`Late payment ${paymentId} for ${payment.order.status} order, refunding`);
      await this.payments.refund(paymentId);
    }
    return { duplicate: false };
  }

  async onPaymentFailed(paymentId: string) {
    await this.prisma.payment.updateMany({ where: { id: paymentId, status: 'PENDING' }, data: { status: 'FAILED' } });
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (payment) {
      const order = await this.prisma.order.findUniqueOrThrow({ where: { id: payment.orderId }, include: { items: true, payments: true } });
      await this.broadcast(order);
    }
  }

  async expire(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (order?.status !== 'PENDING_PAYMENT') return;
    await this.transition(orderId, 'EXPIRED', null, 'Payment window closed');
  }

  /** Staff refund. Completed orders keep their status; anything earlier is cancelled. */
  async refund(orderId: string, actor: AuthUser, reason: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payments: true } });
    if (!order) throw notFound('Order');
    const paid = order.payments.find((p) => p.status === 'SUCCEEDED');
    if (!paid) throw conflict('NOT_REFUNDABLE', 'This order has no settled payment');
    if (order.status === 'COMPLETED' || order.status === 'OUT_FOR_DELIVERY' || order.status === 'READY' || order.status === 'PREPARING') {
      await this.prisma.$transaction(async (tx) => {
        await this.payments.refund(paid.id, tx);
        await this.loyalty.reverseForOrder(tx, order);
        await tx.orderStatusEvent.create({ data: { orderId, status: order.status, actorId: actor.id, note: `Refunded: ${reason}` } });
      });
      const fresh = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, payments: true } });
      await this.broadcast(fresh);
      return fresh;
    }
    return this.transition(orderId, 'CANCELLED', actor, `Refunded: ${reason}`);
  }

  private async broadcast(order: FullOrder) {
    const payload = {
      id: order.id,
      number: order.number,
      status: order.status,
      branchId: order.branchId,
      updatedAt: order.updatedAt,
      payments: order.payments.map((p) => ({ id: p.id, status: p.status, method: p.method })),
    };
    this.realtime.emit(`order:${order.id}`, 'order.status_changed', payload);
    this.realtime.emit('admin', 'order.updated', payload);
    if (order.status === 'PAID') this.realtime.emit(`kitchen:${order.branchId}`, 'order.created', payload);
    else if (order.status === 'CANCELLED') this.realtime.emit(`kitchen:${order.branchId}`, 'order.cancelled', payload);
    else this.realtime.emit(`kitchen:${order.branchId}`, 'order.updated', payload);
    await this.notifyQueue.add(
      'order-status',
      { orderId: order.id, status: order.status },
      { removeOnComplete: 1000, attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
  }
}
