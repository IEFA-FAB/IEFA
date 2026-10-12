## PR de bootstrap (este change)

### 1. Acesso (pbac, sisub)

- [ ] 1.1 [pbac] Três módulos no `AppModule` (`sisprov-planning`, `sisprov-supply`, `sisprov-admin`) com o comentário no padrão do arquivo (papel, níveis, escopo por OM, hierarquia de apoio)
- [ ] 1.2 [sisub] `SisubModule` em `components/features/global/policies/labels.ts` exclui `sisprov-${string}`
- [ ] 1.3 [docs] Seção dos três módulos em `content/docs/pbac/modulos.mdx` e linhas no Resumo

### 2. Banco (espera o mantenedor)

- [ ] 2.1 [database] Migration `create schema sisprov` com cabeçalho-decisão, grants e default privileges no padrão do sucont, `set_updated_at`, `pgrst.db_schemas` com `sisprov`, `notify pgrst`; sem tabela
- [ ] 2.2 [database] `sisprov` em `SUPABASE_SCHEMAS` (`scripts/supabase-schemas.ts`) e em `schemaFilter` do `drizzle.config.ts`
- [ ] 2.3 [database] Migration `legal_documents_sisprov`: Termos 2.4.0, Privacidade 2.4.0, Cookies 1.7.0, conjunto completo reinserido, SISPROV nas listas de sistemas (pt-BR e en-US) e nas linhas `theme`, `auth_rate_limit`, `fab_remember_email`; `ON CONFLICT DO NOTHING`; cabeçalho com o motivo
- [ ] 2.4 [legal-kit] `sisprov` em `APP_NAMES` de `cookie-inventory.test.ts` ("SISPROV" nos dois idiomas)
- [ ] 2.5 [database] Depois do apply (mantenedor): `db:types`, `db:drizzle:pull`, `audit:rls`

### 3. Domínio

- [ ] 3.1 [sisprov-domain] `package.json` (`@iefa/sisprov-domain`, exports por subpath, deps `@iefa/pbac`, `@iefa/database`, `zod`, `drizzle-orm`), `tsconfig.json` (`library.json`)
- [ ] 3.2 [sisprov-domain] `types/`: `context.ts` (re-export de `@iefa/pbac`), `errors.ts` (`DomainError`, `PermissionDeniedError`, `NotFoundError`, `ValidationError`, `QueryFailedError`), `index.ts`
- [ ] 3.3 [sisprov-domain] `modules.ts`: constantes `SISPROV_PLANNING_MODULE`, `SISPROV_SUPPLY_MODULE`, `SISPROV_ADMIN_MODULE`, `SISPROV_MODULES`, rótulos e níveis válidos por módulo, `GrantTargetSchema` (discriminatedUnion)
- [ ] 3.4 [sisprov-domain] `guards/require-permission.ts`: `requirePermission`, `requireAnyPermission`, `requirePlanning(ctx, level, unitId?)`, `requireSupply(...)`, `requireSisprovAdmin(ctx, level)`, com cobertura por hierarquia de apoio quando `unitId` vier
- [ ] 3.5 [sisprov-domain] `schemas/common.ts` (`unitId`, paginação), `operations/index.ts` vazio com o comentário do que entra no change do catálogo, `utils/index.ts`
- [ ] 3.6 [sisprov-domain] Testes `bun test`: guards (nível, escopo, apoio, deny), `GrantTargetSchema` (par inválido recusado)

### 4. App

