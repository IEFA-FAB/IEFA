# Base com pnpm habilitado
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV PNPM_STORE_PATH=/pnpm/store
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate \
  && pnpm config set store-dir $PNPM_STORE_PATH -g
WORKDIR /repo

# Deps: prepara o store do pnpm (offline cache)
FROM base AS deps
# Copiamos manifestos para permitir o fetch
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Copiamos também os diretórios para que pnpm resolva workspaces corretamente
COPY packages ./packages
COPY apps ./apps
# Pré-baixa dependências em cache. Use --prod se quiser só runtime, mas para build da API precisaremos de dev deps.
RUN pnpm fetch

# Build: instala somente o que a API precisa e compila
FROM base AS build
COPY --from=deps /pnpm/store /pnpm/store
COPY . .
# Instala apenas a API e suas dependências do workspace (com dev deps para compilar TypeScript)
RUN pnpm install -r --prefer-offline --no-frozen-lockfile --filter ./apps/api...
# Build da API
RUN pnpm -F ./apps/api build
# Gera um bundle “deployado” só da API com dependências de produção
RUN pnpm -F ./apps/api deploy --prod ./out

# Runtime: sobe apenas a API
FROM base AS runtime
ENV NODE_ENV=production
ENV API_PORT=3000
WORKDIR /app
# Copia o pacote deployado (contém node_modules de produção + dist + package.json)
COPY --from=build --chown=node:node /repo/out/ ./
USER node
EXPOSE 3000
# Usa o script start da API (que deve chamar "node dist/index.js")
CMD ["pnpm", "start"]