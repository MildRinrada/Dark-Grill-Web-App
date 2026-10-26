import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  redisUrl: required('REDIS_URL'),
  /** comma-separated, e.g. the production URL plus a preview URL; the first one is used in links */
  webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',').map((o) => o.trim()).filter(Boolean),
  jwtSecret: required('JWT_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  webhookSecret: required('PAYMENT_WEBHOOK_SECRET'),
  promptPayId: process.env.PROMPTPAY_ID ?? '0812345678',
  devMode: process.env.DEV_MODE === 'true',
  /** shared with the web app (apps/web INTERNAL_API_KEY); optional */
  internalApiKey: process.env.INTERNAL_API_KEY ?? '',
  enforceOpeningHours: process.env.ENFORCE_OPENING_HOURS === 'true',
  /** S3-compatible bucket for uploads (Cloudflare R2). Leave S3_BUCKET empty to keep files on disk. */
  s3: {
    bucket: process.env.S3_BUCKET ?? '',
    endpoint: process.env.S3_ENDPOINT ?? '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
  line: {
    channelId: process.env.LINE_CHANNEL_ID ?? '',
    channelSecret: process.env.LINE_CHANNEL_SECRET ?? '',
    accessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '',
  },
};
