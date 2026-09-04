# Proposal: sisub-inventory-cycle

## Why

O sisub planeja cardápios, calcula necessidades e gerencia ATAs/empenhos, mas o ciclo se interrompe na emissão do empenho: não há registro da entrega física, do estoque em mãos nem do consumo real da produção. Sem isso, o planejamento de compra parte sempre do zero (demanda bruta, sem abater estoque), o recebimento é manual e sem conferência contra a NF-e, e não existe rastreabilidade contábil (MCASP) nem previsibilidade de reposição. Este change fecha o ciclo: planejamento → compra → recebimento → produção → estoque → replanejamento.

## What Changes

Afeta primariamente **sisub** (rotas, server fns, domínio) e **packages/database** (migrations nos schemas `inventory`, `gs1_integration`, `procurement`, `core`); **api** recebe proxies para GS1/Compras.gov e o parser de NF-e.

- **Fase 1 — Visibilidade ARP + Empenho**: painel de saldo `qtd_registrada | empenhada | saldo` por item de ARP, sincronizável via API Compras.gov (as tabelas `procurement_arp`, `procurement_arp_item`, `finance.empenho` já existem — a fase entrega a UI e valida o sync).
- **Fase 2a — Unidades de medida canônicas**: tabela `core.measure_unit`, normalização dos valores existentes (caixa inconsistente `KG`/`kg`), CHECK nas tabelas novas.
- **Fase 2b — Catálogo GTIN + GPC (GS1)**: schema `gs1_integration` com entidade `gtin` (14 dígitos normalizados, check digit, hierarquia de embalagem `parent_gtin`), import da publicação GPC, mapa fornecedor→insumo (`supplier_product_map`), migração de `ingredient_item.barcode` para GTIN validado com unique parcial, lookup Verified by GS1 cacheado.
- **Fase 2c — Ingestão de NF-e**: tabelas `inventory.nfe_document`/`nfe_item`, parser do XML (layout 4.0: `cEAN`/`cEANTrib`, `cProd`, NCM, `uCom`/`qCom`, grupo `rastro`), pipeline de matching GTIN → supplier map → sugestão NCM/GPC/trigram → fila manual com aprendizado.
- **Fase 3 — Motor de estoque**: schema `inventory` com `stock_lot` (lote + validade), `stock_movement` (ledger imutável via trigger, append-only, unidade base; item = ingrediente XOR preparação congelada), view de saldo por cozinha×item e por lote, custo médio ponderado (MCASP), inventário físico (contagem → ajustes) e transferência atômica entre cozinhas.
- **Fase 4 — Recebimento em dois estágios**: `procurement.supply_order` (ordem de fornecimento por cozinha, com data prevista de entrega) e `inventory.goods_receipt` com recebimento provisório → definitivo (Lei 14.133, art. 140), conferência física por scanner de GTIN contra a NF-e, captura de lote/validade, abatimento do saldo físico do empenho.
- **Fase 5 — Baixa por produção**: consumo FEFO ao concluir `production_task` (teórico calculado do snapshot congelado `menu_items.recipe`), sobra reaproveitável como lote de preparação congelada, relatório de variância teórico × real.
- **Fase 6 — Contabilidade MCASP**: fechamento mensal com lock de período, Ficha de Almoxarifado, balancete (RMA/RMB), exportação estruturada para SIAFI/SIADS (schema `siafi_integration`).
- **Fase 7 — MRP + canais de compra**: necessidade líquida (demanda bruta com fator de correção/reidratação − estoque disponível − em trânsito), política de estoque (ponto de pedido, cobertura), lead time medido por fornecedor×item, roteamento de canal (ARP própria → carona → Supermercado Virtual → Contrata+Brasil → nova licitação) com checagem SICAF.

## Capabilities

### New Capabilities

