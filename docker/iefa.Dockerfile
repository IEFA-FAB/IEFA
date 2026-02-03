# iefa.Dockerfile

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

# Argumentos de Build (Injetados no build time para o Vite/Vinxi)
ARG VITE_IEFA_SUPABASE_URL
ARG VITE_IEFA_SUPABASE_ANON_KEY
ARG VITE_RAG_SUPABASE_URL
ARG VITE_RAG_SUPABASE_SERVICE_ROLE_KEY

ENV VITE_IEFA_SUPABASE_URL=$VITE_IEFA_SUPABASE_URL \
    VITE_IEFA_SUPABASE_ANON_KEY=$VITE_IEFA_SUPABASE_ANON_KEY \
    VITE_RAG_SUPABASE_URL=$VITE_RAG_SUPABASE_URL \
    VITE_RAG_SUPABASE_SERVICE_ROLE_KEY=$VITE_RAG_SUPABASE_SERVICE_ROLE_KEY

# Instala dependências do monorepo
RUN bun install --frozen-lockfile

# Executa o build específico do app 'iefa' com Bun para velocidade
RUN bun --filter='iefa' run build

# --- Runtime Stage (uses Node to avoid memory leak) ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

RUN apk add --no-cache libc6-compat \
    && apk add --no-cache curl unzip \
    && curl -fsSL https://bun.sh/install | bash \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun

# Copia as dependências necessárias para runtime
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages ./packages
COPY --from=build --chown=node:node /repo/apps/iefa/node_modules ./apps/iefa/node_modules
COPY --from=build --chown=node:node /repo/apps/iefa/package.json ./apps/iefa/package.json

# Copia a pasta .output gerada pelo TanStack Start
COPY --from=build --chown=node:node /repo/apps/iefa/.output ./apps/iefa/.output

# Instala as dependências do servidor com binários nativos
# O Nitro cria um package.json traced mas não inclui binários nativos
# Usamos Bun porque ele entende workspace: protocol (npm não entende)
WORKDIR /app/apps/iefa/.output/server
RUN bun install --production \
    && rm -rf /root/.bun/install/cache

WORKDIR /app

USER node

EXPOSE 3000

# Roda o servidor com Node para evitar memory leak do Bun runtime
CMD ["node", "apps/iefa/.output/server/index.mjs"]