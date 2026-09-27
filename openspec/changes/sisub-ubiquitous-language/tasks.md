## 0. Proposta

- [x] 0.1 [sisub] Inventário por camada (catálogo do banco, `git grep`, telas) e glossário por processo
- [ ] 0.2 [sisub] Mantenedor decide os itens de "Decisões que dependem do mantenedor" (`design.md`); o glossário é atualizado com cada decisão antes do lote que a usa
- [ ] 0.3 [sisub] Conferir as fontes marcadas "a confirmar" usadas pelo lote seguinte, antes de abrir o lote

## 1. Lote 1: só TypeScript (sem banco)

- [ ] 1.1 [sisub] [sisub-domain] Previsão de demanda: `KitchenAtaDraft`/`kitchenDraft*`/`draftId` → `DemandForecast`/`demandForecast*`/`forecastId`; arquivos `kitchen-draft*` → `demand-forecast*`; query keys
- [ ] 1.2 [sisub] Rota `kitchen/$kitchenId/suprimentos/$draftId` → `demand-forecasts/$forecastId`, com o arquivo antigo só com redirect; `breadcrumbs.ts`, `NavItems.tsx`, testes de navegação
- [ ] 1.3 [sisub] [sisub-domain] `liquidation*` → `liquidacao*`, `payment*` → `pagamento*` (arquivos, tipos, hooks); rotas `liquidations` → `liquidacoes` e `payments` → `pagamentos` com redirect (depende da decisão 1)
- [ ] 1.4 [sisub] [sisub-domain] `product` → `ingredient` no TS (menos o valor de `policy_rule.target`, que é do lote 5)
- [ ] 1.5 [root] Criar `.opengrep/rules/ubiquitous-language.yaml` com os termos do lote 1 e casos de teste da regra (espera o mantenedor)

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
- [ ] 2.11 [api] Rota admin `/quantity-estimates/:quantityEstimateId` com o caminho `/ata/:ataId` como alias registrado
- [ ] 2.12 [sisub] `RESET_STEPS` com os nomes novos (saem de `RESET_EXCLUSIONS`); integração no banco real
- [ ] 2.13 [root] Termos do lote 2 no gate (opengrep e teste do banco vivo com a allowlist do expand)
- [ ] 2.14 [database] Contract depois do deploy (conferido no CI/CD): conferência de divergência, derruba views, triggers e colunas antigas, `published` → `completed`, CHECK só com o valor novo; rotas de redirect e alias da API saem (espera o mantenedor)

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

## 5. Lote 5: valores de domínio (depois da decisão 2)

- [ ] 5.1 [database] Expand: CHECKs de `contract_designation.role`, `inventory_count.type` e `policy_rule.target` aceitando os dois vocabulários
- [ ] 5.2 [sisub-domain] [sisub] Constantes (`DESIGNATION_ROLES`, tipos de inventário, `PolicyTarget`) com leitura dos dois; `sql-vocabulary.contract.test.ts` atualizado
- [ ] 5.3 [database] Contract: `update` para os valores novos e CHECK apertado (espera o mantenedor)

## 6. Lote 6: SARAM (depois de `lgpd-military-roster-key` e da decisão 9)

- [ ] 6.1 [database] `core.person.nr_ordem` e `core.user_data."nrOrdem"` → `saram` por espelho; `core.military_identity.saram`
- [ ] 6.2 [sisub] [sisub-domain] [sucont] [rumaer] [api] Leitores
- [ ] 6.3 [database] Contract (espera o mantenedor)

## 7. Lote 7: subsistência (depois das decisões 3 a 7)

- [ ] 7.1 [sisub] Rótulos decididos: "Fiscal do rancho", "Cardápio semanal", "Inventário físico", "Arranchamento", "Pesquisa de preços"
- [ ] 7.2 [sisub] [sisub-domain] Preparação legada do SISUBWEB: `list_preparations` → `list_legacy_preparations`, tipos e testes de contrato
- [ ] 7.3 [database] [sisub] [sisub-domain] Se aprovado: `kitchen.meal_forecasts` → `kitchen.arranchamento` em expand/código/contract, com o analytics
- [ ] 7.4 [sisub] Registrar no catálogo de edge cases o que a decisão sobre `kitchen.rancho` × `mess_halls` deixar em aberto

## 8. Fechamento de cada lote

- [ ] 8.1 [root] `bun run check`, `bun run lint --concurrency=2` e `bun run test --concurrency=2` verdes em cada PR de lote
