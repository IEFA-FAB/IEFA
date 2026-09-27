## 0. Proposta

- [x] 0.1 [sisub] Inventário por camada (catálogo do banco, `git grep`, telas) e glossário por processo
- [x] 0.2 [sisub] Decisões do usuário de 2026-09-27 incorporadas (D2); classificação de "rancho" (D10) e nomes derivados do arranchamento (D11)
- [x] 0.3 [sisub] Proposta `lgpd-military-roster-key`: coluna `saram` na view `core.military_identity`
- [ ] 0.4 [sisub] Mantenedor decide o destino de `kitchen.rancho` (fusão ou rename, D10.1)
- [ ] 0.5 [sisub] Conferir as fontes marcadas "a confirmar" usadas pelo lote seguinte, antes de abrir o lote

## 1. Lote 1: só TypeScript e tela (sem banco)

- [x] 1.1 [sisub] [sisub-domain] Previsão de demanda: `KitchenAtaDraft`/`kitchenDraft*`/`draftId` → `DemandForecast`/`demandForecast*`/`forecastId`; arquivos `kitchen-draft*` → `demand-forecast*`; query keys
- [x] 1.2 [sisub] Rota `kitchen/$kitchenId/suprimentos/$draftId` → `demand-forecasts/$forecastId`, com o arquivo antigo só com redirect; `breadcrumbs.ts`, `NavItems.tsx`, testes de navegação
- [x] 1.3 [sisub] [sisub-domain] `liquidation*` → `liquidacao*`, `payment*` → `pagamento*` (arquivos, tipos, hooks); rotas `liquidations` → `liquidacoes` e `payments` → `pagamentos` com redirect
- [x] 1.4 [sisub] [sisub-domain] `product` → `ingredient` no TS (menos o valor de `policy_rule.target`, que é do lote 5); `list_preparations` → `list_legacy_preparations` com os testes de contrato das tools
- [x] 1.5 [sisub] Rótulos: "Cardápio semanal" (rota `global/weekly-plans` → `global/weekly-menus` com redirect), "Cardápio de apoio", "Inventário físico", "Pesquisa de preços", "ARP (preço registrado)", "Contratação planejada" × "Contratação de origem"
- [x] 1.6 [root] Criar `.opengrep/rules/ubiquitous-language.yaml` com os termos do lote 1 e casos de teste da regra (espera o mantenedor)
- Adiantado do lote 8a no PR do lote 1, a pedido: o nome do módulo `messhall` na tela ("Fiscal de rancho", parte de 8.4; os níveis 1 e 3 ficam para 8.4) e a mensagem de designação que faltava ("quem tem Gestão Unidade" no lugar de "chefe do rancho", parte de 8.3 em `designations.ts` e `receiving-pending.ts`). `product_items`/`productItems` ficam: são os itens de produto (SKU) do insumo, gravados no retrato da versão (`ingredient_version`), não o nome antigo de insumo. O recolhimento da retenção saiu de `payment` para `remittance` (`registerDeductionRemittanceFn`), não para `pagamento`: DARF/DAR/GPS não é a fase de pagamento (OB) da despesa

## 2. Lote 2: anexo quantitativo

