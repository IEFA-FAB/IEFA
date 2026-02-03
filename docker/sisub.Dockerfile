# sisub.Dockerfile

# --- Build Stage (uses Bun for fast builds) ---
FROM oven/bun:1.3.8-alpine AS base
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

# Argumentos de Build específicos do SISUB
ARG VITE_SISUB_SUPABASE_URL
ARG VITE_SISUB_SUPABASE_ANON_KEY

ENV VITE_SISUB_SUPABASE_URL=$VITE_SISUB_SUPABASE_URL \
    VITE_SISUB_SUPABASE_ANON_KEY=$VITE_SISUB_SUPABASE_ANON_KEY

# Instala dependências do monorepo
RUN bun install --frozen-lockfile

# Executa o build do app 'sisub' com Bun para velocidade
RUN bun --filter='sisub' run build

# --- Runtime Stage (uses Node to avoid memory leak) ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

RUN apk add --no-cache libc6-compat

# Copia as dependências necessárias para runtime
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages ./packages
COPY --from=build --chown=node:node /repo/apps/sisub/node_modules ./apps/sisub/node_modules
COPY --from=build --chown=node:node /repo/apps/sisub/package.json ./apps/sisub/package.json

# Copia a pasta .output gerada pelo TanStack Start
COPY --from=build --chown=node:node /repo/apps/sisub/.output ./apps/sisub/.output

USER node
EXPOSE 3000

# Roda o servidor com Node para evitar memory leak do Bun runtime
CMD ["node", "apps/sisub/.output/server/index.mjs"]