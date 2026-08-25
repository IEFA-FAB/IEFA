# =============================================================================
# BASE - Alpine com Bun
# GERADO por scripts/generate-deploy-artifacts.ts a partir de apps.manifest.json — não editar à mão.
# Digest centralizado: bump de versão do Bun altera só o manifesto.
# =============================================================================
ARG BUN_IMAGE=oven/bun:1.4.0-alpine@sha256:07235578f79ef8c6f97d94aee7938e76f5cdba5f21ae5dbfdd3d3d38058437eb
FROM ${BUN_IMAGE} AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# =============================================================================
# DEPS - Instala dependências uma vez para todo o monorepo
# =============================================================================
FROM base AS deps
# Todos os workspaces declarados no bun.lock precisam estar presentes para
# `--frozen-lockfile` validar a árvore sem regenerar o lockfile.
COPY package.json bun.lock ./
COPY apps/alpha/package.json ./apps/alpha/
COPY apps/api/package.json ./apps/api/
COPY apps/assignment-selection/package.json ./apps/assignment-selection/
COPY apps/docs/package.json ./apps/docs/
COPY apps/forms/package.json ./apps/forms/
COPY apps/portal/package.json ./apps/portal/
COPY apps/rumaer/package.json ./apps/rumaer/
COPY apps/sisub/package.json ./apps/sisub/
COPY apps/sisub-mcp/package.json ./apps/sisub-mcp/
COPY apps/sucont/package.json ./apps/sucont/
COPY packages/agent-web/package.json ./packages/agent-web/
COPY packages/ai-provider/package.json ./packages/ai-provider/
COPY packages/alpha-client/package.json ./packages/alpha-client/
COPY packages/auth-kit/package.json ./packages/auth-kit/
COPY packages/compras-api/package.json ./packages/compras-api/
COPY packages/database/package.json ./packages/database/
COPY packages/hono-client/package.json ./packages/hono-client/
COPY packages/legal-kit/package.json ./packages/legal-kit/
COPY packages/pbac/package.json ./packages/pbac/
COPY packages/sisub-domain/package.json ./packages/sisub-domain/
COPY packages/supabase-kit/package.json ./packages/supabase-kit/
COPY packages/tsconfig/package.json ./packages/tsconfig/
RUN bun install --frozen-lockfile

# =============================================================================
# API
# o bundle da api importa @iefa/sisub-domain/gtin (utils puros de GTIN) — sem o source do package o bun build não resolve o subpath do workspace
# =============================================================================
FROM deps AS api-build
COPY packages/agent-web ./packages/agent-web
COPY packages/database ./packages/database
COPY packages/legal-kit ./packages/legal-kit
COPY packages/pbac ./packages/pbac
COPY packages/sisub-domain ./packages/sisub-domain
COPY packages/supabase-kit ./packages/supabase-kit
COPY packages/tsconfig ./packages/tsconfig
COPY apps/api ./apps/api
RUN bun --filter='@iefa/api' run build
RUN test -f apps/api/dist/index.js || \
    (echo "❌ Build failed: output missing" && exit 1)

FROM base AS api
ENV NODE_ENV=production
COPY --from=api-build /app/apps/api/dist ./apps/api/dist
COPY --from=api-build /app/apps/api/public ./apps/api/public
USER bun
EXPOSE 3000
CMD ["bun", "apps/api/dist/index.js"]

# =============================================================================
# PORTAL
# =============================================================================
FROM deps AS portal-build
ARG VITE_IEFA_SUPABASE_URL
ARG VITE_IEFA_SUPABASE_PUBLISHABLE_KEY
COPY packages/auth-kit ./packages/auth-kit
COPY packages/database ./packages/database
COPY packages/legal-kit ./packages/legal-kit
COPY packages/supabase-kit ./packages/supabase-kit
COPY packages/tsconfig ./packages/tsconfig
COPY apps/portal ./apps/portal
RUN rm -rf apps/portal/.vite apps/portal/.tanstack apps/portal/node_modules/.vite
RUN bun --filter='@iefa/portal' run build
RUN test -f apps/portal/.output/server/index.mjs || \
    (echo "❌ Build failed: output missing" && exit 1)

