## Why

O programa 5S da FAB precisa de uma "cara própria" — uma aplicação com identidade visual institucional e página de boas-vindas explicando a política — para vender a iniciativa internamente. Hoje o `forms` já atende a necessidade funcional (checklists 1S-3S estão em `checklists.json`), mas a estética "Pale Brutalism" do forms genérico não comunica a seriedade/institucionalidade do programa 5S. Ao mesmo tempo, manter duas aplicações com lógica duplicada é inaceitável — bugs precisam ser corrigidos uma vez só.

## What Changes

- **Multi-tenancy no `apps/forms`**: introduzir um `TenantProvider` que detecta o tenant (via env `VITE_APP_TENANT` ou hostname) e fornece tema + filtros ao restante da app
- **Tema 5S**: novo arquivo CSS com design tokens institucionais (cores do programa 5S, radius suave, tipografia mais formal) aplicado condicionalmente quando tenant = `cinco-s`
- **Landing page 5S**: rota `/` alternativa explicando a política 5S (os 5 sensos, metodologia, objetivos), exibida apenas no tenant `cinco-s`
- **Filtragem de conteúdo**: no tenant `cinco-s`, dashboard e listagens mostram apenas questionários marcados como 5S; no tenant `forms` (padrão), tudo aparece normalmente
- **Coluna `tags` na tabela `forms.questionnaire`**: campo `text[]` para classificar questionários (ex: `{5s}`) — base para filtragem por tenant
- **Dois targets Turborepo**: `forms:dev` (porta 3001) e `cinco-s:dev` (porta 3002) — mesmo source, env diferente

## Não-objetivos

- **Não** criar um app separado em `apps/5s` ou `apps/cinco-s` — a solução é single-codebase com multi-tenancy
- **Não** extrair `packages/forms-core` — overhead desnecessário para dois tenants do mesmo app
- **Não** implementar 4S (Seiketsu) e 5S (Shitsuke) como checklists digitais — apenas 1S-3S estão especificados nos anexos
- **Não** alterar a lógica de CRUD, auto-save, respostas ou auth — tudo permanece idêntico entre tenants
- **Não** criar sistema de multi-tenancy genérico/extensível — hardcode de dois tenants (`forms`, `cinco-s`) é suficiente

## Capabilities

### New Capabilities

- `tenant-theming`: Sistema de temas por tenant — CSS vars condicionais, detecção de tenant (env/hostname), `TenantProvider` com contexto React
- `cinco-s-landing`: Página inicial institucional do programa 5S com explicação dos 5 sensos, metodologia e navegação para os checklists
- `questionnaire-filtering`: Filtragem de questionários por tags (coluna `tags text[]` em `forms.questionnaire`), aplicada automaticamente pelo tenant context

### Modified Capabilities

_(Nenhuma capability existente é modificada em requisitos — apenas implementação interna do forms.)_

## Impact

- **App afetada**: `forms`
- **DB**: nova coluna `tags text[]` em `forms.questionnaire` (migration aditiva, não-breaking)
- **Turborepo**: novo target `cinco-s:dev` / `cinco-s:build` no `turbo.json` e `package.json` raiz
- **Deploy**: potencialmente dois deploys do mesmo app (ou um deploy com detecção por hostname) no Fly.io
- **Componentes UI**: nenhum componente novo — apenas override de CSS vars por tenant
- **Checklists.json**: já existe, sem alteração necessária
