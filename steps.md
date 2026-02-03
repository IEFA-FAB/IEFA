# Passo a Passo da Migração: Docker + Turborepo + Zod

Este documento detalha o plano de execução para migrar o pipeline de build e deploy do projeto IEFA para uma arquitetura baseada em Docker Bake, Turborepo e validação de ambiente com Zod.

## Fase 1: Validação de Ambiente com Zod (2h)

O objetivo é garantir que a aplicação falhe "cedo" se as variáveis de ambiente necessárias não estiverem presentes ou estiverem incorretas.

1.  **Criar pacote `@repo/env`**:
    *   Criar diretório `packages/env`.
    *   Inicializar `packages/env/package.json` com `zod` como dependência.
    *   Configurar `tsconfig.json` para o pacote.

2.  **Implementar Schemas Zod**:
    *   Criar `packages/env/src/iefa.ts`: Schema para o app `iefa`.
    *   Criar `packages/env/src/sisub.ts`: Schema para o app `sisub`.
    *   Criar `packages/env/src/api.ts`: Schema para o app `api`.
    *   Criar `packages/env/src/index.ts`: Exportar todos os schemas.
    *   Implementar função `validateEnv()` que lê `process.env`, valida e encerra o processo com erro legível caso falhe.

3.  **Integrar nos Apps**:
    *   Adicionar `@repo/env` como dependência em `apps/iefa/package.json`, `apps/sisub/package.json` e `apps/api/package.json`.
    *   Ajustar entry points (ou criar script de pré-validação) para invocar a validação antes do init do app.

## Fase 2: Configuração do Turborepo (2h)

Utilizar o Turborepo para orquestrar as tarefas de build, lint, e validação, aproveitando o cache local e remoto.

1.  **Configurar `turbo.json` na raiz**:
    *   Definir pipeline para `build`, `lint`, `typecheck`, `test`.
    *   Criar task `validate-env` que depende de variáveis de ambiente específicas (inputs).

2.  **Atualizar Scripts na Raiz e Apps**:
    *   Raiz `package.json`: Adicionar scripts `build`, `dev`, `lint` que usam `turbo`.
    *   Apps `package.json`: Garantir que os nomes dos scripts (`build`, `dev`) correspondam ao esperado pelo `turbo.json`.

3.  **Verificar Cache**:
    *   Rodar `bun run build` duas vezes e verificar se a segunda execução usa o cache (`FULL TURBO`).

## Fase 3: Dockerfile Multi-stage Unificado (2h)

Substituir os Dockerfiles individuais por um único `Dockerfile` otimizado na raiz, que constrói qualquer app do monorepo.

1.  **Criar `Dockerfile` na raiz**:
    *   **Stage Base**: Imagem Alpine com Bun.
    *   **Stage Deps**: Copia `package.json`, `bun.lock` e `packages/` de todos os workspaces. Roda `bun install`. Este layer é cacheado se as dependências não mudarem.
    *   **Stage Build (por app)**: Ex: `FROM deps AS api-build`. Copia o código fonte do app específico e dependências internas. Roda build via Turbo ou Bun filter.
    *   **Stage Runtime (por app)**: Ex: `FROM base AS api`. Copia apenas os artefatos de build (`dist`, `.output`) e `node_modules` de produção. Define `CMD`.

2.  **Testar Build Local**:
    *   `docker build --target api -t iefa-api .`
    *   `docker build --target iefa -t iefa-client .`

## Fase 4: Orquestração com Docker Bake (1h)

Simplificar o comando de build e push para múltiplas imagens usando HCL.

1.  **Criar `docker-bake.hcl` na raiz**:
    *   Definir grupos (`default`, `apps`).
    *   Definir targets herdando de um `base`.
    *   Configurar tags dinâmicas e registry (`registry.fly.io`).
    *   Configurar secrets para injetar `.env` durante o build (se necessário).

2.  **Validar Bake**:
    *   `docker buildx bake --print` para verificar a configuração.

## Fase 5: GitHub Actions (CI/CD) (2h)

Substituir os workflows atuais por um pipeline limpo que confia no Turbo e no Docker Bake.

1.  **Criar `.github/workflows/deploy.yml`**:
    *   **Job `validate`**: Roda `bunx turbo run validate-env`. Falha rápido se faltar secret no GitHub.
    *   **Job `quality`**: Roda `lint`, `typecheck`, `test` via Turbo.
    *   **Job `build-deploy`**:
        *   Usa `docker/setup-buildx-action`.
        *   Autentica no Fly Registry.
        *   Usa `docker/bake-action` para buildar e pushar as imagens alteradas.
        *   Usa `flyctl deploy` para atualizar os serviços no Fly.io.

## Checklist de Validação Final

- [ ] `bun install` roda limpo na raiz.
- [ ] `turbo run build` funciona localmente e gera cache.
- [ ] Docker builds funcionam localmente para todos os apps.
- [ ] Validação de env falha corretamente se faltar variável.
- [ ] Pipeline do GitHub passa e faz deploy com sucesso.
