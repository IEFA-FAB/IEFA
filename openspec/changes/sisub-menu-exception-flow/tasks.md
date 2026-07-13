## 1. Banco de dados

- [x] 1.1 Criar migration (timestamp 14 dígitos) em `packages/database/supabase/migrations/`: `ALTER TABLE kitchen.menu_template` para `CHECK (template_type IN ('weekly','event','exception'))` (drop + add constraint)
- [x] 1.2 Na mesma migration: `ADD COLUMN IF NOT EXISTS expected_monthly_occurrences smallint` em `kitchen.menu_template`, com CHECK `expected_monthly_occurrences IS NULL OR expected_monthly_occurrences > 0`
- [x] 1.3 Tipos editados à mão (`generated.ts` + `drizzle/schema.ts`) — convenção do repo; `db:push`/`db:types` aplicados no merge
- [x] 1.4 Confirmado: a migration não altera `meal_forecasts`/`meal_presences`/`other_presences` (CHECK do rancho intactos)

## 2. Domain (`packages/sisub-domain`)

- [x] 2.1 Enum Zod `TemplateTypeSchema` = `["weekly","event","exception"]` em `schemas/templates.ts` (aplicado a Create/CreateBlank/Update)
- [x] 2.2 `expectedMonthlyOccurrences` (opcional, inteiro positivo, nullable) nos schemas de create/createBlank/update
- [x] 2.3 Persistir/atualizar `expected_monthly_occurrences` em `createTemplate`/`createBlankTemplate`/`updateTemplate`
- [x] 2.4 `monthly_headcount_total` (Σ comensais × ocorrências, nulo=1) em `mapTemplateWithCounts`, separado da média semanal
- [x] 2.5 Fixtures (`seedTemplate` aceita exception + occurrences) + teste de integração do custeio de exceção

## 3. Rotas de gestão de exceções (`apps/sisub`)

- [x] 3.1 `exceptions/index.tsx` (lista filtrando `template_type === 'exception'` e `kitchen_id === $kitchenId`), guard nível 1 (mesma paridade da lista de eventos)
- [x] 3.2 `exceptions/new.tsx` (clone de `events/new.tsx`, `templateType: 'exception'`, copy "lanche de bordo / café de reunião", campo de ocorrências/mês)
- [x] 3.3 `exceptions/$exceptionId.tsx` (editor reusando MealTypeSection/RecipeSelector) + campo `expected_monthly_occurrences`
- [x] 3.4 `routeTree.gen.ts` regenerado via `bun dev`; entrada "Exceções" (ícone Sandwich) no menu da cozinha em `NavItems.tsx`

## 4. Substituir suposições binárias weekly/event por allowlist (ripple — D4)

- [x] 4.1 `weekly-menus/index.tsx` — `!== "event"` → allowlist `=== "weekly"` (exceção não vaza p/ semanais)
- [x] 4.2 `suprimentos/new.tsx` + `$draftId.tsx` — weekly = `=== "weekly"`; "Refeições Especiais" = event + exception
- [x] 4.3 `useTemplates.ts` — casts incluem `"exception"` + repassam `expectedMonthlyOccurrences`
- [x] 4.4 `DraftImportBadge.tsx` — exceção roteada p/ `eventSelections` (balde "Especiais")
- [x] 4.5 `events/index.tsx` — confirmado `=== "event"` (exceção fica de fora)
- [x] 4.6 Grep exaustivo — nenhum site binário remanescente; `templates.fn.ts` usa os schemas atualizados

## 5. Ata de Registro de Preços — custeio de exceções (D3)

> **Desvio de design (do plano original):** os baldes da Ata (`templateSelections`/`eventSelections`)
> são só agrupamento de UI — o custeio concatena os dois e persiste por `{templateId, repetitions}`,
> type-agnostic (procurement/new.tsx:510). Um 3º array `exceptionSelections` não agrega nada
> funcional. Em vez disso, exceções entram no balde existente "Eventos / Refeições Especiais",
> com `repetitions` pré-preenchido pelas ocorrências mensais. Satisfaz o spec (selecionável +
> custeio = comensais × ocorrências) com muito menos risco.

- [x] 5.1 Exceções agrupadas no balde "Eventos / Refeições Especiais" (sem 3º array); `TemplateWithItemCounts` ganha `monthly_headcount_total`
- [x] 5.2 `procurement/new.tsx` — filtro do Step 2 = `event || exception`; restore de `eventSelections` inclui exceção
- [x] 5.3 Custeio via `repetitions` (multiplicador existente): ao selecionar exceção, `repetitions` default = `expected_monthly_occurrences`
- [x] 5.4 `KitchenTemplateSection` — exceção mostra `~total com./mês (N×)` em vez da média Seg–Qui

## 6. Meal types custom por cozinha (só produção — D5)

- [x] 6.1 Seção "Tipos de Refeição" em `kitchen/$kitchenId/settings.tsx` abre o `MealTypeManager` (além do acesso já existente no PlanningBoard)
- [x] 6.2 Confirmado: editores semanal/evento/exceção usam `useMealTypes(kitchenId)` → tipos custom (colação) aparecem nos três
- [x] 6.3 Confirmado por omissão: diner usa `MEAL_TYPES`/`MealKey` hardcoded + `meal_forecasts.meal` CHECK; nenhuma mudança toca esse caminho

## 7. Verificação e fechamento

- [x] 7.1 Teste de integração: `monthly_headcount_total` só p/ exceção; nulo p/ semanal (`templates.operations.test.ts`)
- [x] 7.2 Teste: exceção 200+100 com. × 30 = 9000; ocorrências nula = 1 (=50); semanal = nulo
- [~] 7.3 `check`: `@iefa/sisub`/`@iefa/database`/`@iefa/sisub-domain` verdes (0 erros). `sucont` falha por drift pré-existente de recharts/AI SDK (não tocado nesta mudança)
- [x] 7.4 `bunx vitest run` (sisub) — 168 passed, 0 falhas (109 integração pulados sem DB)
- [x] 7.5 `react-doctor --scope changed` — "No issues found", 88/100
- [ ] 7.6 Abrir PR (aguardando confirmação p/ push — trabalho sempre por PR, nunca direto na main)
