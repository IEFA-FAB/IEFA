## 0. Decisões (respondidas em 2026-09-22)

- [x] 0.1 [design] Q1 — todo comensal pede
- [x] 0.2 [design] Q4 — validade 24 h, kcal por kit
- [x] 0.3 [design] Q5 — material derivado das pessoas, editável
- [x] 0.4 [design] Q3 — pedido aceito entra no quadro de produção, discriminado (D8)

## 1. Calculadora (independe de banco — começar por aqui)

- [x] 1.1 [sisub-domain] `utils/snack-entitlement.ts`: `calculateSnackEntitlement` com as regras R-A…R-P, janelas de refeição padrão (N6) e ids de regra no resultado
- [x] 1.2 [sisub-domain] Testes de fronteira: 2 h, 3 h, 4 h, 6 h, 8 h, 15 h, 24 h, 30 h; R-B2 dentro e fora da janela; R-B3 operacional x não; R-V1/R-V2; R-P
- [x] 1.3 [sisub-domain] `schemas/snack.ts`: schema Zod da entrada da missão, compartilhado entre tela e servidor

## 2. Banco

- [x] 2.1 [database] Migration: colunas de padrão em `kitchen.menu_template` (`snack_family`, `snack_class`, `snack_variant`, `requires_galley`, `requires_oven`, `reviewed_at`, `shelf_life_hours`, `orderable`) + CHECKs (só em exceção; C só em bordo)
- [x] 2.2 [database] Migration: `kitchen.snack_request`, `snack_request_line`, `snack_request_event`, `snack_request_material`; RLS ligada, sem policy de cliente; índices por `(kitchen_id, pickup_at)` e `(requested_by, created_at)`
- [x] 2.3 [database] Trigger em `snack_request_line`: padrão pedível e da mesma cozinha da requisição
- [x] 2.4 [sisub-domain] Transição em transação Drizzle com `for update` + evento (substitui a função SQL prevista — ver D3)
- [ ] 2.5 [database] `audit:rls` verde (nenhum grant novo a cliente); conferir carimbo contra o remoto antes de aplicar
- [x] 2.6 [database] `db:types` + Drizzle pull (`schema.ts`/`relations.ts`)
- [x] 2.7 [sisub] Incluir as 4 tabelas no contrato de reset de treino (`training.operations.test.ts`)

## 3. Padrões de lanche

- [x] 3.1 [sisub-domain] kcal por porção/kit no servidor (`utils/snack-kit.ts` + `loadEnergyPer100g`), mesma heurística de gramas do `useRecipeNutrition`
- [x] 3.2 [sisub-domain] `templates.ts`: aceitar/retornar a classificação; `kcal_per_kit` e faixa da classe no mapeamento
- [ ] 3.3 [sisub] `OccasionMenuForm`/`OccasionMenuEditor`: bloco "Padrão de lanche", rótulos "Porções por kit"/"Kits por mês", aviso de faixa calórica e de revisão vencida
- [x] 3.4 [sisub] Teste: Ata com padrão de lanche mantém `Σ porções × kits/mês × vigência`; comentário em `ata.ts` sobre a semântica

## 4. Pedido no Comensal

- [x] 4.1 [sisub-domain] `operations/snack-requests.ts`: `createSnackRequest`, `updateSnackRequest` (só `submitted`), `cancelSnackRequest`, `listMySnackRequests`, `getMySnackRequest`, `listOrderableStandards(kitchenId)`; requisitante da sessão, snapshot da calculadora recalculado no servidor
- [x] 4.2 [sisub-domain] Validações: ordem de missão em aérea, antecedência de 24 h + `late_reason`, divergência + `divergence_reason`, não militar + motivo
- [x] 4.3 [sisub-domain] `snack-requests.authz.test.ts`: IDOR de leitura/cancelamento, `requestedBy` forjado, padrão de outra cozinha
- [x] 4.4 [sisub] `server/snack-requests.fn.ts` (`.validator(z.object(...))`) + entradas no `assurance-registry.ts`
- [ ] 4.5 [sisub] Rota `/diner/snack-requests` (lista + cancelar)
- [ ] 4.6 [sisub] Rota `/diner/snack-requests/new`: passo missão (cozinha default do refeitório padrão)
- [ ] 4.7 [sisub] Passo calculadora ao vivo com regra citada por linha e alerta de antecedência
- [ ] 4.8 [sisub] Passo padrões: filtro pela sugestão, quantidades pré-preenchidas pela dotação, resumo e envio
- [ ] 4.9 [sisub] Detalhe com linha do tempo + impressão do Anexo E
- [x] 4.10 [sisub] NavItems (diner "Pedido de Lanche") + `breadcrumbs.ts`

## 5. Gestão Cozinha

- [x] 5.1 [sisub-domain] `listKitchenSnackRequests`, `getKitchenSnackRequest` (`kitchen:1`), `decideSnackRequest` (`kitchen:2`, valor obrigatório no aceite, ajuste de pax opcional), `advanceSnackRequest` (`requireKitchenFloorWrite`, amostra obrigatória para `ready`), `registerPickup` + cautela, `registerMaterialReturn`, `closeSnackRequest`; cozinha lida da linha
- [x] 5.2 [sisub-domain] `buildSnackProductionSummary(kitchenId, date)`: kits → porções por preparação → material, com origens
- [x] 5.3 [sisub-domain] Teste de integração da função de transição: concorrência aceite x recusa, transição inválida, evento gravado
- [x] 5.4 [sisub] `server/kitchen-snack-requests.fn.ts` + `assurance-registry.ts`
- [ ] 5.5 [sisub] Rota `/kitchen/$kitchenId/snack-requests` (fila, filtros, marcas)
- [ ] 5.6 [sisub] Rota `/kitchen/$kitchenId/snack-requests/$requestId` (decisão, andamento, amostra, retirada, cautela, devolução)
- [ ] 5.7 [sisub] Rota `/kitchen/$kitchenId/snack-requests/production` (consolidado do dia)
- [x] 5.8 [sisub] NavItems (kitchen "Lanches de Bordo/Apoio") + `breadcrumbs.ts`

## 5b. Quadro de produção (D8)

- [x] 5b.1 [database] `meal_type.system_key` + tipo de sistema semeado; `menu_items.origin_snack_request_id`
- [x] 5b.2 [sisub-domain] Materialização no aceite e remoção no cancelamento; `fetchMealTypes` exclui tipo de sistema
- [x] 5b.3 [sisub-domain] `fetchProductionBoard` devolve `snack_request` por item
- [ ] 5b.4 [sisub] Badge/agrupamento por pedido no quadro

## 6. Etiqueta

- [ ] 6.1 [sisub] Componente de etiqueta imprimível (CSS de impressão) com os campos de 7.4.5 e aviso de cobertura parcial
- [ ] 6.2 [sisub] Impressão por requisição e por dia a partir do consolidado

## 7. Fechamento

- [ ] 7.1 [sisub] `react-doctor` nas telas novas
- [ ] 7.2 [root] `bun run check` + `bun run lint`
- [ ] 7.3 [root] `bun run test` (turbo, `--concurrency=2`) + integração do sisub com `SISUB_RUN_INTEGRATION=true`
- [ ] 7.4 [root] `/code-review` e relato no PR