- [ ] 2.1 [sisub] Declarar `procurement.quantity_estimate`, `quantity_estimate_kitchen` e `quantity_estimate_snapshot_selection` em `RESET_EXCLUSIONS` (PR próprio, antes do expand)
- [ ] 2.2 [database] Expand: 6 tabelas `procurement_list*` → `quantity_estimate*` com views de compatibilidade (colunas antigas por alias, grants iguais, inclusive `analytics_reader`); constraints e índices renomeados; conferência de `pg_proc`/`pg_views`/`pg_policies` pelo nome antigo
- [ ] 2.3 [database] Expand: colunas espelhadas por trigger em `procurement_arp`, `procurement_arp_item`, `procurement_pesquisa_preco(_item)`, `price_research_emission`, `kitchen_demand_forecast_import` (`quantity_estimate_id`, `quantity_estimate_item_id`); `max_margin_percent` → `max_increase_percent`, `margin_justification` → `max_quantity_justification`, `total_quantity` → `estimated_quantity`; CHECK de status aceitando `published` e `completed`
- [ ] 2.4 [database] Aplicar (`db:push --dry-run`, push, espera o mantenedor); `db:types` e `db:drizzle:pull` no mesmo PR
- [ ] 2.5 [sisub-domain] Operações e schemas: `ata.ts`, `ata-quantity-limits.ts`, `procurement.ts`, tipos → `quantity-estimate*`, lendo `published` e `completed`, gravando só `completed`
- [ ] 2.6 [sisub] Server fns, hooks e query keys (`ata.fn.ts`, `useAta.ts`, `ata-annex.ts`, `ata-utils.ts`, `types/domain/ata.ts`)
- [ ] 2.7 [sisub] Componentes (`components/features/local/ata/`, wizard `AtaWizard*`) e rótulos que ainda dizem "margem"
- [ ] 2.8 [sisub] Rotas `unit/$unitId/procurement/*` → `quantity-estimates/*` com redirect; `breadcrumbs.ts` e testes de navegação
- [ ] 2.9 [sisub] [sisub-domain] Tools do chat: `list_atas`/`get_atas`/`get_ata_details`/`update_ata_status` → `list_quantity_estimates`/`get_quantity_estimate`/`update_quantity_estimate_status`, com a listagem em `@iefa/sisub-domain/agent` (sem `untypedFrom`); prompts e `ToolCallDisplay.tsx`; testes de contrato das tools
- [ ] 2.10 [sisub] Analytics: prompt e allowlist `analytics-sql.ts` com os nomes novos
- [ ] 2.11 [api] Rota admin `/quantity-estimates/:quantityEstimateId`; `/ata/:ataId` como alias com cabeçalho `Deprecation`, `Link` e log de uso
- [ ] 2.12 [sisub] `RESET_STEPS` com os nomes novos (saem de `RESET_EXCLUSIONS`); integração no banco real
- [ ] 2.13 [root] Termos do lote 2 no gate (opengrep e teste do banco vivo com a allowlist do expand)
- [ ] 2.14 [database] [api] [sisub] Contract depois do deploy (conferido no CI/CD): conferência de divergência, derruba views, triggers e colunas antigas, `published` → `completed`, CHECK só com o valor novo; saem as rotas de redirect e o alias da API (espera o mantenedor)

## 3. Lote 3: pesquisa de preços e prefixos

- [ ] 3.1 [sisub] Declarar `procurement.arp` e `procurement.segment` em `RESET_EXCLUSIONS`
- [ ] 3.2 [database] Expand: `procurement_pesquisa_preco*` → `price_research*`, `compras_amostra` → `price_sample`, `procurement_arp*` → `arp*`, `procurement_segment*` → `segment*`, com views; `upsert_compras_amostras` e `compras_amostra_fingerprint` → nomes novos com wrapper; recriar `empenho_item_check_unit`, `designations_covering`, `supply_order_empenho_usage`, `procurement_arp_check_acquisition`
- [ ] 3.3 [database] Aplicar e regerar tipos (espera o mantenedor)
- [ ] 3.4 [sisub] [sisub-domain] Código: pesquisa de preços (`price-research*`, `savePrecoAuditFn`), ARP (`arp.fn.ts`, `useArp.ts`), segmentos
- [ ] 3.5 [api] Worker `pesquisa-preco` → `price-research`; `analisarPrecos` → `analyzePrices`; `AmostraPreco` → `PriceSample`
- [ ] 3.6 [root] `pncp-audit-isolation.yaml` com os nomes novos; termos do lote 3 no gate (espera o mantenedor)
- [ ] 3.7 [database] Contract depois do deploy (espera o mantenedor)

## 4. Lote 4: finanças no banco

- [ ] 4.1 [database] Expand: `budget_credit.dotacao` → `received_credit`, `saldo_siafi` → `available_credit_siafi`, `empenho.ug_emitente` → `issuer_ug`, espelhadas por trigger; aplicar e regerar tipos (espera o mantenedor)
- [ ] 4.2 [sisub] [sisub-domain] Código, import do SIAFI (`siafi_integration.apply_document_row` recriada) e gate
- [ ] 4.3 [database] Contract depois do deploy (espera o mantenedor)

## 5. Lote 5: valores de domínio

- [ ] 5.1 [database] Expand: CHECKs de `contract_designation.role`, `inventory_count.type`, `policy_rule.target`, `menu_template.template_type` e `menu_items.origin_template_type` aceitando os dois vocabulários
- [ ] 5.2 [sisub-domain] [sisub] Constantes (`DESIGNATION_ROLES`, tipos de inventário, `PolicyTarget`, tipos de cardápio) com leitura dos dois; `sql-vocabulary.contract.test.ts` atualizado
- [ ] 5.3 [sisub] Rotas `global/exceptions` e `kitchen/$kitchenId/exceptions` → `*/support-menus` com redirect; componentes `Exception*`
- [ ] 5.4 [database] Contract: `update` para os valores novos e CHECK apertado (espera o mantenedor)

