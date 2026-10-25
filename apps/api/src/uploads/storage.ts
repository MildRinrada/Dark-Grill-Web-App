import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { NextFunction, Request, Response } from 'express';
import { mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { Readable } from 'stream';
import { env } from '../common/env';

export const UPLOAD_DIR = join(process.cwd(), 'uploads');

/**
 * Uploaded images live on local disk in development and in an S3-compatible bucket
 * (Cloudflare R2) when S3_BUCKET is set, because a container's disk is wiped on restart.
 * Either way they are served by the API at /uploads/:key, so stored URLs never change.
 */
const s3 = env.s3.bucket
  ? new S3Client({
      region: 'auto',
      endpoint: env.s3.endpoint,
      credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
    })
  : null;

if (!s3) mkdirSync(UPLOAD_DIR, { recursive: true });

export const usesBucket = !!s3;

export async function saveUpload(key: string, body: Buffer, contentType: string) {
  if (!s3) return writeFile(join(UPLOAD_DIR, key), body);
  await s3.send(
    new PutObjectCommand({ Bucket: env.s3.bucket, Key: `uploads/${key}`, Body: body, ContentType: contentType, CacheControl: 'public, max-age=2592000' }),
  );
}

/** Express handler for GET /uploads/:key in bucket mode. */
export async function serveFromBucket(req: Request, res: Response, next: NextFunction) {
  const key = req.path.replace(/^\//, '');
  if (!s3 || !/^[a-f0-9]{24}\.(jpg|jpeg|png|webp|avif)$/.test(key)) return next();
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: `uploads/${key}` }));
    res.setHeader('Content-Type', obj.ContentType ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    if (obj.ContentLength) res.setHeader('Content-Length', String(obj.ContentLength));
    (obj.Body as Readable).pipe(res);
  } catch (e) {
    if ((e as { name?: string }).name === 'NoSuchKey') return res.status(404).end();
    next(e);
  }
}