- `arp-empenho-visibility`: painel de saldo de empenho por item de ARP com sincronização via API Compras.gov (Fase 1).
- `measure-unit-canonical`: catálogo canônico de unidades de medida e normalização dos dados existentes (Fase 2a).
- `gtin-gs1-catalog`: entidade GTIN validada com hierarquia de embalagem, classificação GPC, mapa fornecedor→insumo e enriquecimento via Verified by GS1 (Fase 2b).
- `nfe-ingestion`: importação de XML de NF-e e pipeline de correlação item da nota → insumo (Fase 2c).
- `stock-ledger`: ledger imutável de movimentos de estoque com lotes, validade e saldo valorado a custo médio ponderado (Fase 3).
- `goods-receipt`: ordem de fornecimento e recebimento físico em dois estágios com conferência NF-e × físico × empenho (Fase 4).
- `production-stock-issue`: baixa de estoque por produção com FEFO, retorno de sobras e variância teórico × real (Fase 5).
- `stock-accounting-mcasp`: fechamento mensal, relatórios MCASP e exportação SIAFI/SIADS (Fase 6).
- `stock-replenishment-mrp`: necessidade líquida, políticas de reposição, lead time observado e roteamento de canal de compra (Fase 7).

### Modified Capabilities

Nenhuma — não há specs existentes em `openspec/specs/`.

## Impact

- **packages/database**: migrations novas nos schemas `inventory`, `gs1_integration`, `procurement` (supply_order), `core` (measure_unit), `finance` (nenhuma alteração estrutural — só leitura); regenerar tipos (`generated.ts`) e Drizzle pull após cada migration.
- **packages/sisub-domain**: novas operations (`inventory`, `nfe-matching`, `net-needs`); correção de escopo em `demand-math` (aplicar `correction_factor`/`rehydration_index` no cálculo de compra — hoje ignorados).
- **apps/sisub**: novo módulo de rotas `/storage/$kitchenId/*` (PBAC `storage` já reservado), server fns `stock.fn.ts`, `nfe.fn.ts`, `gtin.fn.ts`, `supply-order.fn.ts`, extensões nas telas de procurement e kitchen-production.
- **apps/api**: proxy GS1 (Verified by GS1), parser/endpoint de upload de XML NF-e, extensão do proxy Compras.gov (módulo ARP já usado).
- **PBAC**: módulo `storage` (já existe em `packages/pbac/src/types.ts`) passa a ter rotas reais; níveis 1 = leitura, 2 = movimentar, 3 = fechar período/ajustar.
- **Dados existentes**: `ingredient_item.barcode` migrado/validado; valores de `measure_unit` normalizados (backfill com fila de revisão para não-mapeáveis).
- **Riscos**: inconsistência bigint/integer em `kitchen_id` (novas tabelas padronizam bigint); ledger é append-only sem soft delete (exceção à norma do repo, intencional por MCASP); fechamento de período bloqueia lançamentos retroativos.

## Não-objetivos

- **Integração transacional com SIAFI/SIADS**: a Fase 6 gera exportação estruturada (CSV/JSON) para lançamento manual; não há escrita automática em sistemas do governo.
- **Emissão de documentos fiscais**: o sisub consome NF-e de entrada; não emite notas, MDF-e ou manifestação do destinatário (Manifestação Destinatário fica para um change futuro junto com NFeDistribuicaoDFe).
- **Download automático de XML via NFeDistribuicaoDFe**: nesta etapa o XML entra por upload; o webservice com certificado digital é evolução futura da capability `nfe-ingestion`.
- **Compra automática**: o roteamento de canal (Fase 7) apenas recomenda; emissão de empenho/OF continua decisão humana.
- **Estoque de itens não-alimentares** (material de expediente, permanente): o escopo é subsistência (insumos de `kitchen.ingredient`).
- **Código de barras GS1-128/DataMatrix com AIs** (lote/validade embutidos no código): a leitura é de GTIN simples; AIs ficam para evolução futura.
- **Alterar o fluxo existente de ATA/pesquisa de preços**: `procurement_list` e `pesquisa_preco` permanecem como estão.
