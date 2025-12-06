# iefa.Dockerfile

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
# Copia arquivos de configuração do monorepo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copia a estrutura de pastas (necessário para o pnpm entender o workspace)
# Dica: Se possível, copie apenas os package.json internos para otimizar o cache, 
# mas copiar as pastas funciona se o contexto de build for a raiz.
COPY packages ./packages
COPY apps ./apps

# Baixa dependências para o store (cache)
RUN pnpm fetch

# --- Build ---
FROM base AS build
# Restaura o store do estágio anterior
COPY --from=deps /pnpm/store /pnpm/store
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

# Instala dependências (incluindo devDeps para rodar o build)
RUN pnpm install -r --prefer-offline --frozen-lockfile

# Executa o build específico do app 'iefa'
# Isso deve gerar a pasta .output dentro de apps/iefa/
RUN pnpm -F ./apps/iefa build

# Prepara os arquivos para produção usando pnpm deploy
# Isso isola o app e suas dependências de produção em uma pasta ./out
RUN pnpm -F ./apps/iefa deploy --prod ./out

# --- Runtime ---
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# 1. Copia o resultado do 'pnpm deploy' (node_modules limpo + package.json)
COPY --from=build --chown=node:node /repo/out/ ./

# 2. CRÍTICO: Copia a pasta .output gerada pelo TanStack Start
# O 'pnpm deploy' as vezes ignora pastas de build não padrão, então garantimos a cópia manual
COPY --from=build --chown=node:node /repo/apps/iefa/.output ./.output

USER node

EXPOSE 3000

# Roda o servidor gerado pelo Vinxi/TanStack Start diretamente
CMD ["node", ".output/server/index.mjs"]