## 6. Lote 6: SARAM (depois de `lgpd-military-roster-key`)

- [ ] 6.1 [database] `core.person.nr_ordem` e `core.user_data."nrOrdem"` → `saram` por espelho; `core.military_identity.saram`
- [ ] 6.2 [sisub] [sisub-domain] [sucont] [rumaer] [api] Leitores
- [ ] 6.3 [database] Contract (espera o mantenedor)

## 7. Lote 7: arranchamento (código depois do lote 8a)

- [ ] 7.1 [sisub] Declarar `kitchen.arranchamento` em `RESET_EXCLUSIONS` (tem `mess_hall_id`)
- [ ] 7.2 [database] Expand: `kitchen.meal_forecasts` → `kitchen.arranchamento` com view de compatibilidade (grant de `analytics_reader`), índices e constraints renomeados; aplicar e regerar tipos (espera o mantenedor)
- [ ] 7.3 [sisub-domain] `operations/forecast.ts` → `arranchamento.ts` e schemas de `meal-ops.ts` (D11)
- [ ] 7.4 [sisub] `forecast.fn.ts`, `useMealForecast.ts`, `lib/forecast.ts`, painéis (`forecast_count`...), rota `diner/forecast` → `diner/arranchamento` com redirect, rótulo "Arranchamento"; analytics (prompt e allowlist)
- [ ] 7.5 [api] `/api/arranchamentos` com `/api/rancho_previsoes` como alias depreciado, os dois em `RESTRICTED_PATHS`, com teste em `routes.auth.test.ts`
- [ ] 7.6 [database] [api] [sisub] Contract depois do deploy; saem o alias e o redirect (espera o mantenedor)

## 8. Lote 8: "rancho" sai da linguagem

- [ ] 8.1 [sisub] Comensal, presença e analytics: "rancho" → "refeitório" (seletores, filtros, colunas, mensagens, tipos, `constants/rancho.ts` desfeito: `FALLBACK_RANCHOS` sem uso sai, `MEAL_TYPES` e `NEAR_DATE_THRESHOLD` vão para `constants/meal.ts`)
- [ ] 8.2 [sisub] [sisub-domain] Lanche, produção e planejamento: "rancho" → "cozinha" ou "refeitório" conforme D10 (material cautelado, chave `"rancho"` do quadro de produção, escala sem refeitório)
- [ ] 8.3 [sisub] [sisub-domain] "chefe do rancho" → Gestão Unidade (`designations.ts`, `receiving-pending.ts`); fluxos e textos da execução; e2e
- [ ] 8.4 [sisub] Módulo `messhall` rotulado "Fiscal de rancho" (`NavItems.tsx`, `breadcrumbs.ts`, `policies/labels.ts`, `qr-code.tsx`); níveis 1 e 3 como "Operador de refeitório" e "Gestor de refeitório"
- [ ] 8.5 [sisub] Prompts e descoberta: `module-chat/prompts/kitchen.ts`, `analytics-prompt.ts`, `agent-discovery.ts` (três entradas no lugar de "rancho — refeitório/cozinha")
- [ ] 8.6 [docs] `pbac/modulos.mdx`, `pbac/index.mdx`, `sisub/index.mdx` e `apps/docs/src/routes/index.tsx`
- [ ] 8.7 [database] Dados: texto das 2 regras de `procurement.policy_rule` e descrição do sisub em `iefa.apps` (update de dado, espera o mantenedor); renomear o refeitório "Rancho" da EEAR pela tela Locais
- [ ] 8.8 [root] Regra "rancho" no gate, exceto "Fiscal de rancho" e as palavras-chave de busca, para os caminhos já limpos (espera o mantenedor)
- [ ] 8.9 [database] [sisub] [sisub-domain] Efetivo (`kitchen.rancho`): fusão em `kitchen.mess_halls` em change própria `sisub-workforce-by-mess-hall`, ou rename para `kitchen.mess_hall_workforce` na técnica de D4, conforme a decisão 0.4; identificadores do efetivo, `core.rancho`, `core.workforce_submission` e os comentários do banco no mesmo lote

## 9. Fechamento de cada lote

- [ ] 9.1 [root] `bun run check`, `bun run lint --concurrency=2` e `bun run test --concurrency=2` verdes em cada PR de lote
