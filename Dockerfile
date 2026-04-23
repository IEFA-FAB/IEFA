# =============================================================================
# BASE - Alpine com Bun
# =============================================================================
FROM oven/bun:1.3.12-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# =============================================================================
# DEPS - Instala dependências uma vez para todo o monorepo
# =============================================================================
FROM base AS deps
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/portal/package.json ./apps/portal/
COPY apps/sisub/package.json ./apps/sisub/
COPY apps/docs/package.json ./apps/docs/
COPY apps/ai/package.json ./apps/ai/
COPY packages/database/package.json ./packages/database/
COPY packages/hono-client/package.json ./packages/hono-client/
COPY packages/ai-client/package.json ./packages/ai-client/
COPY packages/pbac/package.json ./packages/pbac/
RUN bun install

# =============================================================================
# API
# =============================================================================
FROM deps AS api-build
COPY apps/api ./apps/api
RUN bun --filter='@iefa/api' run build
RUN test -f apps/api/dist/index.js || \
    (echo "❌ Build failed: output missing" && exit 1)

FROM base AS api
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=api-build /app/apps/api/dist ./apps/api/dist
USER bun
EXPOSE 3000
CMD ["bun", "apps/api/dist/index.js"]

# =============================================================================
# PORTAL
# =============================================================================
FROM deps AS portal-build
ARG VITE_IEFA_SUPABASE_URL
ARG VITE_IEFA_SUPABASE_PUBLISHABLE_KEY
COPY packages/hono-client ./packages/hono-client
COPY apps/portal ./apps/portal
RUN rm -rf apps/portal/.vite apps/portal/.tanstack apps/portal/node_modules/.vite
RUN bun --filter='@iefa/portal' run build
RUN test -f apps/portal/.output/server/index.mjs || \
    (echo "❌ Build failed: output missing" && exit 1)

RUN grep -oE '"(/assets/[^"]+\.(css|js))"' apps/portal/.output/server/index.mjs \
    | tr -d '"' \
    | sort -u \
    | while read asset; do \
        if [ ! -f "apps/portal/.output/public${asset}" ]; then \
          echo "❌ Asset referenced by server but missing from public: ${asset}"; exit 1; \
        fi; \
      done \
    && echo "✅ All server-referenced assets present in public/"

FROM oven/bun:1.3.12-alpine AS portal
ENV NODE_ENV=production
WORKDIR /app
COPY --from=portal-build /app/apps/portal/.output ./.output
USER bun
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]

# =============================================================================
# SISUB
# =============================================================================
FROM deps AS sisub-build
ARG VITE_SISUB_SUPABASE_URL
ARG VITE_SISUB_SUPABASE_PUBLISHABLE_KEY
COPY packages/database ./packages/database
COPY packages/hono-client ./packages/hono-client
COPY packages/ai-client ./packages/ai-client
COPY packages/pbac ./packages/pbac
COPY apps/sisub ./apps/sisub

# Clear any local cache
RUN rm -rf apps/sisub/.vite apps/sisub/.tanstack apps/sisub/node_modules/.vite

# Build with environment variables available to Vite
RUN bun --filter='@iefa/sisub' run build
RUN test -f apps/sisub/.output/server/index.mjs || \
    (echo "❌ Build failed: output missing" && exit 1)

# Verify all CSS/JS assets referenced by the server bundle actually exist in public/
# This catches SSR vs client build hash mismatches before the image is pushed
RUN grep -oE '"(/assets/[^"]+\.(css|js))"' apps/sisub/.output/server/index.mjs \
    | tr -d '"' \
    | sort -u \
    | while read asset; do \
        if [ ! -f "apps/sisub/.output/public${asset}" ]; then \
          echo "❌ Asset referenced by server but missing from public: ${asset}"; exit 1; \
        fi; \
      done \
    && echo "✅ All server-referenced assets present in public/"

FROM oven/bun:1.3.12-alpine AS sisub
ENV NODE_ENV=production
WORKDIR /app
COPY --from=sisub-build /app/apps/sisub/.output ./.output
USER bun
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]

# =============================================================================
# AI (apps/ai) — Hono + LangGraph + Bun
# =============================================================================
FROM deps AS ai-build
COPY packages/ai-client ./packages/ai-client
COPY apps/ai ./apps/ai
RUN test -f apps/ai/src/index.ts || \
    (echo "❌ AI entrypoint missing" && exit 1)

FROM base AS ai
ENV NODE_ENV=production
ENV PORT=8000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=ai-build /app/apps/ai ./apps/ai
USER bun
EXPOSE 8000
CMD ["bun", "apps/ai/src/index.ts"]

# =============================================================================
# DOCS
# =============================================================================
FROM deps AS docs-build
COPY apps/docs ./apps/docs
RUN bun --filter='@iefa/docs' run build
RUN test -f apps/docs/.output/server/index.mjs || \
    (echo "❌ Build failed: output missing" && exit 1)

RUN grep -oE '"(/assets/[^"]+\.(css|js))"' apps/docs/.output/server/index.mjs \
    | tr -d '"' \
    | sort -u \
    | while read asset; do \
        if [ ! -f "apps/docs/.output/public${asset}" ]; then \
          echo "❌ Asset referenced by server but missing from public: ${asset}"; exit 1; \
        fi; \
      done \
    && echo "✅ All server-referenced assets present in public/"

FROM base AS docs
ENV NODE_ENV=production
ENV PORT=3003
COPY --from=docs-build /app/apps/docs/.output ./apps/docs/.output
USER bun
EXPOSE 3003
CMD ["bun", "apps/docs/.output/server/index.mjs"]
