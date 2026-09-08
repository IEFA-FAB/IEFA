## 1. Database — Coluna tags

- [x] 1.1 [database] Criar migration `ALTER TABLE forms.questionnaire ADD COLUMN tags text[] NOT NULL DEFAULT '{}'` com índice GIN em `packages/database/supabase/migrations/`
- [x] 1.2 [database] Executar migration no Supabase local e regenerar tipos TS (`bun run db:types`)

## 2. Tenant Provider

- [x] 2.1 [forms] Criar `src/lib/tenant.tsx` com tipo `Tenant`, constantes `TENANTS`, `TenantProvider` e hook `useTenant()`
- [x] 2.2 [forms] Validar `VITE_APP_TENANT` no `src/env.ts` (client-side) com Zod — valores aceitos: `"forms"`, `"cinco-s"`, default `"forms"`
- [x] 2.3 [forms] Envolver app no `TenantProvider` em `src/routes/__root.tsx` — ler `import.meta.env.VITE_APP_TENANT`
- [x] 2.4 [forms] Definir `data-tenant` no elemento `<html>` baseado no tenant ativo (dentro do `__root.tsx`)

## 3. Tema 5S (CSS)

- [x] 3.1 [forms] Criar `src/styles/cinco-s.css` com overrides de CSS vars sob seletor `[data-tenant="cinco-s"]` — paleta azul-verde institucional, radius `0.5rem`, sombras suaves, tracking menos agressivo
- [x] 3.2 [forms] Importar `cinco-s.css` no `src/styles.css` (após os tokens base)
- [x] 3.3 [forms] Testar visual: abrir `cinco-s:dev` e verificar que Card, Button, Input, Badge, Sidebar renderizam com o novo tema sem quebra

## 4. Landing Page 5S

- [x] 4.1 [forms] Criar componente `src/components/cinco-s/Landing.tsx` com seções: hero 5S, os 5 sensos (Seiri, Seiton, Seiso, Seiketsu, Shitsuke), contexto institucional FAB, CTAs de login/cadastro
- [x] 4.2 [forms] Modificar `src/routes/index.tsx` para renderizar condicionalmente: `useTenant().id === "cinco-s"` → `React.lazy(() => import(...Landing))`, senão `Home` atual
- [x] 4.3 [forms] Atualizar `head()` da rota `/` para refletir título/meta do tenant ativo

## 5. Filtragem de Questionários

- [x] 5.1 [forms] Atualizar `getQuestionnairesFn` em `src/server/forms.fn.ts` — aceitar parâmetro opcional `tags: z.array(z.string()).optional()` e filtrar com `.contains('tags', tags)` quando presente
- [x] 5.2 [forms] Atualizar `createQuestionnaireFn` — aceitar parâmetro opcional `tags` e incluí-lo no insert
- [x] 5.3 [forms] Criar hook wrapper `useQuestionnaires()` em `src/hooks/useQuestionnaires.ts` que injeta automaticamente `tagFilter` do tenant na query
- [x] 5.4 [forms] Atualizar `src/routes/_authenticated/dashboard.tsx` — usar `useQuestionnaires()` em vez de chamar `getQuestionnairesFn` direto
- [x] 5.5 [forms] No tenant `"forms"`, exibir badge "5S" ao lado do título de questionários que possuem tag `"5s"`

## 6. Criação automática de tags por tenant

- [x] 6.1 [forms] Na rota/componente de criação de questionário (`questionnaires/new.tsx`), injetar tags do tenant ao chamar `createQuestionnaireFn` — no `"cinco-s"` envia `tags: ["5s"]`, no `"forms"` envia `tags: []`

## 7. Scripts Turborepo

- [x] 7.1 [root] Adicionar script `"cinco-s:dev": "VITE_APP_TENANT=cinco-s bun --cwd ./apps/forms dev -- --port 3002"` no `package.json` raiz
- [x] 7.2 [root] Testar que `bun run forms:dev` (porta 3001) e `bun run cinco-s:dev` (porta 3002) rodam simultaneamente sem conflito

## 8. Validação Final

- [ ] 8.1 [forms] Teste end-to-end manual: criar questionário no tenant cinco-s → verificar tag salva → verificar visível no forms genérico com badge → verificar não aparece sem tag no cinco-s
- [x] 8.2 [forms] Verificar lazy loading: no tenant forms, confirmar que o chunk da landing 5S não é carregado (Network tab)
- [x] 8.3 [root] Executar `bun run check` (Biome + typecheck) — zero erros
