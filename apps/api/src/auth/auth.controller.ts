import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AppRequest, clientIp } from '../common/auth';
import { parse } from '../common/errors';
import { CartService } from '../cart/cart.service';
import { AuthService } from './auth.service';

const REFRESH_COOKIE = 'rt';
/** Readable hint so the web app only attempts a refresh when a session may exist. */
const HINT_COOKIE = 'sid';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly carts: CartService,
  ) {}

  @Post('otp/request')
  @HttpCode(200)
  request(@Body() body: unknown, @Req() req: AppRequest) {
    const { phone } = parse(z.object({ phone: z.string().min(9).max(15) }), body);
    return this.auth.requestOtp(phone, clientIp(req));
  }

  @Post('otp/verify')
  @HttpCode(200)
  async verify(@Body() body: unknown, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const { phone, code } = parse(z.object({ phone: z.string(), code: z.string().regex(/^\d{6}$/) }), body);
    const session = await this.auth.verifyOtp(phone, code);
    await this.carts.adoptGuestCart(req.cookies?.cart_sid, session.user.id);
    return this.finish(session, res);
  }

  @Post('line')
  @HttpCode(200)
  async line(@Body() body: unknown, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const { idToken } = parse(z.object({ idToken: z.string().min(10) }), body);
    const session = await this.auth.loginWithLine(idToken);
    await this.carts.adoptGuestCart(req.cookies?.cart_sid, session.user.id);
    return this.finish(session, res);
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    try {
      const session = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]);
      return this.finish(session, res);
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
      res.clearCookie(HINT_COOKIE, { path: '/' });
      throw e;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    res.clearCookie(HINT_COOKIE, { path: '/' });
  }

  private finish(session: Awaited<ReturnType<AuthService['refresh']>>, res: Response) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/v1/auth',
      expires: session.refreshExpiresAt,
    });
    res.cookie(HINT_COOKIE, '1', { sameSite: 'lax', path: '/', expires: session.refreshExpiresAt });
    return { accessToken: session.accessToken, user: session.user };
  }
}
