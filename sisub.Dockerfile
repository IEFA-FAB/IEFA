# Etapa base com pnpm habilitado e cache da store
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate
WORKDIR /repo

# Etapa de deps (aproveita cache com pnpm fetch só com o lockfile)
FROM base AS deps
# Copie apenas os arquivos necessários para resolver dependências
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
# Se tiver package.json na raiz, copie também
COPY package.json ./
# Se for monorepo, opcionalmente copie os package.json de cada workspace:
# COPY apps/**/package.json packages/**/package.json ./
# Baixa o conteúdo da store baseado no lockfile (não instala ainda)
RUN pnpm fetch

# Etapa de build (instala offline usando a store, constrói SSR)
FROM base AS build
ARG VITE_SISUB_SUPABASE_URL
ARG VITE_SISUB_SUPABASE_ANON_KEY
ENV VITE_SISUB_SUPABASE_URL=$VITE_SISUB_SUPABASE_URL \
    VITE_SISUB_SUPABASE_ANON_KEY=$VITE_SISUB_SUPABASE_ANON_KEY
COPY . .
# Instala offline e travado no lockfile (rápido e reprodutível)
RUN pnpm install -r --offline --frozen-lockfile
# Se sua app está em apps/sisub, limite o build a ela e dependências
RUN pnpm -F apps/sisub build
# Cria um bundle de produção sem symlinks, só com o necessário p/ runtime
# Isso inclui node_modules prunados e artefatos buildados
RUN pnpm -F apps/sisub deploy --prod /out

# Etapa final de runtime (mínimo possível)
FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

# Copia o bundle pronto do deploy e ajusta ownership p/ usuário não-root
COPY --from=build --chown=node:node /out/ ./

# Opcional: se sua app escrever em alguma pasta, garanta permissões:
# RUN mkdir -p /app/tmp && chown -R node:node /app/tmp

USER node
EXPOSE 3000

# Evite depender do pnpm no runtime; chame o entrypoint direto
# Ajuste o caminho do servidor SSR conforme o seu build gera:
# Exemplos comuns: dist/server/index.js ou build/server.js
CMD ["node", "./build/server/index.js"]