# Base com pnpm habilitado
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate

ARG VITE_IEFA_SUPABASE_URL
ARG VITE_IEFA_SUPABASE_ANON_KEY

ENV VITE_IEFA_SUPABASE_URL=$VITE_IEFA_SUPABASE_URL \
    VITE_IEFA_SUPABASE_ANON_KEY=$VITE_IEFA_SUPABASE_ANON_KEY
WORKDIR /repo

FROM base AS build
COPY . /repo/
WORKDIR /repo
RUN pnpm install
RUN pnpm  -w -r --filter './apps/iefa' run build

FROM base AS runtime
COPY --from=build /repo/ /repo
EXPOSE 3000
WORKDIR /repo/apps/iefa/
CMD ["pnpm", "start"]

