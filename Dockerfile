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
RUN bun --filter='@iefa/api' run build

FROM base AS api
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=api-build /app/apps/api ./apps/api
COPY --from=api-build /app/packages ./packages
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
ARG VITE_RAG_SUPABASE_SERVICE_ROLE_KEY

# Copy source files (deps already has packages and installed node_modules)
COPY turbo.json ./
COPY tsconfig.json ./
COPY apps/iefa ./apps/iefa

# Clear any local cache
RUN rm -rf apps/iefa/.vite apps/iefa/.tanstack apps/iefa/node_modules/.vite

# Build with environment variables available to Vite
RUN bun --filter='@iefa/portal' run build
# Validação: output existe?
RUN test -f apps/iefa/dist/server/server.js || \
    (echo "❌ Build failed: output missing" && exit 1)

FROM oven/bun:1.3.8-alpine AS iefa
ENV NODE_ENV=production
WORKDIR /app
# Copy the complete Nitro output (includes bundled node_modules)
COPY --from=iefa-build /app/apps/iefa/dist ./dist
USER bun
EXPOSE 3000
CMD ["bun", "dist/server/server.js"]

# =============================================================================
# SISUB
# =============================================================================
FROM deps AS sisub-build
# Build-time environment variables for Vite
ARG VITE_SISUB_SUPABASE_URL
ARG VITE_SISUB_SUPABASE_ANON_KEY

# Copy source files (deps already has packages and installed node_modules)
COPY turbo.json ./
COPY tsconfig.json ./
COPY apps/sisub ./apps/sisub

# Clear any local cache
RUN rm -rf apps/sisub/.vite apps/sisub/.tanstack apps/sisub/node_modules/.vite

# Build with environment variables available to Vite
RUN bun --filter='@iefa/sisub' run build
RUN test -f apps/sisub/dist/server/server.js || \
    (echo "❌ Build failed: output missing" && exit 1)

FROM oven/bun:1.3.8-alpine AS sisub
ENV NODE_ENV=production
WORKDIR /app
# Copy the complete Nitro output (includes bundled node_modules)
COPY --from=sisub-build /app/apps/sisub/dist ./dist
USER bun
EXPOSE 3000
CMD ["bun", "dist/server/server.js"]

# =============================================================================
# DOCS
# =============================================================================
FROM deps AS docs-build
COPY tsconfig.json ./
COPY apps/docs ./apps/docs
COPY packages ./packages
RUN bun --filter='@iefa/docs' run build

FROM nginx:alpine AS docs
COPY --from=docs-build /app/apps/docs/dist /usr/share/nginx/html
EXPOSE 80
