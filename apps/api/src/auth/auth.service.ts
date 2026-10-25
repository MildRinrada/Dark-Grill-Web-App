import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { AccessPayload } from '../common/auth';
import { env } from '../common/env';
import { AppError } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { LineService } from '../line/line.service';

const OTP_TTL_MS = 5 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('66') && digits.length === 11) return `0${digits.slice(2)}`;
  return digits;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly line: LineService,
  ) {}

  async requestOtp(rawPhone: string, ip: string) {
    const phone = normalizePhone(rawPhone);
    if (!/^0\d{9}$/.test(phone)) throw new AppError('INVALID_PHONE', 'Use a 10-digit Thai mobile number');
    await this.redis.rateLimit(`otp:phone:${phone}`, 3, 600);
    await this.redis.rateLimit(`otp:ip:${ip}`, 10, 600);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.otpCode.create({
      data: { phone, codeHash: sha256(`${phone}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    // An SMS provider would be called here. In dev the code is logged and returned.
    this.logger.log(`OTP for ${phone}: ${code}`);
    return { phone, expiresInSeconds: OTP_TTL_MS / 1000, ...(env.devMode ? { devCode: code } : {}) };
  }

  async verifyOtp(rawPhone: string, code: string) {
    const phone = normalizePhone(rawPhone);
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= 5) throw new AppError('OTP_EXPIRED', 'Request a new code', 400);

    const expected = Buffer.from(otp.codeHash, 'hex');
    const actual = Buffer.from(sha256(`${phone}:${code}`), 'hex');
    if (!timingSafeEqual(expected, actual)) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new AppError('OTP_INVALID', 'The code does not match', 400, { attemptsLeft: 4 - otp.attempts });
    }
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });

    const user = await this.prisma.user.upsert({ where: { phone }, create: { phone }, update: {} });
    return this.issue(user);
  }

  async loginWithLine(idToken: string) {
    const profile = await this.line.verifyIdToken(idToken);
    const user = await this.prisma.user.upsert({
      where: { lineUserId: profile.sub },
      create: { lineUserId: profile.sub, name: profile.name },
      update: {},
    });
    return this.issue(user);
  }

  async refresh(token: string | undefined) {
    if (!token) throw new AppError('UNAUTHENTICATED', 'No session', 401);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (!record || record.expiresAt < new Date()) throw new AppError('UNAUTHENTICATED', 'Session expired', 401);
    if (record.revokedAt) {
      // A rotated token came back: treat it as theft and end every session for this user.
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new AppError('UNAUTHENTICATED', 'Session expired', 401);
    }
    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    return this.issue(record.user);
  }

  async logout(token: string | undefined) {
    if (!token) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issue(user: User) {
    const payload: AccessPayload = { sub: user.id, role: user.role, branchId: user.staffBranchId };
    const accessToken = await this.jwt.signAsync(payload, { secret: env.jwtSecret, expiresIn: '15m' });
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
    });
    return {
      accessToken,
      refreshToken,
      refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      user: { id: user.id, phone: user.phone, name: user.name, role: user.role, branchId: user.staffBranchId },
    };
  }
}
