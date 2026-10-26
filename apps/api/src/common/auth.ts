import { CanActivate, createParamDecorator, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { AppError, forbidden } from './errors';
import { env } from './env';

export interface AuthUser {
  id: string;
  role: Role;
  branchId: string | null;
}

export interface AccessPayload {
  sub: string;
  role: Role;
  branchId: string | null;
}

export type AppRequest = Request & { user?: AuthUser; rawBody?: Buffer };

export const STAFF_ROLES: Role[] = ['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'RIDER'];
export const MANAGERS: Role[] = ['OWNER', 'MANAGER'];

const AUTH_KEY = 'auth:required';
const ROLES_KEY = 'auth:roles';

/** Requires a signed-in user. */
export const Authenticated = () => SetMetadata(AUTH_KEY, true);
/** Requires one of the given roles (implies Authenticated). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().user;
});

export function verifyAccessToken(jwt: JwtService, token: string): AuthUser | null {
  try {
    const p = jwt.verify<AccessPayload>(token, { secret: env.jwtSecret });
    return { id: p.sub, role: p.role, branchId: p.branchId };
  } catch {
    return null;
  }
}

/**
 * Global guard. It always tries to read the bearer token so public endpoints can
 * personalise, and it enforces `@Authenticated()` / `@Roles()` where declared.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const user = verifyAccessToken(this.jwt, header.slice(7));
      if (user) req.user = user;
    }

    const targets = [ctx.getHandler(), ctx.getClass()];
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    const required = this.reflector.getAllAndOverride<boolean | undefined>(AUTH_KEY, targets);

    if ((required || roles) && !req.user) {
      throw new AppError('UNAUTHENTICATED', 'Sign in required', 401);
    }
    if (roles && !roles.includes(req.user!.role)) {
      throw forbidden('Your role cannot perform this action');
    }
    return true;
  }
}

/** Staff bound to a branch may only act on that branch; owners see every branch. */
export function assertBranchAccess(user: AuthUser, branchId: string) {
  if (user.role === 'OWNER' || !user.branchId) return;
  if (user.branchId !== branchId) throw forbidden('This branch belongs to another team');
}

/** x-forwarded-for value the Cloudflare edge worker sets on server-side calls from the web app. */
export const INTERNAL_CLIENT = 'internal';

/** Server-side calls from the web app on other hosts (Vercel) prove themselves with INTERNAL_API_KEY. */
export function isInternalCall(req: Request): boolean {
  const sent = req.headers['x-internal-key'];
  if (!env.internalApiKey || typeof sent !== 'string') return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(env.internalApiKey);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return (first ?? req.socket.remoteAddress ?? 'unknown').trim();
}
