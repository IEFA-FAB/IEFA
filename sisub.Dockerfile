# Base com pnpm habilitado e store configurado
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Defina um store persistente e conhecido para copiar entre etapas
ENV PNPM_STORE_PATH=/pnpm/store
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate \
  && pnpm config set store-dir $PNPM_STORE_PATH -g
WORKDIR /repo

# Etapa de deps: baixa tarballs para o store com base no lockfile e manifests
FROM base AS deps
# Copie lockfile + manifests necessários do monorepo (sem trazer o repo todo)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Copie apenas os manifests dos workspaces (ajuste os paths conforme seu repo)
# Se tiver mais pastas (ex.: packages/*), adicione-as aqui também
COPY apps/sisub/package.json apps/sisub/package.json
# Caso existam outros workspaces, copie seus package.json:
# COPY apps/algum-outro/*/package.json apps/algum-outro/*/package.json
# COPY packages/**/package.json packages/**/package.json

# Baixa para o store todos os pacotes referenciados no lockfile/workspaces
# (não instala node_modules ainda)
RUN pnpm fetch --prod

# Etapa de build: instala offline a partir do store e constrói SSR
FROM base AS build
# Traga o store baixado na etapa deps
COPY --from=deps /pnpm/store /pnpm/store

# Copie o código-fonte completo só agora (melhor uso de cache)
COPY . .

# Variáveis VITE apenas em build-time (SSR + cliente)
ARG VITE_SISUB_SUPABASE_URL
ARG VITE_SISUB_SUPABASE_ANON_KEY
ENV VITE_SISUB_SUPABASE_URL=$VITE_SISUB_SUPABASE_URL \
    VITE_SISUB_SUPABASE_ANON_KEY=$VITE_SISUB_SUPABASE_ANON_KEY

# Instalação offline baseada no store e travada no lockfile (rápido e determinístico)
RUN pnpm install -r --offline --frozen-lockfile

# Constrói apenas o app SSR e dependências (ajuste o filtro se necessário)
RUN pnpm -F apps/sisub build

# Cria bundle de runtime mínimo (sem devDeps/symlinks)
RUN pnpm -F apps/sisub deploy --prod /out

# Etapa final de runtime: mínima e segura
FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

# Copia o bundle já pronto
COPY --from=build --chown=node:node /out/ ./

USER node
EXPOSE 3000

# Ajuste o entrypoint conforme seu build SSR gera (exemplos comuns abaixo)
# Se seu start script cuida disso, mantenha pnpm start (precisa corepack).
# Recomendo chamar node direto no entry do SSR para evitar trazer pnpm pro runtime.
# Exemplo 1: node direto:
CMD ["node", "./dist/server/index.js"]
# Exemplo 2 (se preferir pnpm no runtime):
# RUN corepack enable && corepack prepare pnpm@10.20.0 --activate
# CMD ["pnpm", "start"]