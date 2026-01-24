# api.Dockerfile

# --- Base ---
FROM oven/bun:1.3.6-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /repo

# --- Deps (Cache de dependências do Monorepo) ---
FROM base AS deps
COPY bun.lock package.json ./
COPY packages ./packages
COPY apps ./apps
RUN bun install --frozen-lockfile --no-save

# --- Build ---
FROM base AS build
COPY --from=deps /root/.bun /root/.bun
COPY . .

# Instala dependências do monorepo
RUN bun install --frozen-lockfile

# Build da API
RUN bun --filter='api' run build

# --- Runtime ---
FROM oven/bun:1.3.6-alpine AS runtime
ENV NODE_ENV=production
ENV API_PORT=3000
WORKDIR /app

RUN apk add --no-cache libc6-compat

# Copia as dependências necessárias para runtime
COPY --from=build --chown=bun:bun /repo/node_modules ./node_modules
COPY --from=build --chown=bun:bun /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=bun:bun /repo/apps/api/src ./apps/api/src

USER bun
EXPOSE 3000

# Roda o servidor API com bun (direto do TS)
CMD ["bun", "apps/api/src/index.ts"]