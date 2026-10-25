import { Body, Controller, Headers, HttpCode, Logger, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { AppRequest } from '../common/auth';
import { env } from '../common/env';
import { AppError, parse } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { LineService } from '../line/line.service';
import { OrderLifecycleService } from '../orders/lifecycle.service';
import { PAYMENT_PROVIDER, PaymentsService } from './payments.service';

const eventSchema = z.object({
  eventId: z.string().min(1),
  type: z.enum(['payment.succeeded', 'payment.failed']),
  paymentId: z.string(),
  amountSatang: z.number().int(),
});

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger('Webhook');

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly line: LineService,
  ) {}

  /** Signature is checked on the raw bytes, then the event id makes redelivery a no-op. */
  @Post('payments/:provider')
  @HttpCode(200)
  async payment(@Param('provider') provider: string, @Req() req: AppRequest, @Headers('x-mockpay-signature') signature?: string) {
    if (provider !== PAYMENT_PROVIDER) throw new NotFoundException();
    if (!this.payments.verifySignature(req.rawBody, signature)) {
      throw new AppError('BAD_SIGNATURE', 'Webhook signature is invalid', 401);
    }
    const event = parse(eventSchema, req.body);
    const seen = await this.prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider, eventId: event.eventId } },
    });
    if (seen) return { received: true, duplicate: true };

    // Processing is itself guarded by the payment's status, so a redelivery racing this
    // one cannot settle twice. The event is recorded only after it was handled, so a
    // failure here lets the gateway retry.
    const result =
      event.type === 'payment.succeeded'
        ? await this.lifecycle.onPaymentSucceeded(event.paymentId, event.amountSatang)
        : (await this.lifecycle.onPaymentFailed(event.paymentId), {});
    try {
      await this.prisma.webhookEvent.create({ data: { provider, eventId: event.eventId, payload: event } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
    return { received: true, ...result };
  }

  @Post('line')
  @HttpCode(200)
  lineWebhook(@Req() req: AppRequest, @Headers('x-line-signature') signature?: string) {
    if (!this.line.verifySignature(req.rawBody, signature)) {
      throw new AppError('BAD_SIGNATURE', 'LINE signature is invalid', 401);
    }
    const events = (req.body as { events?: unknown[] }).events ?? [];
    this.logger.log(`LINE webhook: ${events.length} event(s)`);
    return { received: true };
  }
}

/**
 * Development-only stand-in for the gateway's side of the flow. It signs an event
 * and sends it through the real webhook endpoint, so signature checks, idempotency
 * and the order state machine all run exactly as they would in production.
 */
@Controller('dev')
export class DevController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('payments/:id/simulate')
  @HttpCode(200)
  async simulate(@Param('id') id: string, @Body() body: unknown) {
    if (!env.devMode) throw new NotFoundException();
    const { outcome } = parse(z.object({ outcome: z.enum(['succeeded', 'failed']).default('succeeded') }), body ?? {});
    const payment = await this.payments.get(id);
    const raw = JSON.stringify({
      eventId: `evt_${randomUUID()}`,
      type: `payment.${outcome}`,
      paymentId: payment.id,
      amountSatang: payment.amountSatang,
    });
    const res = await fetch(`http://127.0.0.1:${env.port}/api/v1/webhooks/payments/${PAYMENT_PROVIDER}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mockpay-signature': PaymentsService.sign(raw) },
      body: raw,
    });
    return { webhookStatus: res.status, webhookResponse: await res.json() };
  }
}