# Confere que todo asset CSS/JS citado pelo bundle do servidor existe em public/.
# Pega divergência de hash entre o build SSR e o do cliente ANTES da imagem subir.
RUN grep -oE '"(/assets/[^"]+\.(css|js))"' apps/portal/.output/server/index.mjs \
    | tr -d '"' \
    | sort -u \
    | while read asset; do \
        if [ ! -f "apps/portal/.output/public${asset}" ]; then \
          echo "❌ Asset referenced by server but missing from public: ${asset}"; exit 1; \
        fi; \
      done \
    && echo "✅ All server-referenced assets present in public/"

FROM ${BUN_IMAGE} AS portal
ENV NODE_ENV=production
WORKDIR /app
COPY --from=portal-build /app/apps/portal/.output ./.output
COPY docker/bun-serve-idle-timeout.ts ./docker/bun-serve-idle-timeout.ts
USER bun
EXPOSE 3000
CMD ["bun", "--preload", "./docker/bun-serve-idle-timeout.ts", ".output/server/index.mjs"]

# =============================================================================
# RUMAER
# =============================================================================
FROM deps AS rumaer-build
ARG VITE_RUMAER_SUPABASE_URL
ARG VITE_RUMAER_SUPABASE_PUBLISHABLE_KEY
COPY packages/agent-web ./packages/agent-web
COPY packages/auth-kit ./packages/auth-kit
COPY packages/database ./packages/database
COPY packages/legal-kit ./packages/legal-kit
COPY packages/pbac ./packages/pbac
COPY packages/supabase-kit ./packages/supabase-kit
COPY packages/tsconfig ./packages/tsconfig
COPY apps/rumaer ./apps/rumaer
RUN rm -rf apps/rumaer/.vite apps/rumaer/.tanstack apps/rumaer/node_modules/.vite
RUN bun --filter='@iefa/rumaer' run build
RUN test -f apps/rumaer/.output/server/index.mjs || \
    (echo "❌ Build failed: output missing" && exit 1)

# Confere que todo asset CSS/JS citado pelo bundle do servidor existe em public/.
# Pega divergência de hash entre o build SSR e o do cliente ANTES da imagem subir.
RUN grep -oE '"(/assets/[^"]+\.(css|js))"' apps/rumaer/.output/server/index.mjs \
    | tr -d '"' \
    | sort -u \
    | while read asset; do \
        if [ ! -f "apps/rumaer/.output/public${asset}" ]; then \
          echo "❌ Asset referenced by server but missing from public: ${asset}"; exit 1; \
        fi; \
      done \
    && echo "✅ All server-referenced assets present in public/"

FROM ${BUN_IMAGE} AS rumaer
ENV NODE_ENV=production
WORKDIR /app
COPY --from=rumaer-build /app/apps/rumaer/.output ./.output
COPY docker/bun-serve-idle-timeout.ts ./docker/bun-serve-idle-timeout.ts
USER bun
EXPOSE 3000
CMD ["bun", "--preload", "./docker/bun-serve-idle-timeout.ts", ".output/server/index.mjs"]

# =============================================================================
# SUCONT (HUB SUCONT-4 — acompanhamento contábil)
# =============================================================================
FROM deps AS sucont-build
ARG VITE_SUCONT_SUPABASE_URL
ARG VITE_SUCONT_SUPABASE_PUBLISHABLE_KEY
COPY packages/agent-web ./packages/agent-web
COPY packages/ai-provider ./packages/ai-provider
COPY packages/auth-kit ./packages/auth-kit
COPY packages/database ./packages/database
COPY packages/legal-kit ./packages/legal-kit
COPY packages/pbac ./packages/pbac
COPY packages/supabase-kit ./packages/supabase-kit
COPY packages/tsconfig ./packages/tsconfig
COPY apps/sucont ./apps/sucont
RUN rm -rf apps/sucont/.vite apps/sucont/.tanstack apps/sucont/node_modules/.vite
RUN bun --filter='sucont' run build
RUN test -f apps/sucont/.output/server/index.mjs || \
    (echo "❌ Build failed: output missing" && exit 1)

