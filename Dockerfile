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
COPY apps/iefa ./apps/iefa
COPY packages ./packages
# Secret montado em runtime, não fica na imagem
RUN --mount=type=secret,id=env,target=/app/.env \
    set -a && . /app/.env && set +a && \
    bun --filter=iefa run build
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
COPY apps/sisub ./apps/sisub
COPY packages ./packages
RUN --mount=type=secret,id=env,target=/app/.env \
    set -a && . /app/.env && set +a && \
    bun --filter=sisub run build
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
COPY apps/docs ./apps/docs
COPY packages ./packages
RUN bun --filter=docs run build

FROM nginx:alpine AS docs
COPY --from=docs-build /app/apps/docs/dist /usr/share/nginx/html
EXPOSE 80
