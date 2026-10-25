// Cloudflare entry for the API: one NestJS container behind a Durable Object.
// The web worker reaches it through the `Internal` entrypoint (a service binding), so the API
// has no public route of its own; webhooks and Socket.IO arrive via the web origin.
import { Container, getContainer } from '@cloudflare/containers';
import { WorkerEntrypoint } from 'cloudflare:workers';

interface Env {
  API_CONTAINER: DurableObjectNamespace<ApiContainer>;
  [name: string]: unknown;
}

/** Worker vars and secrets handed to the Node process (see apps/api/.env.example). */
const CONTAINER_ENV = [
  'DATABASE_URL',
  'REDIS_URL',
  'WEB_ORIGIN',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'PAYMENT_WEBHOOK_SECRET',
  'PROMPTPAY_ID',
  'DEV_MODE',
  'ENFORCE_OPENING_HOURS',
  'S3_BUCKET',
  'S3_ENDPOINT',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'LINE_CHANNEL_ID',
  'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN',
];

/** Must match INTERNAL_CLIENT in src/common/auth.ts: server-rendered calls skip the per-IP limit. */
const INTERNAL_CLIENT = 'internal';

export class ApiContainer extends Container<Env> {
  defaultPort = 4000;
  // BullMQ timers (payment expiry, notifications) catch up when the container wakes again
  sleepAfter = '1h';

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    const vars: Record<string, string> = { NODE_ENV: 'production', PORT: '4000' };
    for (const name of CONTAINER_ENV) {
      const value = env[name];
      if (typeof value === 'string' && value !== '') vars[name] = value;
    }
    this.envVars = vars;
  }
}

function forward(request: Request, env: Env, clientIp: string) {
  const headers = new Headers(request.headers);
  headers.set('x-forwarded-for', clientIp);
  // a single instance keeps Socket.IO rooms and BullMQ workers in one place
  return getContainer(env.API_CONTAINER).fetch(new Request(request, { headers }));
}

export class Internal extends WorkerEntrypoint<Env> {
  fetch(request: Request) {
    return forward(request, this.env, request.headers.get('x-forwarded-for') || INTERNAL_CLIENT);
  }
}

// Only reachable if a route or workers.dev is turned on; the client IP then comes from Cloudflare.
export default {
  fetch(request, env) {
    return forward(request, env, request.headers.get('cf-connecting-ip') ?? 'unknown');
  },
} satisfies ExportedHandler<Env>;