# Confere que todo asset CSS/JS citado pelo bundle do servidor existe em public/.
# Pega divergência de hash entre o build SSR e o do cliente ANTES da imagem subir.
RUN grep -oE '"(/assets/[^"]+\.(css|js))"' apps/sucont/.output/server/index.mjs \
    | tr -d '"' \
    | sort -u \
    | while read asset; do \
        if [ ! -f "apps/sucont/.output/public${asset}" ]; then \
          echo "❌ Asset referenced by server but missing from public: ${asset}"; exit 1; \
        fi; \
      done \
    && echo "✅ All server-referenced assets present in public/"

FROM ${BUN_IMAGE} AS sucont
ENV NODE_ENV=production
WORKDIR /app
COPY --from=sucont-build /app/apps/sucont/.output ./.output
COPY docker/bun-serve-idle-timeout.ts ./docker/bun-serve-idle-timeout.ts
USER bun
EXPOSE 3000
CMD ["bun", "--preload", "./docker/bun-serve-idle-timeout.ts", ".output/server/index.mjs"]

# =============================================================================
# ASSIGNMENT-SELECTION (escolha de vagas / CPAINT)
# =============================================================================
FROM deps AS assignment-selection-build
ARG VITE_ASSIGNMENT_SELECTION_SUPABASE_URL
ARG VITE_ASSIGNMENT_SELECTION_SUPABASE_PUBLISHABLE_KEY
COPY packages/agent-web ./packages/agent-web
COPY packages/database ./packages/database
COPY packages/legal-kit ./packages/legal-kit
COPY packages/supabase-kit ./packages/supabase-kit
COPY packages/tsconfig ./packages/tsconfig
COPY apps/assignment-selection ./apps/assignment-selection
RUN rm -rf apps/assignment-selection/.vite apps/assignment-selection/.tanstack apps/assignment-selection/node_modules/.vite
RUN bun --filter='@iefa/assignment-selection' run build
RUN test -f apps/assignment-selection/.output/server/index.mjs || \
    (echo "❌ Build failed: output missing" && exit 1)

# Confere que todo asset CSS/JS citado pelo bundle do servidor existe em public/.
# Pega divergência de hash entre o build SSR e o do cliente ANTES da imagem subir.
RUN grep -oE '"(/assets/[^"]+\.(css|js))"' apps/assignment-selection/.output/server/index.mjs \
    | tr -d '"' \
    | sort -u \
    | while read asset; do \
        if [ ! -f "apps/assignment-selection/.output/public${asset}" ]; then \
          echo "❌ Asset referenced by server but missing from public: ${asset}"; exit 1; \
        fi; \
      done \
    && echo "✅ All server-referenced assets present in public/"

FROM ${BUN_IMAGE} AS assignment-selection
ENV NODE_ENV=production
WORKDIR /app
COPY --from=assignment-selection-build /app/apps/assignment-selection/.output ./.output
COPY docker/bun-serve-idle-timeout.ts ./docker/bun-serve-idle-timeout.ts
USER bun
EXPOSE 3000
CMD ["bun", "--preload", "./docker/bun-serve-idle-timeout.ts", ".output/server/index.mjs"]

