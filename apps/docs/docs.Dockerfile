# docs.Dockerfile
# Standalone Astro/Starlight app - não depende do monorepo

# --- Base ---
FROM oven/bun:1.3.6-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# --- Build ---
FROM base AS build

# Copia package.json
COPY package.json ./

# Instala dependências
RUN bun install --no-save

# Copia o código fonte
COPY . .

# Build da aplicação Astro
RUN bun run build

# --- Runtime (nginx para servir estáticos) ---
FROM nginx:alpine AS runtime

# Copia a build do Astro (pasta dist gerada pelo build)
COPY --from=build /app/dist /usr/share/nginx/html

# Configuração básica do nginx para servir Astro/Starlight
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html =404; \
    } \
    # Compressão gzip \
    gzip on; \
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript; \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]