- [ ] 4.1 [sisprov] `package.json` (`@iefa/sisprov`, scripts iguais ao rumaer, deps do sisub para os primitivos), `tsconfig.json`, `vite.config.ts` (porta 3004, plugin de nome do CSS), `components.json`, `.env.schema`, `tailwind-lint-baseline.json` zerado
- [ ] 4.2 [sisprov] `src/styles.css` com os tokens, `@theme inline`, `@layer base` (ponteiro, scrollbar) e os sete níveis tipográficos do sisub; `public/` (favicon, fontes Manrope e JetBrains Mono, `manifest.json`, `robots.txt` que nega tudo)
- [ ] 4.3 [sisprov] `STYLE_CONTRACT.md`: adota o do sisub e registra as diferenças (D2 do design)
- [ ] 4.4 [sisprov] `src/components/ui/*` copiados do sisub (button, card, badge, alert, dialog, dropdown-menu, field, input, input-group, label, item, separator, skeleton, spinner, toast, tooltip, sidebar, sheet, select, combobox, empty, section-label, avatar, breadcrumb, scroll-area, kbd, container, tabs, switch, checkbox, textarea, table, popover), `lib/cn.ts`, `lib/utils.ts` (`toNameCase`), `hooks/ui/use-mobile.ts`
- [ ] 4.5 [sisprov] `src/env.ts`, `lib/env.server.ts`, `lib/supabase.ts`, `lib/supabase.server.ts` (clients `sisprov`, `access_control`, `core` read, auth SSR), `lib/auth.server.ts` (gates por papel sobre `createRequestAuth`)
- [ ] 4.6 [sisprov] `src/auth/service.ts`, `auth/recovery-session.ts`, `auth/view/AuthScreen.tsx` (do rumaer, com `useLoginRateLimiter`), `auth/pbac.ts` (query options, `useSisprovAccess`, `requireModules` com `preload`), `hooks/useAuth.ts`, `hooks/useTheme.ts`, `components/themeService.tsx`
- [ ] 4.7 [sisprov] `lib/modules.ts`: registro de navegação dos três módulos (id, módulo PBAC, rótulo, ícone, home, nível mínimo), `accessibleModules`, `findModuleByPath`; `lib/permission-change.ts` (`buildSisprovGrant`, `buildSisprovRevoke`) com teste
- [ ] 4.8 [sisprov] `src/server/`: `auth.fn.ts`, `permissions.fn.ts` (fetch my, search, fetch user, grant, revoke, só módulos `sisprov-*`), `legal.fn.ts`, `database-status.fn.ts`; contrato `server-fn-auth.contract.test.ts` adaptado do sisub (`PUBLIC_SERVER_FNS` com motivo)
- [ ] 4.9 [sisprov] `src/router.tsx`, `client.tsx`, `server.ts` (handler puro), `start.ts` (CSRF), `routes/__root.tsx` (head, `AuthSync`, tema, `DatabaseStatusBanner`, `Toaster`), `components/{DefaultCatchBoundary,NotFound,DatabaseStatusBanner,LegalNotice,AnimatedThemeToggler,UserMenu}.tsx`
- [ ] 4.10 [sisprov] `routes/_public/{route,termos-de-uso,politica-de-privacidade,politica-de-cookies}.tsx`, `routes/auth/{route,index}.tsx`, `routes/index.tsx` (redireciona), `routes/health.tsx`
- [ ] 4.11 [sisprov] `routes/_protected/route.tsx` (guard + cache de permissões + `LegalNotice`), `routes/_protected/hub.tsx` (cards por módulo, `denied`, tela de acesso não concedido), `components/layout/{AppShell,PageHeader,SidebarLegalLinks}.tsx` sobre o primitivo `sidebar`
- [ ] 4.12 [sisprov] `routes/_protected/planning/index.tsx`, `supply/index.tsx`, `admin/index.tsx` com estado vazio honesto (o que vem no próximo change e quando), guard por módulo; `admin/permissoes.tsx` com `components/admin/permissions-manager.tsx` (busca, concessão por par módulo-nível, escopo global ou OM, revogação)
- [ ] 4.13 [sisprov] `routeTree.gen.ts` gerado pelo dev server (nunca à mão); app sobe local com login, hub e as quatro rotas protegidas

### 5. Deploy, infra, inventários

- [ ] 5.1 [root] Entrada `sisprov` em `apps.manifest.json` (nitro, porta 3000, buildArgs `VITE_SISPROV_SUPABASE_URL`, `VITE_SISPROV_SUPABASE_PUBLISHABLE_KEY`); `bun run generate:deploy`; `check:deploy` verde
- [ ] 5.2 [ci] Jobs `check-sisprov`, `build-sisprov`, `deploy-sisprov` no `deploy.yml`, no padrão do rumaer (vars do sisub mapeadas para `VITE_SISPROV_*`, `SISPROV_HEALTH_URL`); `scripts/generate-deploy-artifacts.test.ts` verde
- [ ] 5.3 [infra] `infra/sisprov/{main.tf,variables.tf,backend.tf.example,terraform.tfvars.example,secrets/sisprov.example.json}`; `infra/README.md` lista o serviço
- [ ] 5.4 [root] `knip.json` (workspace `apps/sisprov` e `packages/sisprov-domain`), script `sisprov:dev` no `package.json`
- [ ] 5.5 [root] Linhas do sisprov em `AGENTS.md` (apps e packages), `README.md`, `PRODUCT.md` (tarefa primária e sucesso; tabela de design), `.claude/rules/ui.md`, `LGPD.md` (cobertura por app, "Ao mexer")
- [ ] 5.6 [docs] `content/docs/sisprov/{index.mdx,meta.json}` (o que é, módulos, o que ainda não faz, onde está o plano) e `sisprov` em `content/docs/meta.json`
- [ ] 5.7 [root] `.claude/skills/edge-cases/modules/sisprov-planejamento.md` e `sisprov-almoxarifado.md` com a estrutura e os primeiros casos como hipótese; tabela do `SKILL.md`

### 6. Verificação

- [ ] 6.1 [root] `bun run format:check`, `bun run lint --concurrency=2`, `bun run typecheck --concurrency=2`, `bun run test --concurrency=2`, `bun run check:deploy`, `bun run scan:rules` (se o binário existir)
- [ ] 6.2 [sisprov] App rodando local: login, hub sem grant (mensagem), hub com grant (cards), `/admin` negado redireciona com motivo, rotas legais abrem; screenshots no PR
- [ ] 6.3 [root] PR com o quê e por quê, como verifiquei, risco e rollback, pendências para o mantenedor (aplicar as duas migrations, provisionar infra, primeiro grant `sisprov-admin`); `/code-review` com os achados publicados

## Changes seguintes (fora deste)

- `sisprov-catalog` (F1.1): perfil sobre `core.item`, grade, seeds da cadeia RUMAER do legado, primeira aplicação do glossário.
- `sisprov-demand-groups` (F1.2), `sisprov-size-records` (F1.3 + F1.6, com RIPD e versão da Privacidade), `sisprov-size-curve` (F1.4), `core-sigpes-sync` (F1.5, depende de DEP-D), `sisprov-core-inventory` (Fase N), `sisprov-engine` (Fase 2), `sisprov-distribution` (Fase 3).
