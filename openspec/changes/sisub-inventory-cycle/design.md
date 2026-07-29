# Design: sisub-inventory-cycle

## Context

O ciclo de subsistência do sisub hoje termina no empenho. Já existem em produção:

- `procurement.procurement_arp` / `procurement_arp_item` (ARP oficial com `quantidade_empenhada`/`saldo_empenho` sincronizados da API Compras.gov) e `finance.empenho` (UNIQUE por `unit_id, numero_empenho`).
- Schemas Postgres `inventory`, `gs1_integration` e `siafi_integration` **criados vazios e já expostos no PostgREST** (migration `20260624120000_create_domain_schemas.sql`).
- Módulo PBAC `storage` reservado em `packages/pbac/src/types.ts` (sem rotas).
- Cadeia de catálogo: `catmat → procurement.purchase_item (com colunas gpc_*) → kitchen.ingredient_item (campo barcode livre) → kitchen.ingredient`, com conversão via `procurement.purchase_item_ingredient` (`purchase_quantity = total_quantity / conversion_factor`, link `is_default`).
- Demanda: `scaleIngredientQuantity` em `packages/sisub-domain/src/operations/demand-math.ts` (`net_quantity × demanda/rendimento × repetições`) usada por `calculateAtaNeeds` (ata.ts) e `fetchProcurementNeeds` (procurement.ts). **Não aplica** `correction_factor` nem `rehydration_index`.
- Produção: `kitchen.production_task` com `produced_quantity`/`leftover_quantity`.

Restrições herdadas do banco: `core.kitchen.id` é `bigint` (4 tabelas antigas usam `integer` por engano — não propagar); `measure_unit` é texto livre com caixa inconsistente (`'KG'` vs `'kg'`); soft delete (`deleted_at`) é a norma em `kitchen`/`procurement`.

## Goals / Non-Goals

**Goals:**

- Fechar o ciclo planejamento → compra → recebimento → produção → estoque → replanejamento, com documento e data prevista em cada elo (previsibilidade mensurável).
- Identificação de insumos por GTIN validado (GS1), com classificação GPC e correlação automática item da NF-e → insumo.
- Almoxarifado digital alinhado ao MCASP: ledger imutável, custo médio ponderado, lote/validade, fechamento mensal.
- Conformidade com a Lei 14.133/21: recebimento provisório → definitivo (art. 140), rastreio empenhado × entregue × recebido.
- Recomendação de canal de compra (ARP → carona → Supermercado Virtual → Contrata+Brasil → licitação) sobre necessidade líquida.

**Non-Goals:** ver "Não-objetivos" no proposal.md (sem escrita automática em SIAFI/SIADS, sem emissão fiscal, sem NFeDistribuicaoDFe nesta etapa, sem compra automática, sem AIs GS1-128).

## Decisions

### D1 — Tabelas novas nos schemas de domínio já reservados, não no `sisub` legado

`inventory.*` para estoque/NF-e/recebimento, `gs1_integration.*` para GTIN/GPC/mapa de fornecedor, `procurement.supply_order*` para ordem de fornecimento, `core.measure_unit` para unidades. Alternativa rejeitada: schema `sisub` legado (vazio, em desativação). Os schemas já estão no `db_schemas` do PostgREST — sem migration de exposição extra.

### D2 — GTIN é entidade própria, não coluna em `ingredient_item`

`gs1_integration.gtin` com PK no GTIN normalizado a 14 dígitos (pad de zeros à esquerda). Check digit validado na **aplicação** (utilitário em `sisub-domain`, testável); o banco garante apenas formato (`CHECK (gtin ~ '^[0-9]{14}$')`) — validar dígito em SQL exigiria função plpgsql imutável sem ganho real. Hierarquia de embalagem via `parent_gtin` + `units_per_parent` (resolve cEAN caixa/DUN-14 vs cEANTrib unidade), `net_content` + `net_content_unit`, `gpc_brick_code`, `ncm`, `source IN ('nfe','vbg','manual')` e `raw_payload jsonb`. `kitchen.ingredient_item` ganha `gtin text` FK + `UNIQUE (gtin) WHERE deleted_at IS NULL`; `barcode` permanece até o backfill (normaliza + valida; inválidos vão para fila de revisão). Alternativa rejeitada (plano original): colunas soltas + `gtin_cache` — perde hierarquia de embalagem e não serve de FK para NF-e.

Cadeia de resolução canônica: `GTIN → ingredient_item (unit_content_quantity) → purchase_item (CATMAT/GPC) → ingredient (unidade base, FC/IR)`.

### D3 — NF-e entra por XML; matching em pipeline com aprendizado

`inventory.nfe_document` (UNIQUE `access_key` 44 dígitos, XML íntegro guardado para auditoria) + `inventory.nfe_item` (espelho de `det`: `cProd`, `cEAN`, `cEANTrib`, `xProd`, NCM, CFOP, `uCom`/`qCom`/`vUnCom`, grupo `rastro` quando presente). Pipeline de matching por item (espelha o padrão `catmat_match_status` já existente em `purchase_item`):

