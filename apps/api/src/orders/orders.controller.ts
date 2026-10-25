import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { fulfillmentSchema } from '../cart/cart.controller';
import { CartService, CartWithItems } from '../cart/cart.service';
import { AppRequest, Authenticated, AuthUser, CurrentUser } from '../common/auth';
import { forbidden, parse } from '../common/errors';
import { Idempotent } from '../common/idempotency.interceptor';
import { PaymentsService } from '../payments/payments.service';
import { OrdersService } from './orders.service';

const createSchema = z.object({
  fulfillment: fulfillmentSchema,
  paymentMethod: z.enum(['PROMPTPAY', 'CARD', 'CASH']),
  note: z.string().max(200).optional(),
});

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly carts: CartService,
  ) {}

  @Post()
  @Idempotent()
  async create(@Body() body: unknown, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const input = parse(createSchema, body);
    const cart = (await this.carts.resolve(req, res)) as CartWithItems;
    return this.orders.create(cart, req.user ?? null, input);
  }

  @Get()
  @Authenticated()
  list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const q = parse(z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).default(10) }), query);
    return this.orders.list(user.id, q.cursor, q.limit);
  }

  @Get('last')
  @Authenticated()
  last(@CurrentUser() user: AuthUser) {
    return this.orders.lastOrder(user.id);
  }

  @Get(':id')
  get(@Param('id') id: string, @Query('t') token: string | undefined, @Req() req: AppRequest) {
    return this.orders.getFor(id, req.user ?? null, token);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Query('t') token: string | undefined, @Req() req: AppRequest) {
    return this.orders.cancel(id, req.user ?? null, token);
  }

  @Post(':id/reorder')
  @Authenticated()
  async reorder(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const cart = (await this.carts.resolve(req, res)) as CartWithItems;
    return this.orders.reorder(id, user, cart);
  }

  @Post(':id/review')
  @Authenticated()
  review(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parse(
      z.object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(500).optional(),
        photoUrl: z.string().startsWith('/uploads/').max(200).optional(),
      }),
      body,
    );
    return this.orders.review(id, user, input);
  }
}

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
  ) {}

  @Post()
  @Idempotent()
  create(@Body() body: unknown, @Req() req: AppRequest) {
    const input = parse(z.object({ orderId: z.string(), method: z.enum(['PROMPTPAY', 'CARD']), orderToken: z.string().optional() }), body);
    return this.orders.retryPayment(input.orderId, input.method, req.user ?? null, input.orderToken);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Query('t') token: string | undefined, @Req() req: AppRequest) {
    const p = await this.payments.get(id);
    const allowed =
      (req.user && p.order.userId === req.user.id) ||
      (token && token === p.order.publicToken) ||
      (req.user && req.user.role !== 'CUSTOMER');
    if (!allowed) throw forbidden();
    return {
      id: p.id,
      orderId: p.orderId,
      orderNumber: p.order.number,
      method: p.method,
      status: p.status,
      amountSatang: p.amountSatang,
      expiresAt: p.expiresAt,
      paidAt: p.paidAt,
    };
  }
}
