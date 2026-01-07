# sisub.Dockerfile

# --- Base ---
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV PNPM_STORE_PATH=/pnpm/store

# Habilita corepack e prepara pnpm
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate \
  && pnpm config set store-dir $PNPM_STORE_PATH -g

WORKDIR /repo

# --- Deps (Cache de dependências do Monorepo) ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm fetch

# --- Build ---
FROM base AS build
COPY --from=deps /pnpm/store /pnpm/store
COPY . .

# Argumentos de Build específicos do SISUB
ARG VITE_SISUB_SUPABASE_URL
ARG VITE_SISUB_SUPABASE_ANON_KEY

ENV VITE_SISUB_SUPABASE_URL=$VITE_SISUB_SUPABASE_URL \
    VITE_SISUB_SUPABASE_ANON_KEY=$VITE_SISUB_SUPABASE_ANON_KEY

# Instala dependências (incluindo devDeps para o build)
RUN pnpm install -r --prefer-offline --no-frozen-lockfile

# Executa o build do app 'sisub'
RUN pnpm -F ./apps/sisub build

# Prepara os arquivos para produção (node_modules limpo + package.json)
RUN pnpm -F ./apps/sisub deploy --prod ./out

# --- Runtime ---
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

# 1. Copia o resultado do deploy (dependências de prod)
COPY --from=build --chown=node:node /repo/out/ ./

# 2. Copia a pasta .output gerada pelo TanStack Start especificamente do app sisub
COPY --from=build --chown=node:node /repo/apps/sisub/.output ./.output

USER node
EXPOSE 3000

# Roda o servidor gerado diretamente
CMD ["node", ".output/server/index.mjs"]