# =============================================================================
# SISUB
# =============================================================================
FROM deps AS sisub-build
ARG VITE_SISUB_SUPABASE_URL
ARG VITE_SISUB_SUPABASE_PUBLISHABLE_KEY
# Observability — Faro frontend (baked no bundle do cliente em build-time).
# Vazio → faro.client.ts vira no-op silencioso. Não persiste na imagem runtime
# (o estágio de runtime é um FROM separado, não herda estes ARG).
ARG VITE_FARO_COLLECTOR_URL
ARG VITE_FARO_APP_NAME
ARG VITE_FARO_ENVIRONMENT
# Faro sourcemap upload — secret, consumido SÓ pelo vite.config.ts durante o build
# (loadEnv lê este ARG como env). Vazio → build não gera/envia maps. Não vai pra
# imagem runtime nem pro bundle do cliente.
ARG FARO_SOURCEMAP_API_KEY
COPY packages/agent-web ./packages/agent-web
COPY packages/ai-provider ./packages/ai-provider
COPY packages/auth-kit ./packages/auth-kit
COPY packages/database ./packages/database
COPY packages/legal-kit ./packages/legal-kit
COPY packages/pbac ./packages/pbac
COPY packages/sisub-domain ./packages/sisub-domain
COPY packages/supabase-kit ./packages/supabase-kit
COPY packages/tsconfig ./packages/tsconfig
COPY apps/sisub ./apps/sisub
RUN rm -rf apps/sisub/.vite apps/sisub/.tanstack apps/sisub/node_modules/.vite
RUN bun --filter='@iefa/sisub' run build
RUN test -f apps/sisub/.output/server/index.mjs || \
    (echo "❌ Build failed: output missing" && exit 1)

# Confere que todo asset CSS/JS citado pelo bundle do servidor existe em public/.
# Pega divergência de hash entre o build SSR e o do cliente ANTES da imagem subir.
RUN grep -oE '"(/assets/[^"]+\.(css|js))"' apps/sisub/.output/server/index.mjs \
    | tr -d '"' \
    | sort -u \
    | while read asset; do \
        if [ ! -f "apps/sisub/.output/public${asset}" ]; then \
          echo "❌ Asset referenced by server but missing from public: ${asset}"; exit 1; \
        fi; \
      done \
    && echo "✅ All server-referenced assets present in public/"

FROM ${BUN_IMAGE} AS sisub
ENV NODE_ENV=production
WORKDIR /app
COPY --from=sisub-build /app/apps/sisub/.output ./.output
COPY docker/bun-serve-idle-timeout.ts ./docker/bun-serve-idle-timeout.ts
USER bun
EXPOSE 3000
CMD ["bun", "--preload", "./docker/bun-serve-idle-timeout.ts", ".output/server/index.mjs"]

# =============================================================================
# FORMS
# =============================================================================
FROM deps AS forms-build
ARG VITE_IEFA_SUPABASE_URL
ARG VITE_IEFA_SUPABASE_PUBLISHABLE_KEY
ARG VITE_APP_TENANT=forms
COPY packages/agent-web ./packages/agent-web
COPY packages/auth-kit ./packages/auth-kit
COPY packages/database ./packages/database
COPY packages/legal-kit ./packages/legal-kit
COPY packages/supabase-kit ./packages/supabase-kit
COPY packages/tsconfig ./packages/tsconfig
COPY apps/forms ./apps/forms
RUN rm -rf apps/forms/.vite apps/forms/.tanstack apps/forms/node_modules/.vite
RUN bun --filter='@iefa/forms' run build
RUN test -f apps/forms/.output/server/index.mjs || \
    (echo "❌ Build failed: output missing" && exit 1)

# Confere que todo asset CSS/JS citado pelo bundle do servidor existe em public/.
# Pega divergência de hash entre o build SSR e o do cliente ANTES da imagem subir.
RUN grep -oE '"(/assets/[^"]+\.(css|js))"' apps/forms/.output/server/index.mjs \
    | tr -d '"' \
    | sort -u \
    | while read asset; do \
        if [ ! -f "apps/forms/.output/public${asset}" ]; then \
          echo "❌ Asset referenced by server but missing from public: ${asset}"; exit 1; \
        fi; \
      done \
    && echo "✅ All server-referenced assets present in public/"

FROM ${BUN_IMAGE} AS forms
ENV NODE_ENV=production
WORKDIR /app
COPY --from=forms-build /app/apps/forms/.output ./.output
COPY docker/bun-serve-idle-timeout.ts ./docker/bun-serve-idle-timeout.ts
USER bun
EXPOSE 3000
CMD ["bun", "--preload", "./docker/bun-serve-idle-timeout.ts", ".output/server/index.mjs"]

