## Why

Hoje o cardápio do sisub só modela dois regimes: **rotina semanal** (`template_type='weekly'`) e **evento de grande porte** (`template_type='event'`). Falta o meio-termo de maior volume operacional: as **exceções previsíveis e recorrentes** — em média 30 lanches de bordo e 50 cafés de reunião por mês. Elas não cabem no cardápio semanal (data irregular, refeição única, efetivo pequeno) nem justificam abrir um "evento" pesado, e hoje **não entram na Ata de Registro de Preços**, distorcendo o custeio de compras. Além disso, refeições fora do quarteto fixo café/almoço/janta/ceia (ex.: **colação**) não podem ser planejadas por cozinha, embora o modelo de dados já suporte.

Aplica-se **apenas ao app `sisub`** (módulo cardápio/produção + Ata). Não toca `portal`, `api`, `alpha`, `docs`.

## What Changes

- **Novo `template_type='exception'`** ao lado de `weekly`/`event`, reaproveitando integralmente a máquina de eventos (editor dia-a-dia, snapshot de receita, permissões por cozinha). Migration altera o CHECK de `kitchen.menu_template.template_type`.
- **Rotas dedicadas `/kitchen/$kitchenId/exceptions/*`** (lista, novo, edição) — clone leve das rotas de eventos, com rótulo e copy próprios ("lanche de bordo", "café de reunião").
- **Correção dos filtros binários weekly-vs-event** que hoje presumem só dois tipos, para que exceções não vazem para a lista de cardápios semanais nem para a de eventos.
- **Recorrência mensal na exceção**: novo campo `expected_monthly_occurrences` em `menu_template`, para a Ata **multiplicar** um molde padronizado (ex.: "Lanche de Bordo" × 30/mês) em vez de exigir 30 registros.
- **Exceções entram na Ata de Registro de Preços**: a composição da ARP passa a incluir `template_type IN ('event','exception')`, e o custeio de exceção usa `comensais × ocorrências_mensais` (agregação distinta da média semanal usada por `weekly`).
- **Meal types custom por cozinha (só produção)**: habilitar/expor a criação de tipos de refeição por cozinha (ex.: colação) via o `MealTypeManager` já existente, disponíveis em cardápios semanais, eventos e exceções. **Sem** tocar no lado diner/rancho.

## Capabilities

### New Capabilities
- `menu-exception-flow`: o regime de cardápio de exceção — tipo de template `exception`, CRUD, rotas de gestão e a garantia de que os três regimes (weekly/event/exception) permaneçam mutuamente isolados nas listagens e nos filtros.
- `menu-exception-procurement`: recorrência mensal da exceção e sua entrada no custeio da Ata de Registro de Preços (multiplicação comensais × ocorrências).
- `kitchen-meal-type-customization`: criação e uso de tipos de refeição custom por cozinha no lado produção (café/almoço/janta/ceia continuam canônicos; colação e outros passam a ser possíveis), com isolamento explícito do módulo diner/rancho.

### Modified Capabilities
<!-- Nenhuma: openspec/specs/ está vazio; não há capability formalizada cujos requisitos mudem. -->

## Impact

- **DB (`packages/database`)**: nova migration — (1) `ALTER ... CHECK template_type IN ('weekly','event','exception')` em `kitchen.menu_template`; (2) `ADD COLUMN expected_monthly_occurrences smallint` (nullable) em `kitchen.menu_template`. Rodar `db:types` no merge.
- **Domain (`packages/sisub-domain`)**: enum Zod de `templateType` em `schemas/templates.ts` (+`'exception'`); nova lógica de agregação de custeio para exceções (distinta de `mapTemplateWithCounts`, que hoje faz média de dias úteis).
- **App `sisub`**:
  - Filtros que assumem binário weekly/event: `kitchen/$kitchenId/weekly-menus/index.tsx` (excluir por allowlist `=== 'weekly'`), `kitchen/$kitchenId/events/index.tsx`.
  - Novas rotas `kitchen/$kitchenId/exceptions/{index,new,$exceptionId}.tsx` (route tree regenerado via `bun dev`).
  - Composição da ARP (Step 2) e tabelas de comensais (`components/features/local/ata/*`) passam a incluir e multiplicar exceções.
  - `MealTypeManager` exposto/roteado para gestão de tipos custom por cozinha.
- **Sem impacto** em: schema/CHECK de `meal_forecasts`/`meal_presences`/`other_presences`, tipos `MealKey`/`DayMeals`, constante `MEAL_TYPES`, ou qualquer tela do módulo diner/rancho.
