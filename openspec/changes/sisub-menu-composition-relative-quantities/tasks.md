## 1. Domínio: regra global relativo × local absoluto

- [x] 1.1 [sisub-domain] `assertRelativeOnlyForGlobal` em `operations/templates.ts`, chamado por `createTemplate`, `createBlankTemplate` e `applyTemplateContent` (edição e fork); `DomainError("GLOBAL_TEMPLATE_ABSOLUTE_QUANTITY")` com mensagem para a tela e a tool
- [x] 1.2 [sisub-domain] `forkTemplate` e o fork de `saveTemplateEdit`: origem global não copia pax, `menu_template_meal`, `base_headcount` nem ocorrências; origem local copia tudo
- [x] 1.3 [sisub-domain] `ForkTemplateSchema.occasionMealIds` (evento e apoio): copia só as refeições escolhidas e os itens delas
- [x] 1.4 [sisub-domain] Testes de operação: global recusa cada absoluto (4 campos × 3 regimes); fork global chega sem absolutos; fork local mantém; fork com refeições escolhidas

## 2. Domínio: composição de evento e apoio

- [x] 2.1 [sisub-domain] Nomes neutros (`OccasionMeal`, `resolveOccasionContent`, `fetchOccasionMeals`) com alias deprecado dos antigos; `resolveEventContent` passa a valer para `apoio`
- [x] 2.2 [sisub-domain] `TemplateEventMealSchema.groups`: mínimo 0 no apoio, 1 no evento; `MenuGroupSchema` com `minItems`/`maxItems` opcionais (0–50, mín ≤ máx)
- [x] 2.3 [sisub-domain] Padrão de lanche: servidor fixa o horário de sistema em toda refeição; grupos sugeridos de "Lanche" e "Refeição" em `schemas/menu-groups.ts`
- [x] 2.4 [sisub-domain] `summarizeTemplateDemand`: média de dias úteis só com semanal (E4); apoio soma por refeição × ocorrências
- [x] 2.5 [sisub-domain] Testes: apoio com duas refeições; item de apoio sem refeição recusado; contagem inválida recusada; contagem fora do esperado salva

## 3. Domínio: proporção como quantidade relativa única

- [x] 3.1 [sisub-domain] `RecommendedProportionSchema` com teto por regime (300 semanal/evento, 1000 apoio); `resolveItemDemand` com parâmetro de arredondamento (`round` padrão, `ceil` no apoio)
- [x] 3.2 [sisub-domain] `utils/snack-kit.ts` e `buildStandardSnapshots`: porções por kit = proporção ÷ 100, somando as refeições do kit
- [x] 3.3 [sisub-domain] `addToProduction`: porções = ceil(kits × proporção ÷ 100) por (padrão × preparação)
- [x] 3.4 [sisub-domain] Ajustar `snack-requests.operations.test.ts` e `templates.operations.test.ts` à semântica nova; cenário "2 sanduíches × 15 kits = 30" e "0,5 × 3 = 2"

## 4. Domínio: efetivo na aplicação e depois dela

- [x] 4.1 [sisub-domain] `ApplyTemplateSchema.headcounts` (por tipo de refeição) e `ApplyEventTemplateSchema.headcounts` (por refeição do cardápio); informado vence o do modelo, sem gravar no modelo
- [x] 4.2 [sisub-domain] `applyTemplate`/`applyEventTemplate`: sem efetivo grava `forecasted_headcount` nulo; tirar o fallback "média dos pax como efetivo" do `applyTemplate` (`templates.ts:1169`)
- [x] 4.3 [sisub-domain] `updateHeadcount`: com efetivo antigo nulo, calcula as porções nulas pela proporção
- [x] 4.4 [sisub-domain] Pendência "efetivo a definir" no resumo do calendário e no fluxo da cozinha (`lib/flows`)
- [x] 4.5 [sisub-domain] Testes: semanal global aplicado com 800; aplicado sem efetivo e completado depois; apoio aplicado com 100 kits

## 5. Domínio: estimativa e previsão

