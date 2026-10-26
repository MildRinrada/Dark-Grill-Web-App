import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import type { Response } from 'express';
import { catchError, concatMap, from, Observable, of, switchMap } from 'rxjs';
import { AppRequest } from './auth';
import { AppError } from './errors';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

const IDEMPOTENT_KEY = 'idempotent';
/** Marks a POST that moves money or creates an order: it must carry an Idempotency-Key. */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);

/**
 * Replays the stored response for a repeated key, rejects a reused key with a
 * different body, and uses a short Redis lock so two concurrent requests with the
 * same key cannot both run the handler.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.reflector.get<boolean>(IDEMPOTENT_KEY, ctx.getHandler())) return next.handle();

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const key = req.header('idempotency-key');
    if (!key || key.length < 8 || key.length > 100) {
      throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 'Send a unique Idempotency-Key header', 400);
    }
    const scope = `${req.user?.id ?? req.cookies?.cart_sid ?? 'anon'}:${req.method}:${req.route?.path ?? req.path}`;
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ body: req.body ?? null, params: req.params }))
      .digest('hex');

    return from(this.begin(scope, key, requestHash)).pipe(
      switchMap((stored) => {
        if (stored) {
          res.status(stored.statusCode);
          res.setHeader('Idempotent-Replayed', 'true');
          return of(stored.responseBody);
        }
        // store the result before the response goes out, so a retry that arrives right after
        // finds the record instead of the lock
        return next.handle().pipe(
          concatMap(async (body) => {
            await this.prisma.idempotencyRecord.create({
              data: { scope, key, requestHash, statusCode: res.statusCode, responseBody: body as object },
            });
            await this.redis.client.del(this.lockKey(scope, key));
            return body;
          }),
          catchError(async (err) => {
            await this.redis.client.del(this.lockKey(scope, key));
            throw err;
          }),
        );
      }),
    );
  }

  private lockKey(scope: string, key: string) {
    return `idem:${scope}:${key}`;
  }

  private async begin(scope: string, key: string, requestHash: string) {
    const existing = await this.prisma.idempotencyRecord.findUnique({ where: { scope_key: { scope, key } } });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AppError('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was used with a different request', 422);
      }
      return existing;
    }
    const locked = await this.redis.client.set(this.lockKey(scope, key), '1', 'EX', 30, 'NX');
    if (!locked) {
      throw new AppError('REQUEST_IN_PROGRESS', 'The same request is still being processed', 409);
    }
    return null;
  }
}
