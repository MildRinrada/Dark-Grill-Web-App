import { Injectable } from '@nestjs/common';
import type { Order, PaymentMethod, Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../common/env';
import { AppError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { promptPayPayload } from './promptpay';

export const PAYMENT_PROVIDER = 'mockpay';
const ONLINE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Talks to the payment gateway. The bundled provider ("mockpay") mirrors how Thai
 * gateways behave: PromptPay returns a QR payload, cards return a hosted-page URL,
 * and the final result always arrives later through a signed webhook.
 */
@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    order: Pick<Order, 'id' | 'grandTotalSatang' | 'publicToken'>,
    method: PaymentMethod,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const expiresAt = method === 'CASH' ? null : new Date(Date.now() + ONLINE_WINDOW_MS);
    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        method,
        amountSatang: order.grandTotalSatang,
        provider: method === 'CASH' ? 'counter' : PAYMENT_PROVIDER,
        expiresAt,
      },
    });
    const data: Prisma.PaymentUpdateInput = { providerRef: `mp_${payment.id}` };
    if (method === 'PROMPTPAY') data.qrPayload = promptPayPayload(env.promptPayId, order.grandTotalSatang);
    if (method === 'CARD') data.redirectUrl = `${env.webOrigin}/pay/mock?pid=${payment.id}&t=${order.publicToken}`;
    return db.payment.update({ where: { id: payment.id }, data });
  }

  async get(id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: { order: true } });
    if (!payment) throw notFound('Payment');
    return payment;
  }

  static sign(rawBody: string | Buffer): string {
    return `sha256=${createHmac('sha256', env.webhookSecret).update(rawBody).digest('hex')}`;
  }

  verifySignature(rawBody: Buffer | undefined, header: string | undefined) {
    if (!rawBody || !header) return false;
    const expected = Buffer.from(PaymentsService.sign(rawBody));
    const given = Buffer.from(header);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  /** Asks the gateway to return the money. mockpay settles refunds instantly. */
  async refund(paymentId: string, db: Prisma.TransactionClient = this.prisma) {
    const payment = await db.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw notFound('Payment');
    if (payment.status !== 'SUCCEEDED') throw new AppError('NOT_REFUNDABLE', 'Only settled payments can be refunded', 409);
    return db.payment.update({ where: { id: paymentId }, data: { status: 'REFUNDED', refundedAt: new Date() } });
  }
}