# =============================================================================
# Projeto α (apps/alpha) — Hono + LangGraph + Bun
# =============================================================================
FROM deps AS alpha-build
COPY packages/agent-web ./packages/agent-web
COPY packages/ai-provider ./packages/ai-provider
COPY packages/alpha-client ./packages/alpha-client
COPY packages/database ./packages/database
COPY packages/legal-kit ./packages/legal-kit
COPY packages/supabase-kit ./packages/supabase-kit
COPY packages/tsconfig ./packages/tsconfig
COPY apps/alpha ./apps/alpha
RUN test -f apps/alpha/src/index.ts || \
    (echo "❌ alpha entrypoint missing" && exit 1)

FROM base AS alpha
ENV NODE_ENV=production
ENV PORT=8000
COPY --from=alpha-build /app/package.json ./package.json
COPY --from=alpha-build /app/node_modules ./node_modules
COPY --from=alpha-build /app/packages ./packages
COPY --from=alpha-build /app/apps/alpha ./apps/alpha
USER bun
EXPOSE 8000
CMD ["bun", "apps/alpha/src/index.ts"]

# =============================================================================
# DOCS
# =============================================================================
FROM deps AS docs-build
COPY packages/agent-web ./packages/agent-web
COPY packages/tsconfig ./packages/tsconfig
COPY apps/docs ./apps/docs
RUN rm -rf apps/docs/.vite apps/docs/.tanstack apps/docs/node_modules/.vite
RUN bun --filter='@iefa/docs' run build
RUN test -f apps/docs/.output/server/index.mjs || \
    (echo "❌ Build failed: output missing" && exit 1)

# Confere que todo asset CSS/JS citado pelo bundle do servidor existe em public/.
# Pega divergência de hash entre o build SSR e o do cliente ANTES da imagem subir.
RUN grep -oE '"(/assets/[^"]+\.(css|js))"' apps/docs/.output/server/index.mjs \
    | tr -d '"' \
    | sort -u \
    | while read asset; do \
        if [ ! -f "apps/docs/.output/public${asset}" ]; then \
          echo "❌ Asset referenced by server but missing from public: ${asset}"; exit 1; \
        fi; \
      done \
    && echo "✅ All server-referenced assets present in public/"

FROM base AS docs
ENV NODE_ENV=production
ENV PORT=3003
COPY --from=docs-build /app/apps/docs/.output ./apps/docs/.output
COPY docker/bun-serve-idle-timeout.ts ./docker/bun-serve-idle-timeout.ts
USER bun
EXPOSE 3003
CMD ["bun", "--preload", "./docker/bun-serve-idle-timeout.ts", "apps/docs/.output/server/index.mjs"]

# =============================================================================
# SISUB-MCP — MCP server (bun runtime, HTTP transport)
# Roda o entrypoint TypeScript direto (sem bundle), então a imagem de runtime mantém node_modules + os packages de workspace que ele resolve por symlink.
# =============================================================================
FROM deps AS sisub-mcp-build
COPY packages/database ./packages/database
COPY packages/pbac ./packages/pbac
COPY packages/sisub-domain ./packages/sisub-domain
COPY packages/tsconfig ./packages/tsconfig
COPY apps/sisub-mcp ./apps/sisub-mcp
RUN test -f apps/sisub-mcp/src/index.ts || \
    (echo "❌ sisub-mcp entrypoint missing" && exit 1)

FROM base AS sisub-mcp
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV MCP_PORT=3000
COPY --from=sisub-mcp-build /app/package.json ./package.json
COPY --from=sisub-mcp-build /app/node_modules ./node_modules
COPY --from=sisub-mcp-build /app/packages ./packages
COPY --from=sisub-mcp-build /app/apps/sisub-mcp ./apps/sisub-mcp
USER bun
EXPOSE 3000
CMD ["bun", "apps/sisub-mcp/src/index.ts"]
