import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../common/env';
import { AppError } from '../common/errors';

interface LineProfile {
  sub: string;
  name?: string;
}

/** LINE Login (LIFF id token) + Messaging API. Every call is a no-op until credentials are set. */
@Injectable()
export class LineService {
  private readonly logger = new Logger('LINE');

  get enabled() {
    return !!(env.line.channelId && env.line.channelSecret);
  }

  async verifyIdToken(idToken: string): Promise<LineProfile> {
    if (!env.line.channelId) {
      throw new AppError('LINE_NOT_CONFIGURED', 'LINE Login is not configured on this server', 501);
    }
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: env.line.channelId }),
    });
    if (!res.ok) throw new AppError('LINE_TOKEN_INVALID', 'LINE could not verify this login', 401);
    return (await res.json()) as LineProfile;
  }

  verifySignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    if (!env.line.channelSecret || !rawBody || !signature) return false;
    const expected = createHmac('sha256', env.line.channelSecret).update(rawBody).digest();
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  async push(lineUserId: string, text: string) {
    if (!env.line.accessToken) {
      this.logger.debug(`(LINE disabled) to ${lineUserId}: ${text}`);
      return;
    }
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.line.accessToken}` },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
    });
    if (!res.ok) this.logger.warn(`LINE push failed: ${res.status}`);
  }
}
