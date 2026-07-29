# Tasks: sisub-inventory-cycle

> Cada grupo = uma fase = 1 PR (mínimo). Rodar `bun run check` + testes antes de cada merge. Após cada migration: `supabase gen types` + drizzle pull + `typecheck --force`.

## 1. Fase 1 — Visibilidade ARP + Empenho (tabelas já existem)

- [x] 1.1 [sisub] Auditar UI existente da ATA (`/unit/$unitId/procurement/$ataId`): o que já cobre ARP/empenho vs o spec `arp-empenho-visibility`
- [x] 1.2 [sisub] EmpenhoBalancePanel com **duas visões separadas** por item: saldo oficial (snapshot API + `synced_at`) e comprometimento local (soma de `finance.empenho` ativos) — nunca somar/confundir
- [x] 1.3 [sisub] Server fn `syncArpBalanceFn` (ou validar a existente) com tratamento de falha da API sem sobrescrever snapshot; exibir `synced_at`
- [x] 1.4 [sisub] Form de registro de empenho + ação de anulação (status `anulado`, recompõe só o comprometimento local); validar UNIQUE `(unit_id, numero_empenho)` com erro amigável
- [x] 1.5 [sisub] Testes unit dos cálculos (local × oficial) + teste de contrato das server fns

## 2. Fase 2a — Unidades de medida canônicas

- [ ] 2.1 [database] Migration `core.measure_unit` (código canônico, descrição, dimensão) + seed (KG, G, LT, ML, UN, DZ…)
- [ ] 2.2 [database] Backfill de normalização (`upper(trim())` + mapa de sinônimos) em `ingredient`, `ingredient_item`, `purchase_item`, `procurement_list_item`; valores não-mapeáveis preservados
- [ ] 2.3 [sisub] Fila de revisão de unidades não-mapeáveis (lista simples no módulo admin/global)
- [ ] 2.4 [database] Regenerar tipos + drizzle pull; teste de integração validando que não sobrou caixa mista nos domínios mapeados

## 3. Fase 2b — Catálogo GTIN + GPC

- [ ] 3.1 [database] Migration `gs1_integration.gtin` (PK 14 dígitos, `CHECK (gtin ~ '^[0-9]{14}$')`, `parent_gtin`, `units_per_parent`, `net_content`, `gpc_brick_code`, `ncm`, `source`, `raw_payload`) + `gs1_integration.gpc_brick` + `gs1_integration.supplier_product_map` (UNIQUE cnpj+cProd)
- [ ] 3.2 [database] Migration: coluna `gtin` FK em `kitchen.ingredient_item` + UNIQUE parcial `WHERE deleted_at IS NULL`
- [x] 3.3 [sisub-domain] Utilitários GTIN: normalização a 14 dígitos, validação de check digit (na aplicação — banco só valida formato), resolução de hierarquia de embalagem — com testes unit exaustivos
- [ ] 3.4 [database] Backfill `barcode` → `gtin` (válidos migram, inválidos ficam) + query da fila de revisão
- [x] 3.5 [api] Importador GPC idempotente (padrão TACO/IBGE/USDA) a partir da publicação GS1
- [x] 3.6 [api] Proxy Verified by GS1 (`GET /gs1/lookup/:gtin`) com cache na entidade (`source='vbg'`, `verified_at`); degradação graciosa quando indisponível
- [ ] 3.7 [sisub] Server fns `gtin.fn.ts` (lookup, criar/associar GTIN a `ingredient_item`) + componente `GtinScannerField` (burst de teclas + Enter, normaliza e valida)
- [ ] 3.8 [sisub] Fila de revisão de barcodes inválidos com sugestões por trigram
- [x] 3.9 [database] RLS/policies do schema `gs1_integration` + inclusão no `audit-rls.ts` (RLS na migration 20260728121000; schema já coberto pelo audit-rls.ts:46)

## 4. Fase 2c — Ingestão de NF-e

