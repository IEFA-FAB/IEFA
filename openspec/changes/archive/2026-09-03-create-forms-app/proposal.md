## Why

O monorepo IEFA não possui um sistema de coleta de dados estruturado. É necessário um app dedicado para criação e resposta de questionários, com auto-save por pergunta, recuperação de estado e envio oficial — separado dos apps existentes para manter isolamento de responsabilidades.

## What Changes

- **Novo app** `forms` em `apps/forms/` com stack idêntica ao `portal` (React 19 + Vite + TanStack Router)
- **Novo schema** `forms` no Supabase com tabelas: `questionnaires`, `sessions`, `questions`, `answers`
- **Autenticação** via Supabase Auth (mesmo padrão do portal)
- **Design system** Pale Brutalism 2026, idêntico ao portal (zero border-radius)
- **Deploy** Fly.io com `fly.toml` próprio
- **Integração** no Turborepo (`turbo.json`) e `package.json` raiz

## Capabilities

### New Capabilities

- `questionnaire-management`: CRUD de questionários com sessões e perguntas (criação e listagem para administradores)
- `questionnaire-answering`: Resposta de questionários com auto-save por pergunta (draft) e envio oficial (sent), com recuperação de estado ao retornar
- `forms-auth`: Login/logout via Supabase Auth, proteção de rotas, sessão persistente

### Modified Capabilities

<!-- Nenhuma capability existente tem requisitos alterados -->

## Não-objetivos

- Não haverá editor visual de questionários nesta versão (criação via SQL/admin)
- Não haverá notificações por e-mail ao enviar respostas
- Não haverá integração com os outros apps (sisub, api, alpha) nesta versão
- Não haverá relatórios ou dashboard de respostas nesta versão

## Impact

- **Apps afetados**: novo app `forms` (não altera apps existentes)
- **Banco de dados**: novo schema `forms` no Supabase (isolado dos schemas `sisub`, `iefa`, `journal`)
- **Turborepo**: `turbo.json` e `package.json` raiz ganham entrada para `forms`
- **Dependências novas**: pacotes já usados no portal (`@base-ui/react`, `@tanstack/react-router`, `@supabase/supabase-js`, `tailwindcss`)
- **Fly.io**: novo app `iefa-forms` no Fly
