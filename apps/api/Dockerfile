# NestJS API image. Build context is the repository root (npm workspaces share one lockfile):
#   docker build -f apps/api/Dockerfile .
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

FROM base AS build
RUN npm ci -w apps/api --include-workspace-root=false
COPY apps/api apps/api
RUN cd apps/api && ../../node_modules/.bin/prisma generate && ../../node_modules/.bin/nest build

FROM base AS prod-deps
RUN npm ci -w apps/api --include-workspace-root=false --omit=dev
COPY apps/api/prisma apps/api/prisma
RUN mkdir -p apps/api/node_modules && cd apps/api && ../../node_modules/.bin/prisma generate

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/apps/api/node_modules apps/api/node_modules
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
# local-disk uploads when S3_BUCKET is unset
RUN mkdir uploads && chown node:node uploads
EXPOSE 4000
USER node
CMD ["sh", "-c", "/app/node_modules/.bin/prisma migrate deploy && node dist/main.js"]
