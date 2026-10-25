import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { OrderStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../common/prisma.service';
import { LineService } from '../line/line.service';
import { NOTIFY_QUEUE, ORDERS_QUEUE, OrderLifecycleService } from '../orders/lifecycle.service';

@Processor(ORDERS_QUEUE)
export class OrdersProcessor extends WorkerHost {
  constructor(private readonly lifecycle: OrderLifecycleService) {
    super();
  }

  async process(job: Job<{ orderId: string }>) {
    if (job.name === 'expire-payment') await this.lifecycle.expire(job.data.orderId);
  }
}

const MESSAGES: Partial<Record<OrderStatus, (n: string, delivery: boolean) => string>> = {
  PAID: (n) => `ได้รับชำระเงินแล้ว ออเดอร์ #${n} กำลังส่งเข้าครัว`,
  ACCEPTED: (n) => `ครัวรับออเดอร์ #${n} แล้ว`,
  PREPARING: (n) => `กำลังย่างเบอร์เกอร์ของคุณ ออเดอร์ #${n}`,
  READY: (n, delivery) => (delivery ? `ออเดอร์ #${n} แพ็กเสร็จ รอไรเดอร์รับ` : `ออเดอร์ #${n} พร้อมรับที่เคาน์เตอร์แล้ว`),
  OUT_FOR_DELIVERY: (n) => `ไรเดอร์กำลังนำออเดอร์ #${n} ไปส่ง`,
  COMPLETED: (n) => `ขอบคุณที่อุดหนุน ออเดอร์ #${n} เสร็จสมบูรณ์`,
  CANCELLED: (n) => `ออเดอร์ #${n} ถูกยกเลิก หากชำระเงินแล้วระบบคืนเงินให้อัตโนมัติ`,
  EXPIRED: (n) => `ออเดอร์ #${n} หมดเวลาชำระเงิน`,
};

/** Fans status changes out to the customer's channel. LINE OA when linked, log otherwise. */
@Processor(NOTIFY_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger('Notify');

  constructor(
    private readonly prisma: PrismaService,
    private readonly line: LineService,
  ) {
    super();
  }

  async process(job: Job<{ orderId: string; status: OrderStatus }>) {
    const order = await this.prisma.order.findUnique({ where: { id: job.data.orderId }, include: { user: true } });
    const message = MESSAGES[job.data.status];
    if (!order || !message) return;
    const text = message(order.number, order.fulfillmentType === 'DELIVERY');
    if (order.user?.lineUserId) await this.line.push(order.user.lineUserId, text);
    else this.logger.log(`[${order.user?.phone ?? 'guest'}] ${text}`);
  }
}
