## Context

O cardápio do sisub modela hoje dois regimes via `kitchen.menu_template.template_type`: `'weekly'` (rotina aplicada ao calendário por `applyTemplate`) e `'event'` (cardápio pontual, montado dia-a-dia, que alimenta o Step 2 da Ata de Registro de Preços). Um `event` **não** é materializado em `daily_menu` — ele existe só como molde de custeio. As exceções previsíveis (lanches de bordo, cafés de reunião) são estruturalmente iguais a eventos, então o caminho de menor risco é **reusar a máquina de eventos** e introduzir um terceiro valor de tipo.

O ponto de tensão é que **`template_type` foi tratado como binário em vários lugares** do código (`x !== 'event'` significando "é semanal"). Introduzir um terceiro valor quebra essa suposição silenciosamente. O mapeamento abaixo é o coração da mudança.

Tipos de refeição (`kitchen.meal_type`) já são extensíveis por cozinha (`kitchen_id` nulo = genérico; não nulo = custom) e referenciados por `daily_menu.meal_type_id` e `menu_template_items.meal_type_id`. O lado diner/rancho é separado e travado em 4 valores por CHECK (`meal_forecasts`/`meal_presences`/`other_presences`) + tipos hardcoded — fora do escopo.

Constraint atual: `CHECK template_type IN ('weekly','event')` em `20260407_procurement_ata.sql:7`.

## Goals / Non-Goals

**Goals:**
- Terceiro regime `exception` reusando editor/snapshot/permissões de eventos.
- Exceções no custeio da Ata, multiplicadas por ocorrências mensais.
- Meal types custom por cozinha (ex.: colação) utilizáveis nos três regimes de produção.
- Substituir toda suposição binária weekly/event por allowlist explícita por tipo.

**Non-Goals:**
- Nenhuma mudança no módulo diner/rancho (previsão/presença), nos CHECK de `meal_forecasts`/`meal_presences`/`other_presences`, nem em `MealKey`/`DayMeals`/`MEAL_TYPES`.
- Não materializar exceções em `daily_menu`/calendário (`applyTemplate`) — como eventos, exceções vivem só como molde de custeio.
- Não criar exceções globais/SDAB (sempre kitchen-scoped).
- Não fazer seed de tipos canônicos (café/almoço/janta/ceia continuam como estão).

## Decisions

### D1 — Terceiro `template_type` vs. flag booleana separada
Adicionar `'exception'` ao enum `template_type`, em vez de uma coluna `is_exception`. Reusa `menu_template`, `menu_template_items`, o editor dia-a-dia, `createBlankTemplate` (que já aceita `templateType` genérico) e as permissões por cozinha. **Alternativa descartada:** tabela/flag separada — duplicaria toda a máquina de eventos sem ganho.

### D2 — Recorrência como coluna em `menu_template`
`expected_monthly_occurrences smallint NULL` em `menu_template`. Semântica só faz sentido para `exception`; para `weekly`/`event` fica nulo e é ignorado. Nulo no custeio = 1 ocorrência. **Alternativa descartada:** tabela de recorrência dedicada — overkill para um escalar.

### D3 — Custeio de exceção distinto do semanal
`mapTemplateWithCounts` (`templates.ts:72-81`) faz média de `headcountOverride` nos dias 1–4 (lógica semanal). Exceção **não** tem semana; custeio = `Σ(comensais_item) × occurrences`. Introduzir cálculo separado por tipo na composição da Ata, sem alterar a média semanal existente.

### D4 — Allowlist explícita substitui binário weekly/event (ripple central)
Todo teste `!== 'event'` que hoje significa "semanal" passa a `=== 'weekly'`, e a Ata ganha um terceiro balde. Sites identificados (verificar todos no apply):
- `routes/.../kitchen/$kitchenId/weekly-menus/index.tsx:32` — `!== "event"` → `=== "weekly"` (senão exceção vaza para semanais).
- `routes/.../kitchen/$kitchenId/suprimentos/new.tsx:28-29` e `suprimentos/$draftId.tsx:30-31` — buckets weekly (`!== "event"`) / event; exceção precisa não cair no bucket weekly.
- `routes/.../unit/$unitId/procurement/new.tsx:165,174` — ARP: `weekly = ==='weekly' || !type`, `event = ==='event'`; adicionar `exception = ==='exception'` como terceiro grupo.
- `types/domain/ata.ts:62-63` — `templateSelections`/`eventSelections` ganham `exceptionSelections`.
- `hooks/data/useTemplates.ts:83,112` — cast `"weekly" | "event"` → incluir `"exception"`.
- `components/features/local/ata/DraftImportBadge.tsx:23` — tratamento de badge por tipo.
- `routes/.../kitchen/$kitchenId/events/index.tsx:31` — `=== "event"` (já correto; confirmar que exceção não aparece).
- `schemas/templates.ts:32,41,57` (Zod) e `test/operations-fixtures.ts:312` — enum/fixtures.

### D5 — Meal types custom: sem schema change
`kitchen.meal_type` já suporta tudo. A mudança é expor/rotear o `MealTypeManager` (nível 2) e garantir isolamento do diner por **omissão** (o diner não lê `meal_type`; nada a fazer além de não introduzir vazamento). CHECK do rancho permanece intocado — isso é uma garantia verificável, não um trabalho.

## Risks / Trade-offs

- **[Suposição binária esquecida em algum site]** → grep exaustivo por `template_type` e por `'event'` no apply; cobrir com o checklist D4; teste de listagem por tipo.
- **[Volume de exceções infla a Ata se cada lanche vira registro]** → `expected_monthly_occurrences` multiplica um molde único; UX orienta "um molde por tipo de lanche/café", não um por ocorrência.
- **[Migration de CHECK em coluna com dados]** → `ALTER` só amplia o conjunto permitido (não invalida linhas existentes); operação segura, sem backfill.
- **[Custeio de exceção divergir do semanal e confundir]** → separar visualmente os três baldes na Ata; rótulos explícitos ("Exceções — N ocorrências/mês").
- **[Regeneração do route tree]** → `routeTree.gen.ts` é auto-gerado; rodar `bun dev` após criar as rotas de exceção.

## Migration Plan

1. Migration única em `packages/database/supabase/migrations/` com timestamp de 14 dígitos:
   - `ALTER TABLE kitchen.menu_template DROP CONSTRAINT ... ; ADD CONSTRAINT ... CHECK (template_type IN ('weekly','event','exception'))`.
   - `ALTER TABLE kitchen.menu_template ADD COLUMN IF NOT EXISTS expected_monthly_occurrences smallint` (+ CHECK `> 0` quando não nulo).
2. `db:push` e `db:types` (regenerar `generated.ts`).
3. Enum Zod + casts TS + rotas + filtros (D4) + custeio (D3) + exposição do MealTypeManager (D5).
4. `bun run check` + `bunx vitest run` verdes antes do merge.
5. **Rollback:** reverter a migration re-restringe o CHECK a `('weekly','event')` e dropa a coluna; nenhuma exceção pré-existente sobrevive (aceitável — feature nova).

## Open Questions

- Exceção deve ter print/DOCX próprio como o cardápio semanal, ou basta o custeio na Ata no MVP? (proposta: fora do MVP)
- `expected_monthly_occurrences` é por-mês fixo ou deveria variar por competência/mês da Ata? (proposta: escalar fixo no molde no MVP; competência-específica como follow-up)
