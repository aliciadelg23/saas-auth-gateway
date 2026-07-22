# syntax=docker/dockerfile:1.7

########################################
# 1. Base — Node 22 with pnpm enabled
########################################
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

########################################
# 2. Dependencies (cached layer)
########################################
FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile=false

########################################
# 3. Build
########################################
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate
RUN pnpm build

########################################
# 4. Runtime — production image
########################################
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

# Non-root user
RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-lock.yaml* ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health/live || exit 1

CMD ["node", "dist/main.js"]
