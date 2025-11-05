# Base
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV PNPM_STORE_PATH=/pnpm/store
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate \
  && pnpm config set store-dir $PNPM_STORE_PATH -g
WORKDIR /repo

# Deps: tenha o workspace presente para o pnpm
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm fetch --prod

# Build: usa o store offline
FROM base AS build
COPY --from=deps /pnpm/store /pnpm/store
COPY . .
ARG VITE_SISUB_SUPABASE_URL
ARG VITE_SISUB_SUPABASE_ANON_KEY
ENV VITE_SISUB_SUPABASE_URL=$VITE_SISUB_SUPABASE_URL \
    VITE_SISUB_SUPABASE_ANON_KEY=$VITE_SISUB_SUPABASE_ANON_KEY
RUN pnpm install -r --prefer-offline --frozen-lockfile
RUN pnpm -F ./apps/sisub build
RUN pnpm -F ./apps/sisub deploy --prod ./out

# Runtime
FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/out/ ./
USER node
EXPOSE 3000
CMD ["node", "./build/server/index.js"]