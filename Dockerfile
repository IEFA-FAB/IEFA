# =============================================================================
# BASE - Alpine com Bun
# =============================================================================
FROM oven/bun:1.3.10-alpine AS base
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
RUN bun install --frozen-lockfile

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
COPY --from=api-build /app/apps/api ./apps/api
USER bun
EXPOSE 3000
CMD ["bun", "apps/api/dist/index.js"]

# =============================================================================
# IEFA
# =============================================================================
FROM deps AS iefa-build
# Build-time environment variables for Vite
ARG VITE_IEFA_SUPABASE_URL
ARG VITE_IEFA_SUPABASE_ANON_KEY
ARG VITE_RAG_SUPABASE_URL

# Copy source files (deps already has packages and installed node_modules)
COPY turbo.json ./
COPY apps/portal ./apps/portal

# Clear any local cache
RUN rm -rf apps/portal/.vite apps/portal/.tanstack apps/portal/node_modules/.vite

# Build with environment variables available to Vite
RUN bun --filter='@iefa/portal' run build
# Validação: output existe?
RUN test -f apps/portal/.output/server/index.mjs || \
    (echo "❌ Build failed: output missing" && exit 1)

FROM oven/bun:1.3.10-alpine AS iefa
ENV NODE_ENV=production
WORKDIR /app
# TanStack Start SSR build with all deps bundled (ssr.noExternal: true)
COPY --from=iefa-build /app/apps/portal/.output ./.output
USER bun
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]

# =============================================================================
# SISUB
# =============================================================================
FROM deps AS sisub-build
# Build-time environment variables for Vite
ARG VITE_SISUB_SUPABASE_URL
ARG VITE_SISUB_SUPABASE_PUBLISHABLE_KEY
ARG SISUB_SUPABASE_SECRET_KEY

# Copy source files (deps already has packages and installed node_modules)
COPY turbo.json ./
COPY apps/sisub ./apps/sisub

# Clear any local cache
RUN rm -rf apps/sisub/.vite apps/sisub/.tanstack apps/sisub/node_modules/.vite

# Build with environment variables available to Vite
RUN bun --filter='@iefa/sisub' run build
RUN test -f apps/sisub/.output/server/index.mjs || \
    (echo "❌ Build failed: output missing" && exit 1)

FROM oven/bun:1.3.10-alpine AS sisub
ENV NODE_ENV=production
WORKDIR /app
# varlock é bundlado no SSR output (não é external) — .env.schema é lido em runtime pelo auto-load
COPY --from=sisub-build /app/apps/sisub/.env.schema ./.env.schema
COPY --from=sisub-build /app/apps/sisub/.output ./.output
USER bun
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]

# =============================================================================
# RAG (apps/ai) — Hono + LangGraph + Bun
# =============================================================================
FROM deps AS rag-build
COPY apps/ai ./apps/ai
RUN test -f apps/ai/src/index.ts || \
    (echo "❌ RAG entrypoint missing" && exit 1)

FROM base AS rag
ENV NODE_ENV=production
ENV PORT=8000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=rag-build /app/apps/ai ./apps/ai
USER bun
EXPOSE 8000
CMD ["bun", "apps/ai/src/index.ts"]

# =============================================================================
# DOCS
# =============================================================================
FROM deps AS docs-build
COPY apps/docs ./apps/docs
RUN bun --filter='@iefa/docs' run build
RUN test -f apps/docs/dist/index.html || \
    (echo "❌ Build failed: output missing" && exit 1)

FROM nginx:alpine AS docs
COPY --from=docs-build /app/apps/docs/dist /usr/share/nginx/html
EXPOSE 80