- [ ] 4.1 [database] Migration `inventory.nfe_document` (UNIQUE `access_key`, XML íntegro) + `inventory.nfe_item` (campos do `det` + rastro + `match_status` + FKs de resolução) + RLS
- [ ] 4.2 [api] Parser XML NF-e 4.0 (endpoint de upload): validação de schema/chave, extração de `det`, normalização de `cEAN`/`cEANTrib` ("SEM GTIN" → null), rejeição de duplicata
- [ ] 4.3 [sisub-domain] Pipeline de matching (operation `nfe-matching`): GTIN exato → supplier map → sugestão NCM+GPC+trigram → `no_match`; conversão via GTIN/`unit_content_quantity` (nunca `uCom`); item sem conversão resolvível nunca fica `matched` — com testes unit
- [ ] 4.4 [sisub-domain] Auto-criação de GTIN `source='nfe'` (sem conteúdo líquido → item vai a `review`); gravação no `supplier_product_map` ao resolver manualmente
- [ ] 4.5 [sisub] Server fns `nfe.fn.ts` + telas de upload de XML, lista de notas e detalhe com itens/status de matching
- [ ] 4.6 [sisub] Fila de resolução manual com candidatos ranqueados (aprende: grava supplier map/vínculo GTIN)
- [ ] 4.7 [sisub] Testes de integração do pipeline com XMLs de fixture (com GTIN, SEM GTIN, com rastro, duplicata, GTIN novo sem conversão)

## 5. Fase 3 — Motor de estoque

- [ ] 5.1 [database] Migration `inventory.stock_lot` + `inventory.stock_movement`: XOR `ingredient_id`/`frozen_preparation_id` (`num_nonnulls = 1`), **trigger `BEFORE UPDATE OR DELETE` de imutabilidade** (service role bypassa RLS), tipos CHECK, quantidade > 0, `kitchen_id` bigint, índices
- [ ] 5.2 [database] View `inventory.v_stock_balance` (por cozinha×item e por lote) + função SQL transacional de custo médio ponderado
- [ ] 5.3 [database] Migration `inventory.inventory_count` (+ itens por lote) — contagem não move saldo; ajustes derivados referenciam a contagem
- [ ] 5.4 [database] RLS/policies do schema `inventory` alinhadas ao PBAC `storage` (1 leitura, 2 movimentar, 3 ajustar/fechar); incluir no `audit-rls.ts`
- [ ] 5.5 [sisub-domain] Operation `inventory`: registrar movimento (lote sintético `SEM-LOTE-<data>` quando ausente; bloqueio com mensagem clara para ingrediente com unidade pendente de revisão), consultar saldo, ajuste com justificativa obrigatória
- [ ] 5.6 [sisub-domain] Transferência entre cozinhas: par atômico `transfer_out`/`transfer_in` com referência cruzada; lote destino herda código/validade/custo
- [ ] 5.7 [sisub] Server fns `stock.fn.ts` (`fetchStockBalanceFn`, `fetchStockMovementsFn`, `createAdjustmentFn`, `createTransferFn`) + rota `/storage/$kitchenId/dashboard` (saldo por pasta, movimentos recentes, alertas de validade) com `requirePermission("storage", 1)`
- [ ] 5.8 [sisub] Fluxo de contagem física (criar contagem → registrar contado por lote → confirmar → ajustes gerados)
- [ ] 5.9 [sisub] NavItems: módulo `storage` (ícone Package)
- [ ] 5.10 [sisub] Testes: imutabilidade (UPDATE/DELETE abortados pelo trigger, inclusive via service role), XOR, custo médio, saldo após sequência, ajuste, contagem com/sem divergência, transferência atômica (falha parcial reverte)

## 6. Fase 4 — OF + Recebimento em dois estágios

- [ ] 6.1 [database] Migration `procurement.supply_order` + `supply_order_item` (status, `sent_at`, `expected_delivery`, CHECK soma ≤ empenho via trigger/função)
- [ ] 6.2 [database] Migration `inventory.goods_receipt` + `goods_receipt_item` (status `draft|provisional|definitive|divergent|rejected`, FKs OF/NF-e/empenho, lote/validade, `divergence_reason`) + RLS
- [ ] 6.3 [sisub-domain] Operation `receiving`: transições de status, validação OF×empenho, efetivação do definitivo (cria lotes + movimentos + abate saldo físico do empenho) em transação única
- [ ] 6.4 [sisub] Server fns `supply-order.fn.ts` + telas de OF (emitir contra empenho, listar, acompanhar status)
- [ ] 6.5 [sisub] Wizard de recebimento — parte 1: seleção de OF/NF-e + conferência com `GtinScannerField` (destaque do item da nota, alerta de GTIN fora da nota)
- [ ] 6.6 [sisub] Wizard de recebimento — parte 2: lote/validade (pré-preenchidos do rastro) + estágios provisório → definitivo com registro de autor/data
- [ ] 6.7 [sisub] Fluxo de divergência: recebimento a menor com motivo por item; termo de recebimento (PDF) provisório/definitivo
- [ ] 6.8 [sisub-domain] Lead time observado: `sent_at` da OF → recebimento definitivo, + desvio vs `expected_delivery`, por fornecedor×item
- [ ] 6.9 [sisub] Testes de integração: fluxo completo OF → NF-e → provisório (sem movimento) → definitivo (com movimento), divergência, OF excedendo empenho

