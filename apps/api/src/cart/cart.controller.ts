import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AppRequest } from '../common/auth';
import { parse } from '../common/errors';
import { CartService, CartWithItems } from './cart.service';
import { RecommendationService } from './recommendation.service';

export const fulfillmentSchema = z.object({
  type: z.enum(['DELIVERY', 'PICKUP', 'DINE_IN']),
  addressId: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
});

const addSchema = z.object({
  menuItemId: z.string().min(1),
  qty: z.number().int().min(1).max(20).default(1),
  optionIds: z.array(z.string()).max(20).default([]),
  layers: z.array(z.string()).max(12).default([]),
  note: z.string().max(140).optional(),
});

@Controller('carts/me')
export class CartController {
  constructor(private readonly carts: CartService) {}

  private async cart(req: AppRequest, res: Response) {
    return (await this.carts.resolve(req, res)) as CartWithItems;
  }

  private async fresh(req: AppRequest, res: Response) {
    const cart = await this.cart(req, res);
    return this.carts.view(cart, req.user?.id ?? null);
  }

  @Get()
  get(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    return this.fresh(req, res);
  }

  @Put('context')
  async context(@Body() body: unknown, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const input = parse(
      z.object({
        branchId: z.string().optional(),
        channel: z.enum(['WEB', 'LINE', 'QR', 'KIOSK']).optional(),
        tableNo: z.string().max(10).nullable().optional(),
      }),
      body,
    );
    await this.carts.setContext(await this.cart(req, res), input);
    return this.fresh(req, res);
  }

  @Post('items')
  async add(@Body() body: unknown, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    await this.carts.addItem(await this.cart(req, res), parse(addSchema, body));
    return this.fresh(req, res);
  }

  @Patch('items/:lineId')
  async update(@Param('lineId') lineId: string, @Body() body: unknown, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const patch = parse(
      z.object({
        qty: z.number().int().min(0).max(20).optional(),
        optionIds: z.array(z.string()).max(20).optional(),
        note: z.string().max(140).nullable().optional(),
      }),
      body,
    );
    await this.carts.updateItem(await this.cart(req, res), lineId, patch);
    return this.fresh(req, res);
  }

  @Delete('items/:lineId')
  async remove(@Param('lineId') lineId: string, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    await this.carts.removeItem(await this.cart(req, res), lineId);
    return this.fresh(req, res);
  }

  @Delete()
  @HttpCode(200)
  async clear(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    await this.carts.clear(await this.cart(req, res));
    return this.fresh(req, res);
  }

  @Post('promo')
  @HttpCode(200)
  async promo(@Body() body: unknown, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const { code } = parse(z.object({ code: z.string().max(40).nullable() }), body);
    await this.carts.setPromo(await this.cart(req, res), code);
    return this.fresh(req, res);
  }

  @Post('quote')
  @HttpCode(200)
  async quote(@Body() body: unknown, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const { fulfillment } = parse(z.object({ fulfillment: fulfillmentSchema }), body);
    return this.carts.view(await this.cart(req, res), req.user?.id ?? null, fulfillment);
  }
}

@Controller('recommendations')
export class RecommendationController {
  constructor(
    private readonly carts: CartService,
    private readonly recommendations: RecommendationService,
  ) {}

  @Get()
  async get(@Query('context') context: string, @Req() req: AppRequest) {
    if (context !== 'cart') return { suggestion: null };
    const cart = await this.carts.resolve(req, null, { create: false });
    return cart ? this.recommendations.forCart(cart) : { suggestion: null };
  }
}
