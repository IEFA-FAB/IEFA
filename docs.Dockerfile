# docs.Dockerfile

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
COPY packages ./packages
COPY apps ./apps

# Baixa dependências para o store (cache)
RUN pnpm fetch

# --- Build ---
FROM base AS build
# Restaura o store do estágio anterior
COPY --from=deps /pnpm/store /pnpm/store
COPY . .

# Instala dependências (incluindo devDeps para rodar o build)
RUN pnpm install -r --prefer-offline --no-frozen-lockfile

# Executa o build específico do app 'docs'
RUN pnpm -F ./apps/docs build

# --- Runtime (nginx para servir estáticos) ---
FROM nginx:alpine AS runtime

# Copia a build do Astro (pasta dist gerada pelo build)
COPY --from=build /repo/apps/docs/dist /usr/share/nginx/html

# Configuração básica do nginx para SPA/Astro
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]