- [x] 5.1 [sisub-domain] Estimativa: evento e apoio medem pela refeição própria, apoio arredonda para cima (o aviso de efetivo fica no fluxo, D9)
- [x] 5.2 [sisub-domain] Estimativa e previsão recusam modelo global (`GLOBAL_TEMPLATE_NEEDS_ADAPTATION`)
- [x] 5.3 [sisub-domain] `procurement-flows`: aviso "cardápio sem efetivo" ao lado de "apoio sem ocorrências"; teste em `lib/flows/flows.test.ts`

## 6. Banco (espera o mantenedor)

- [x] 6.1 [database] Migration `kitchen_menu_relative_quantities`: limpeza dos absolutos globais; CHECK de ocorrências; gatilhos em `menu_template_items`, `menu_template_meal` e `menu_template_event_meal` (`search_path = ''`)
- [x] 6.2 [database] Mesma migration: teto 1000 no `recommended_proportion`; backfill do apoio para refeições próprias; padrões de lanche `headcount_override × 100 → recommended_proportion`; comentários
- [ ] 6.3 [database] `audit:rls` verde; conferir carimbo contra o remoto; `db:types` + Drizzle pull
- [x] 6.4 [sisub] Teste de integração: escrita direta de absoluto em modelo global recusada pelo banco

## 7. Telas

- [x] 7.1 [sisub] `OccasionMenuEditor`: apoio com refeições próprias (tirar o ramo `isEvent` da estrutura); refeição "Kit" sem grupos mostra lista
- [x] 7.2 [sisub] Cabeçalho do grupo com "n de m" e aviso; diálogo da refeição edita mínimo e máximo
- [x] 7.3 [sisub] Editores globais de evento e apoio escondem pax, efetivo e ocorrências (como o semanal global); `OccasionMenuForm` sem ocorrências no global
- [x] 7.4 [sisub] Apoio mostra a proporção como "porções por kit" (decimal); evento e semanal seguem em %
- [x] 7.5 [sisub] Diálogo "Adaptar": escolha das refeições; texto novo sobre o que a cópia leva
- [x] 7.6 [sisub] `ApplyTemplateDialog` e `DayOccasionDialog`/`ApplyEventDialog`: campos de efetivo por refeição (kits no apoio), preenchidos do modelo local, vazios no global
- [x] 7.7 [sisub] Calendário e "Neste dia": selo "efetivo a definir" (o aviso de preparação sem efetivo ficou no fluxo da cozinha, D9)
- [x] 7.8 [sisub] Editor semanal local passa o efetivo ao `MealGroupBoard` para mostrar o pax derivado da % (como o evento)

## 8. Tools de IA e MCP

- [x] 8.1 [sisub-domain] `agentGetTemplateItems` devolve o efetivo da refeição (`meal_headcount`); tool de chat `apply_template` aceita `headcounts`
- [x] 8.2 [sisub-mcp] Descrições de `create_template`, `update_template`, `apply_template`, `apply_event_template` e das tools de chat equivalentes: global só relativo; `headcounts` na aplicação

## 9. Catálogo de edge cases e specs

- [x] 9.1 [sisub] `catalogo-global.md`: CG-EVT-01 atualizado, CG-QTD-01 e CG-PAD-01 novos, com a cobertura
- [x] 9.2 [sisub] `gestao-cozinha.md`: GC-AGD-01 atualizado, GC-AGD-15 e GC-PRV-05 novos
- [x] 9.3 [sisub] `pedidos-de-lanche.md`: PL-PAD-01 novo
- [ ] 9.4 [sisub] E2E: adaptar o padrão B só com o coquetel; aplicar semanal global sem efetivo e completar depois

## 10. Fechamento

- [x] 10.1 [root] `bun run check`, `bun run lint --concurrency=2`, `bun run test --concurrency=2`
- [ ] 10.2 [sisub] Depois do merge e da migration: SDAB cadastra os padrões de evento A/B/C pelo catálogo global (conteúdo, não código)
