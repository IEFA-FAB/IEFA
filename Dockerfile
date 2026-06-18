# =============================================================================
# BASE - Alpine com Bun
# =============================================================================
FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# =============================================================================
# DEPS - Instala dependências uma vez para todo o monorepo
# =============================================================================
FROM base AS deps
# Todos os workspaces declarados no bun.lock precisam estar presentes para
# `--frozen-lockfile` validar a árvore sem regenerar o lockfile.
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/portal/package.json ./apps/portal/
COPY apps/rumaer/package.json ./apps/rumaer/
COPY apps/sisub/package.json ./apps/sisub/
COPY apps/sisub-mcp/package.json ./apps/sisub-mcp/
COPY apps/docs/package.json ./apps/docs/
COPY apps/forms/package.json ./apps/forms/
COPY apps/alpha/package.json ./apps/alpha/
COPY apps/sucont/package.json ./apps/sucont/
COPY packages/database/package.json ./packages/database/
COPY packages/hono-client/package.json ./packages/hono-client/
COPY packages/alpha-client/package.json ./packages/alpha-client/
COPY packages/ai-provider/package.json ./packages/ai-provider/
COPY packages/compras-api/package.json ./packages/compras-api/
COPY packages/pbac/package.json ./packages/pbac/
COPY packages/sisub-domain/package.json ./packages/sisub-domain/
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
# Bundle gerado por `bun build --target bun` é self-contained (deps inlined) — não precisa de node_modules
COPY --from=api-build /app/apps/api/dist ./apps/api/dist
COPY --from=api-build /app/apps/api/public ./apps/api/public
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

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS portal
ENV NODE_ENV=production
WORKDIR /app
COPY --from=portal-build /app/apps/portal/.output ./.output
USER bun
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]

# =============================================================================
# RUMAER
# =============================================================================
FROM deps AS rumaer-build
ARG VITE_RUMAER_SUPABASE_URL
ARG VITE_RUMAER_SUPABASE_PUBLISHABLE_KEY
COPY packages/database ./packages/database
COPY apps/rumaer ./apps/rumaer
RUN rm -rf apps/rumaer/.vite apps/rumaer/.tanstack apps/rumaer/node_modules/.vite
RUN bun --filter='@iefa/rumaer' run build
RUN test -f apps/rumaer/.output/server/index.mjs || \
    (echo "❌ Build failed: output missing" && exit 1)

RUN grep -oE '"(/assets/[^"]+\.(css|js))"' apps/rumaer/.output/server/index.mjs \
    | tr -d '"' \
    | sort -u \
    | while read asset; do \
        if [ ! -f "apps/rumaer/.output/public${asset}" ]; then \
          echo "❌ Asset referenced by server but missing from public: ${asset}"; exit 1; \
        fi; \
      done \
    && echo "✅ All server-referenced assets present in public/"

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS rumaer
ENV NODE_ENV=production
WORKDIR /app
COPY --from=rumaer-build /app/apps/rumaer/.output ./.output
USER bun
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]

# =============================================================================
# SISUB
# =============================================================================
FROM deps AS sisub-build
ARG VITE_SISUB_SUPABASE_URL
ARG VITE_SISUB_SUPABASE_PUBLISHABLE_KEY
# Observability — Faro frontend (baked no bundle do cliente em build-time).
# Vazio → faro.client.ts vira no-op silencioso. Não persistem na imagem runtime
# (estágio `sisub` abaixo é um FROM separado, não herda estes ARG).
ARG VITE_FARO_COLLECTOR_URL
ARG VITE_FARO_APP_NAME
ARG VITE_FARO_ENVIRONMENT
# Faro sourcemap upload — secret, consumido SÓ pelo vite.config.ts durante o build
# (loadEnv lê este ARG como env). Vazio → build não gera/envia maps. Não vai pra
# imagem runtime nem pro bundle do cliente.
ARG FARO_SOURCEMAP_API_KEY
COPY packages/database ./packages/database
COPY packages/hono-client ./packages/hono-client
COPY packages/alpha-client ./packages/alpha-client
COPY packages/ai-provider ./packages/ai-provider
COPY packages/pbac ./packages/pbac
COPY packages/sisub-domain ./packages/sisub-domain
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

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS sisub
ENV NODE_ENV=production
WORKDIR /app
COPY --from=sisub-build /app/apps/sisub/.output ./.output
USER bun
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]

# =============================================================================
# FORMS
# =============================================================================
FROM deps AS forms-build
ARG VITE_IEFA_SUPABASE_URL
ARG VITE_IEFA_SUPABASE_PUBLISHABLE_KEY
ARG VITE_APP_TENANT=forms
COPY packages/database ./packages/database
COPY apps/forms ./apps/forms
RUN rm -rf apps/forms/.vite apps/forms/.tanstack apps/forms/node_modules/.vite
RUN bun --filter='@iefa/forms' run build
RUN test -f apps/forms/.output/server/index.mjs || \
    (echo "❌ Build failed: output missing" && exit 1)

RUN grep -oE '"(/assets/[^"]+\.(css|js))"' apps/forms/.output/server/index.mjs \
    | tr -d '"' \
    | sort -u \
    | while read asset; do \
        if [ ! -f "apps/forms/.output/public${asset}" ]; then \
          echo "❌ Asset referenced by server but missing from public: ${asset}"; exit 1; \
        fi; \
      done \
    && echo "✅ All server-referenced assets present in public/"

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS forms
ENV NODE_ENV=production
WORKDIR /app
COPY --from=forms-build /app/apps/forms/.output ./.output
USER bun
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]

# =============================================================================
# Projeto α (apps/alpha) — Hono + LangGraph + Bun
# =============================================================================
FROM deps AS alpha-build
COPY packages/alpha-client ./packages/alpha-client
COPY packages/ai-provider ./packages/ai-provider
COPY apps/alpha ./apps/alpha
RUN test -f apps/alpha/src/index.ts || \
    (echo "❌ Alpha entrypoint missing" && exit 1)

FROM base AS alpha
ENV NODE_ENV=production
ENV PORT=8000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=alpha-build /app/apps/alpha ./apps/alpha
USER bun
EXPOSE 8000
CMD ["bun", "apps/alpha/src/index.ts"]

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
