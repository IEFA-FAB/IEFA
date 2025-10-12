# Base com pnpm habilitado
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate
WORKDIR /repo

FROM base AS build
COPY . /repo/
WORKDIR /repo
RUN pnpm install
RUN pnpm build

FROM base AS runtime
COPY --from=build /repo/ /repo
EXPOSE 3000
WORKDIR /repo/apps/iefa/
CMD ["pnpm", "start"]

