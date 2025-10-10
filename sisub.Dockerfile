# Etapa base com pnpm via corepack
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate
WORKDIR /repo

# Instalação de deps com cache eficiente (só package.jsons primeiro)
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/sisub/package.json apps/sisub/
COPY packages/auth/package.json packages/auth/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --no-frozen-lockfile

# Build do monorepo (ex.: pnpm build na raiz)
FROM base AS build
COPY --from=deps /repo/node_modules /repo/node_modules
COPY . .
RUN pnpm -w -r --filter ./apps/* run build

# Gera um pacote de deploy só com o sisub e deps de produção
# Requer pnpm >= 8
FROM base AS deploy
COPY --from=build /repo /repo
RUN pnpm --filter ./apps/sisub... --prod deploy /out

# Runtime enxuto
FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=deploy /out/* .
ENV NODE_ENV=production
EXPOSE 3000

# Se o seu "start" está no package.json de apps/sisub
WORKDIR /app
CMD ["npm", "start"]