1. `cEAN`/`cEANTrib` → `gs1_integration.gtin` → `ingredient_item` (hit exato; GTIN em NF-e autorizada é validado pela SEFAZ contra o Cadastro Centralizado de GTIN desde a NT 2021.003).
2. `(supplier_cnpj, cProd)` → `gs1_integration.supplier_product_map` (cobre `"SEM GTIN"`).
3. Sugestão por NCM + `gpc_brick_code` + trigram na descrição (índice GIN trgm, padrão já usado em `purchase_item_description_trgm_idx`) → status `review`.
4. Fila manual; cada resolução grava `supplier_product_map`/`gtin` — a próxima nota do mesmo fornecedor resolve sozinha.

Regra de conversão: **nunca** converter por `uCom` (texto livre do emissor); converter por `net_content` do GTIN ou `unit_content_quantity` do `ingredient_item`. Alternativa rejeitada: digitação manual da entrada (plano original) — vira fallback, não caminho principal.

### D4 — Ledger append-only com lote; saldo é view

`inventory.stock_movement` imutável (sem `deleted_at`; correção = movimento de ajuste com justificativa, conforme MCASP). Imutabilidade garantida por **trigger `BEFORE UPDATE OR DELETE` com `RAISE EXCEPTION`** — grants/RLS não bastam: as server fns usam service role, que bypassa RLS, e são justamente elas que escrevem no ledger. Quantidades sempre positivas na **unidade base**; o sinal vem do `type` (`receipt`, `production_issue`, `leftover_return`, `waste`, `transfer_in/out`, `adjustment_in/out`).

Item estocado: `stock_lot` e `stock_movement` referenciam **`ingredient_id` XOR `frozen_preparation_id`** (CHECK `num_nonnulls(...) = 1`, mesmo padrão de `recipe_ingredients_source_xor`) — sobras reaproveitadas entram como estoque de preparação congelada, não de ingrediente. `inventory.stock_lot` carrega `lot_code`, `expiry_date`, `unit_cost` (informativo; valoração contábil é sempre custo médio) e origem (`goods_receipt_item_id`). Saldo por cozinha×item e por lote via view `inventory.v_stock_balance` (materializar só se a performance exigir). Valoração a custo médio ponderado em função SQL transacional. `kitchen_id` é `bigint` em todas as tabelas novas.

Completam o motor: **inventário físico** (`inventory.inventory_count` + itens por lote; divergência gera `adjustment_in/out` vinculados à contagem — a contagem em si não move saldo) e **transferência entre cozinhas** (par atômico `transfer_out`/`transfer_in` na mesma transação, referência cruzada, lote de destino herda código/validade/custo; sem documento de guia de remessa no MVP).

### D5 — Recebimento em dois estágios, ancorado em OF + NF-e + empenho

`procurement.supply_order` (+`_item`): elo que faltava entre o empenho (da unidade) e a entrega (na cozinha), com `expected_delivery` — insumo do lead time. `inventory.goods_receipt` (+`_item`) referencia `supply_order_id`, `nfe_document_id` e `empenho_id`; status `draft → provisional → definitive` (ou `divergent`/`rejected`), espelhando o art. 140 da Lei 14.133. Só o **definitivo** cria `stock_lot` + `stock_movement('receipt')` e abate saldo físico do empenho. Scanner de GTIN é ferramenta de **conferência** contra a NF-e, não de digitação. Lote/validade: pré-preenchidos do grupo `rastro` quando existir; senão capturados na conferência.

### D6 — MRP corrige o gap de FC/IR sem tocar nas fórmulas existentes

Nova função `calculateNetNeeds` em `packages/sisub-domain` (nova operation): `demanda bruta (scaleIngredientQuantity) × correction_factor ÷ rehydration_index (quando aplicável) − saldo disponível (excluindo lotes que vencem no horizonte) − em trânsito (supply_orders enviadas e não recebidas)`. `scaleIngredientQuantity` e `calculateAtaNeeds` permanecem intactas (mudá-las alteraria ATAs publicadas); a correção FC/IR entra apenas no caminho novo de reposição. Herança de fatores segue a regra existente: override em `recipe_ingredients` → valor do `ingredient` → 1.

### D7 — Roteamento de canal é tabela de decisão determinística

Ordem fixa e auditável: (1) ARP própria vigente com saldo ≥ necessidade → empenho; (2) ARP de outra UASG via API `1_consultarARP` → sugerir carona/adesão; (3) item com CATMAT + urgência → Supermercado Virtual (dispensa eletrônica); (4) pequeno valor (art. 75) fora de ata → Contrata+Brasil; (5) senão → novo `procurement_list`. Cada sugestão exibe custo estimado (reusa `pesquisa_preco`) e prazo estimado (lead time observado = `expected_delivery` vs data real por fornecedor×item). Checagem de regularidade SICAF antes de emitir OF. O sistema **recomenda**; a emissão é humana.

### D8 — Unidades de medida canônicas primeiro

`core.measure_unit` (código canônico maiúsculo: KG, G, LT, ML, UN, DZ…) + backfill de normalização (`upper(trim())` + mapa de sinônimos) nas colunas existentes; CHECK apenas nas tabelas novas (nas antigas, gradual, para não quebrar fluxo vivo). Pré-requisito barato que destrava o ledger.

