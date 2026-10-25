import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertBranchAccess, AuthUser, CurrentUser, MANAGERS, Roles } from '../common/auth';
import { conflict, notFound, parse } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { OrderLifecycleService } from '../orders/lifecycle.service';
import { StockService } from '../orders/stock.service';

const KITCHEN_STATUSES: OrderStatus[] = ['PAID', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

@Controller('admin')
export class OpsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly stock: StockService,
  ) {}

  @Get('kitchen/queue')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'RIDER')
  async queue(@Query('branchId') branchId: string, @CurrentUser() user: AuthUser) {
    assertBranchAccess(user, branchId);
    const since = new Date(Date.now() - 12 * 3600_000);
    const orders = await this.prisma.order.findMany({
      where: { branchId, status: { in: KITCHEN_STATUSES }, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      include: { items: true, events: { orderBy: { at: 'asc' } } },
    });
    const layerIds = [...new Set(orders.flatMap((o) => o.items.flatMap((i) => i.layers)))];
    const layers = await this.prisma.ingredient.findMany({ where: { id: { in: layerIds } }, select: { id: true, name: true } });
    const layerName = new Map(layers.map((l) => [l.id, l.name]));
    return {
      data: orders.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        channel: o.channel,
        fulfillmentType: o.fulfillmentType,
        tableNo: o.tableNo,
        note: o.note,
        createdAt: o.createdAt,
        paidAt: o.events.find((e) => e.status === 'PAID')?.at ?? null,
        etaReadyAt: o.etaReadyAt,
        items: o.items.map((i) => ({
          name: i.name,
          qty: i.qty,
          options: i.optionNames,
          layers: i.layers.map((id) => layerName.get(id) ?? id),
          note: i.note,
        })),
      })),
    };
  }

  @Get('orders')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  async orders(@Query() query: unknown, @CurrentUser() user: AuthUser) {
    const q = parse(
      z.object({
        branchId: z.string(),
        status: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      }),
      query,
    );
    assertBranchAccess(user, q.branchId);
    const where: Prisma.OrderWhereInput = { branchId: q.branchId };
    if (q.status) where.status = { in: q.status.split(',') as OrderStatus[] };
    const rows = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        items: { select: { name: true, qty: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        user: { select: { phone: true, name: true } },
      },
    });
    const page = rows.slice(0, q.limit);
    return { data: page, nextCursor: rows.length > q.limit ? page[page.length - 1].id : null };
  }

  @Patch('orders/:id/status')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'RIDER')
  async status(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const { status, note } = parse(
      z.object({
        status: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED']),
        note: z.string().max(200).optional(),
      }),
      body,
    );
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw notFound('Order');
    assertBranchAccess(user, order.branchId);
    this.lifecycle.assertRoleCanMove(user.role, status);
    const updated = await this.lifecycle.transition(id, status, user, note);
    return { id: updated.id, status: updated.status };
  }

  @Post('orders/:id/refund')
  @HttpCode(200)
  @Roles(...MANAGERS)
  async refund(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const { reason } = parse(z.object({ reason: z.string().min(3).max(200) }), body);
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw notFound('Order');
    assertBranchAccess(user, order.branchId);
    const updated = await this.lifecycle.refund(id, user, reason);
    return { id: updated.id, status: updated.status, payments: updated.payments.map((p) => ({ id: p.id, status: p.status })) };
  }

  /** Cashier confirms cash received at the counter. */
  @Post('payments/:id/mark-paid')
  @HttpCode(200)
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  async markPaid(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: { order: true } });
    if (!payment) throw notFound('Payment');
    assertBranchAccess(user, payment.order.branchId);
    if (payment.method !== 'CASH') throw conflict('NOT_CASH', 'Only cash payments are confirmed by hand');
    return this.lifecycle.onPaymentSucceeded(id, payment.amountSatang);
  }

  @Get('ingredients')
  @Roles('OWNER', 'MANAGER', 'KITCHEN')
  async ingredients(@Query('branchId') branchId: string, @CurrentUser() user: AuthUser) {
    assertBranchAccess(user, branchId);
    const rows = await this.prisma.ingredient.findMany({
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      include: { stock: { where: { branchId } } },
    });
    return {
      data: rows.map((i) => {
        const s = i.stock[0];
        return {
          id: i.id,
          name: i.name,
          nameEn: i.nameEn,
          unit: i.unit,
          kind: i.kind,
          costPerUnitSatang: i.costPerUnitSatang,
          isBuilder: i.isBuilder,
          quantity: s?.quantity ?? 0,
          reorderPoint: s?.reorderPoint ?? 0,
          isLow: (s?.quantity ?? 0) <= (s?.reorderPoint ?? 0),
        };
      }),
    };
  }

  @Post('ingredients')
  @Roles(...MANAGERS)
  createIngredient(@Body() body: unknown) {
    const input = parse(
      z.object({
        id: z.string().regex(/^ing_[a-z0-9_]+$/),
        name: z.string().min(1),
        nameEn: z.string().min(1),
        unit: z.string().min(1).max(10),
        kind: z.enum(['BUN', 'PATTY', 'CHEESE', 'VEG', 'SAUCE', 'EXTRA', 'OTHER']),
        costPerUnitSatang: z.number().int().min(0),
      }),
      body,
    );
    return this.prisma.ingredient.create({ data: input });
  }

  @Patch('ingredients/:id')
  @Roles(...MANAGERS)
  async updateIngredient(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const input = parse(
      z.object({
        name: z.string().optional(),
        costPerUnitSatang: z.number().int().min(0).optional(),
        branchId: z.string().optional(),
        reorderPoint: z.number().min(0).optional(),
      }),
      body,
    );
    const { branchId, reorderPoint, ...fields } = input;
    if (branchId && reorderPoint !== undefined) {
      assertBranchAccess(user, branchId);
      await this.prisma.branchIngredient.upsert({
        where: { branchId_ingredientId: { branchId, ingredientId: id } },
        create: { branchId, ingredientId: id, quantity: 0, reorderPoint },
        update: { reorderPoint },
      });
    }
    return this.prisma.ingredient.update({ where: { id }, data: fields });
  }

  /** Receive deliveries, write off waste, or correct a count. */
  @Post('stock-movements')
  @Roles('OWNER', 'MANAGER', 'KITCHEN')
  async movement(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const input = parse(
      z.object({
        branchId: z.string(),
        ingredientId: z.string(),
        reason: z.enum(['RECEIVE', 'WASTE', 'ADJUST']),
        quantity: z.number().positive().max(100000),
        note: z.string().max(200).optional(),
      }),
      body,
    );
    assertBranchAccess(user, input.branchId);
    const ingredient = await this.prisma.ingredient.findUnique({ where: { id: input.ingredientId } });
    if (!ingredient) throw notFound('Ingredient');
    let delta = input.reason === 'WASTE' ? -input.quantity : input.quantity;
    if (input.reason === 'ADJUST') {
      // ADJUST sets the counted quantity; the movement records the difference.
      const current = await this.prisma.branchIngredient.findUnique({
        where: { branchId_ingredientId: { branchId: input.branchId, ingredientId: input.ingredientId } },
      });
      delta = input.quantity - (current?.quantity ?? 0);
    }
    await this.prisma.$transaction((tx) =>
      this.stock.apply(tx, input.branchId, new Map([[input.ingredientId, delta]]), input.reason, {
        actorId: user.id,
        note: input.note,
      }),
    );
    await this.stock.reconcileAvailability(input.branchId, [input.ingredientId]);
    const level = await this.prisma.branchIngredient.findUnique({
      where: { branchId_ingredientId: { branchId: input.branchId, ingredientId: input.ingredientId } },
    });
    return { ingredientId: input.ingredientId, delta, quantity: level?.quantity ?? 0 };
  }

  @Get('stock-movements')
  @Roles('OWNER', 'MANAGER', 'KITCHEN')
  async movements(@Query('branchId') branchId: string, @CurrentUser() user: AuthUser) {
    assertBranchAccess(user, branchId);
    const data = await this.prisma.stockMovement.findMany({
      where: { branchId, reason: { not: 'SALE' } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { ingredient: { select: { name: true, unit: true } } },
    });
    return { data };
  }
}
