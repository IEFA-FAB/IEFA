# =============================================================================
# BASE - Alpine com Bun
# =============================================================================
FROM oven/bun:1.3.8-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# =============================================================================
# DEPS - Instala dependências uma vez para todo o monorepo
# =============================================================================
FROM base AS deps
COPY package.json bun.lock ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/
COPY apps/iefa/package.json ./apps/iefa/
COPY apps/sisub/package.json ./apps/sisub/
COPY apps/docs/package.json ./apps/docs/
RUN bun install --frozen-lockfile

# =============================================================================
# API
# =============================================================================
FROM deps AS api-build
COPY tsconfig.json ./
COPY apps/api ./apps/api
COPY packages ./packages
RUN bun --filter=api run build

FROM base AS api
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=api-build /app/apps/api ./apps/api
COPY --from=api-build /app/packages ./packages
USER bun
EXPOSE 3000
CMD ["bun", "apps/api/src/index.ts"]

# =============================================================================
# IEFA
# =============================================================================
FROM deps AS iefa-build
# Copy source files (deps already has packages and installed node_modules)
COPY turbo.json ./
COPY tsconfig.json ./
COPY apps/iefa ./apps/iefa
# Clear any local cache
RUN rm -rf apps/iefa/.vite apps/iefa/.tanstack apps/iefa/node_modules/.vite
# Debug: verify .env file exists
RUN echo "🔍 Checking for .env file..." && \
    ls -la apps/iefa/.env || echo "❌ .env not found!" && \
    test -f apps/iefa/.env && echo "✅ .env exists" || (echo "❌ .env missing!" && exit 1)
# Vite will automatically load .env files from apps/iefa/.env
# GitHub Actions creates these files from secrets before docker build
RUN bun --filter=iefa run build
# Validação: output existe?
RUN test -f apps/iefa/.output/server/index.mjs || \
    (echo "❌ Build failed: output missing" && exit 1)

FROM node:22-alpine AS iefa
ENV NODE_ENV=production
WORKDIR /app
COPY --from=iefa-build /app/apps/iefa/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

# =============================================================================
# SISUB
# =============================================================================
FROM deps AS sisub-build
# Copy source files (deps already has packages and installed node_modules)
COPY turbo.json ./
COPY tsconfig.json ./
COPY apps/sisub ./apps/sisub
# Clear any local cache
RUN rm -rf apps/sisub/.vite apps/sisub/.tanstack apps/sisub/node_modules/.vite
# Vite will automatically load .env files from apps/sisub/.env
# GitHub Actions creates these files from secrets before docker build
RUN bun --filter=sisub run build
RUN test -f apps/sisub/.output/server/index.mjs || \
    (echo "❌ Build failed: output missing" && exit 1)

FROM node:22-alpine AS sisub
ENV NODE_ENV=production
WORKDIR /app
COPY --from=sisub-build /app/apps/sisub/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

# =============================================================================
# DOCS
# =============================================================================
FROM deps AS docs-build
COPY tsconfig.json ./
COPY apps/docs ./apps/docs
COPY packages ./packages
RUN bun --filter=red-resonance run build

FROM nginx:alpine AS docs
COPY --from=docs-build /app/apps/docs/dist /usr/share/nginx/html
EXPOSE 80