### D9 — Convenções de implementação

- Server fns: `createServerFn({method}).validator(z.object(...))` — **`.validator`**, não `.inputValidator` (deprecado; CLAUDE.md do repo). Arquivos em `apps/sisub/src/server/*.fn.ts`, `getSupabaseServerClient()` per-request.
- Rotas sob `_protected/_modules/storage/$kitchenId/*` com `requirePermission(context, "storage", nível)` no `beforeLoad`; níveis: 1 leitura, 2 movimentar, 3 fechar período/ajustar.
- APIs externas (Verified by GS1, Compras.gov) proxiadas via `apps/api` (padrão `compras-sync`), nunca do browser. Parser de NF-e no `apps/api` (endpoint de upload) com persistência via service role.
- Migrations em `packages/database/supabase/migrations/` com timestamp de **14 dígitos**; após cada migration: regenerar `generated.ts` + Drizzle pull (validar com `typecheck --force` — cache do turbo mascara).
- Import GPC: seguir o padrão dos importadores TACO/IBGE/USDA (idempotente, `apps/api` worker ou script).
- UI: Base UI (`@base-ui/react/*`), flat design do sisub; sem side-stripe accent borders.

## Risks / Trade-offs

- [Backfill de `barcode` encontra lixo (códigos internos, EANs inválidos)] → migração não-destrutiva: `barcode` mantido, `gtin` só recebe valores com check digit válido; resto vai para fila de revisão com sugestão trigram.
- [NF-e sem GTIN ("SEM GTIN") em fornecedores locais] → `supplier_product_map` cobre por `(CNPJ, cProd)`; primeira nota exige resolução manual, seguintes são automáticas.
- [Grupo `rastro` raramente preenchido em alimentos] → lote/validade capturados na conferência física; campo opcional em `goods_receipt_item`, mas movimento de entrada exige lote (gera lote sintético `SEM-LOTE-<data>` quando o operador não informa, para não bloquear operação).
- [Ledger append-only contraria a norma de soft delete do repo] → exceção documentada (MCASP); enforcement por grants/RLS, não por convenção.
- [View de saldo degrada com volume] → começar com view simples; materializar com refresh incremental se p95 estourar (mesma trilha do plano original).
- [Fechamento mensal bloqueia correções legítimas] → lançamento retroativo permitido apenas como `adjustment_*` com justificativa obrigatória no período aberto seguinte.
- [Lead time sem histórico no início] → fallback: prazo contratual da ARP ou default configurável em `stock_policy.cobertura_dias`.
- [Dupla contagem entre estoque e `excluded_from_procurement`/ATAs publicadas] → `calculateNetNeeds` abate apenas estoque + trânsito; ATAs publicadas continuam com demanda bruta congelada (snapshot) — sem retroatividade.
- [bigint vs integer em `kitchen_id`] → todas as tabelas novas usam `bigint`; não corrigir as 4 antigas neste change.
- [Quantidade de compra do MRP (com FC/IR) diverge da quantidade da ATA (`calculateAtaNeeds`, sem FC) para a mesma demanda] → intencional (D6): ATAs publicadas ficam congeladas; a UI de sugestões de reposição exibe a memória de cálculo (fator aplicado e origem) para o gestor entender a diferença entre as telas.

## Migration Plan

Uma migration por fase (timestamps de 14 dígitos), sempre aditiva; rollback = não aplicar a fase seguinte (nenhuma fase altera dados existentes de forma destrutiva):

1. `core.measure_unit` + backfill de normalização (Fase 2a).
2. `gs1_integration.gtin`, `gpc_brick`, `supplier_product_map` + colunas em `ingredient_item` + backfill de `barcode` (Fase 2b).
3. `inventory.nfe_document`, `nfe_item` (Fase 2c).
4. `inventory.stock_lot`, `stock_movement` (XOR ingrediente/preparação congelada + trigger de imutabilidade), `inventory_count`, views, função de custo médio (Fase 3).
5. `procurement.supply_order`, `supply_order_item`, `inventory.goods_receipt`, `goods_receipt_item` (Fase 4).
6. Colunas/gatilhos de baixa por produção (Fase 5 — sem tabela nova além de FKs).
7. `inventory.monthly_closing` (Fase 6) e `inventory.stock_policy` (Fase 7).

Após cada migration: `supabase gen types` + drizzle pull + `bun run check` + testes de integração (`SISUB_RUN_INTEGRATION=true`). Deploy por PR (Greptile), sem merge direto na main.

## Open Questions

- Credenciais/contrato da API Verified by GS1 (CNP — GS1 Brasil): já existe cadastro da unidade? Define se a Fase 2b lança com enriquecimento automático ou só validação de check digit + cadastro manual.
- Limiar de urgência do Supermercado Virtual: o spec fixa o default (cobertura < lead time estimado, configurável em `stock_policy`) — confirmar o valor default com o gestor.
- Layout exato da exportação SIAFI/SIADS (Fase 6): validar com a seção de intendência antes de congelar o formato (CSV por CATMAT como ponto de partida).
