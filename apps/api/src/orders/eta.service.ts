import { Injectable } from '@nestjs/common';
import type { FulfillmentType } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

const ACTIVE = ['PAID', 'ACCEPTED', 'PREPARING'] as const;
/** Items one cook can work through per minute when the grill is running in parallel. */
const ITEMS_PER_COOK_PER_MINUTE = 0.5;
/** Above this many minutes of queued work the kitchen is "busy" and pickup slots move out. */
const BUSY_MINUTES = 25;

export interface Eta {
  readyAt: string;
  deliveredAt: string | null;
  prepMinutes: number;
  queueMinutes: number;
  kitchenBusy: boolean;
}

/**
 * Kitchen-load ETA: the slowest dish in the order plus the time the kitchen needs to
 * clear what is already queued, divided across the cooks on shift. When the queue is
 * long the promised time moves out instead of over-committing the kitchen.
 */
@Injectable()
export class EtaService {
  constructor(private readonly prisma: PrismaService) {}

  async estimate(input: {
    branchId: string;
    kitchenStaff: number;
    maxPrepMinutes: number;
    fulfillment: FulfillmentType;
    distanceKm?: number;
    scheduledAt?: Date | null;
    now?: Date;
  }): Promise<Eta> {
    const now = input.now ?? new Date();
    const queued = await this.prisma.orderItem.aggregate({
      where: { order: { branchId: input.branchId, status: { in: [...ACTIVE] } } },
      _sum: { qty: true },
    });
    const queuedItems = queued._sum.qty ?? 0;
    const queueMinutes = Math.ceil(queuedItems / (Math.max(1, input.kitchenStaff) * ITEMS_PER_COOK_PER_MINUTE));
    const prepMinutes = Math.max(5, input.maxPrepMinutes);
    const earliestReady = new Date(now.getTime() + (prepMinutes + queueMinutes) * 60_000);
    const readyAt = input.scheduledAt && input.scheduledAt > earliestReady ? input.scheduledAt : earliestReady;
    const travel = input.fulfillment === 'DELIVERY' ? 8 + Math.ceil((input.distanceKm ?? 3) * 3) : null;
    return {
      readyAt: readyAt.toISOString(),
      deliveredAt: travel === null ? null : new Date(readyAt.getTime() + travel * 60_000).toISOString(),
      prepMinutes,
      queueMinutes,
      kitchenBusy: queueMinutes >= BUSY_MINUTES,
    };
  }
}
