# --------------------------------------------------
# Stage 1: Base image
# --------------------------------------------------
FROM node:22-alpine AS base

# Install libraries needed by Alpine (musl compatibility and openssl for Prisma)
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# --------------------------------------------------
# Stage 2: Install dependencies
# --------------------------------------------------
FROM base AS deps

COPY package.json package-lock.json ./
# Copy prisma directory so postinstall (prisma generate) succeeds during npm ci
COPY prisma ./prisma/

RUN npm ci

# --------------------------------------------------
# Stage 3: Build application
# --------------------------------------------------
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build application to dist/
RUN npm run build

# Prune development dependencies
RUN npm prune --omit=dev

# --------------------------------------------------
# Stage 4: Production runner
# --------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=8080

# Security: Run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs -G nodejs

WORKDIR /app

# Copy runtime files with appropriate ownership
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json
COPY --chown=nestjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

USER nestjs

EXPOSE 8080

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