## 7. Fase 5 — Baixa por produção

- [ ] 7.1 [sisub-domain] Operation `production-issue`: consumo teórico a partir do **snapshot `menu_items.recipe`** (nunca a receita viva), alocação FEFO multi-lote, override com justificativa
- [ ] 7.2 [sisub] Fluxo de confirmação de saída ao concluir `production_task` (pré-preenchido do snapshot, editável) + server fns
- [ ] 7.3 [sisub] Badge de suficiência de estoque no kitchen-production (N/M disponíveis, sem bloquear produção)
- [ ] 7.4 [sisub-domain] Sobras: `leftover_return` cria lote da **preparação congelada** (XOR do ledger) com validade via `shelf_life_days`; descarte como `waste` com motivo
- [ ] 7.5 [sisub] Relatório de variância teórico × real por período/ingrediente
- [ ] 7.6 [sisub] Testes: FEFO atravessando lotes, override, sobra congelada (lote de frozen_preparation), variância, consumo usa snapshot mesmo após edição da receita

## 8. Fase 6 — MCASP + fechamento

- [ ] 8.1 [database] Migration `inventory.monthly_closing` (UNIQUE cozinha×competência, snapshot jsonb, totais) + bloqueio de lançamento em período fechado (trigger)
- [ ] 8.2 [sisub] Fluxo de fechamento (PBAC nível 3) + tela `/storage/$kitchenId/relatorios`
- [ ] 8.3 [sisub] Ficha de Almoxarifado (ledger cronológico por item, PDF) + Balancete mensal (RMA/RMB) conferindo com a view de saldo
- [ ] 8.4 [database] Layout de exportação em `siafi_integration` + [sisub] exportação CSV/JSON por CATMAT (itens sem CATMAT em seção separada)
- [ ] 8.5 [sisub] Painel empenho × liquidação (`empenhada | recebida | a receber`)
- [ ] 8.6 [sisub] Testes: bloqueio retroativo, balancete = ledger, exportação

## 9. Fase 7 — MRP + canais de compra

- [ ] 9.1 [sisub-domain] Operation `net-needs` (`calculateNetNeeds`): demanda bruta × FC ÷ IR − estoque válido − trânsito, sem tocar `calculateAtaNeeds`; expor memória de cálculo (fator aplicado e origem) — testes unit cobrindo herança de fatores e lotes vencendo no horizonte
- [ ] 9.2 [database] Migration `inventory.stock_policy` (UNIQUE cozinha×ingrediente, estoque mínimo, cobertura, limiar de urgência opcional)
- [ ] 9.3 [sisub-domain] Estimador de lead time com fallback (observado → prazo ARP → default da política), indicando a origem
- [ ] 9.4 [sisub-domain] Tabela de decisão de canal (ARP própria → carona → Supermercado Virtual → Contrata+Brasil → licitação) com custo (reuso `pesquisa_preco`) e prazo estimados; urgência = cobertura abaixo do limiar — testes unit por cenário
- [ ] 9.5 [api] Consulta SICAF via proxy Compras.gov; [sisub] alerta pré-OF com confirmação explícita registrada
- [ ] 9.6 [sisub] Tela de sugestões de reposição (ponto de pedido, canal recomendado, quantidade sugerida, memória de cálculo) + busca de ARP de outras UASGs para carona
- [ ] 9.7 [sisub] Testes de integração do fluxo de sugestão end-to-end

## 10. Encerramento

- [ ] 10.1 [root] `bun run check` (Biome + typecheck com `--force`) verde no monorepo
- [ ] 10.2 [root] `bun run test` + `SISUB_RUN_INTEGRATION=true` suíte de integração verde
- [ ] 10.3 [docs] Documentar o módulo storage (fluxos, PBAC, MCASP) em `apps/docs`
