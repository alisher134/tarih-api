FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8080
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs -G nodejs
WORKDIR /app
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/src/generated ./src/generated
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nestjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nestjs:nodejs /app/Big_Buck_Bunny_1080_10s_5MB.mp4 ./Big_Buck_Bunny_1080_10s_5MB.mp4
COPY --from=builder --chown=nestjs:nodejs /app/Rakhmanov-Alisher-Frontend.pdf ./Rakhmanov-Alisher-Frontend.pdf
COPY --chown=nestjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
USER nestjs
EXPOSE 8080
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
