## 0. Base (feita)

- [x] 0.1 [sisub] Pesquisa de preços na unidade do item, teto da mediana, preço só com pesquisa (PR #455)

## 1. Declaração e migration

- [ ] 1.1 [sisub] Declarar `procurement.procurement_segment` em `RESET_EXCLUSIONS` (antes da migration)
- [ ] 1.2 [database] Migration `procurement_planning_flows`: tabelas `procurement_segment` e `procurement_segment_rule`; colunas em `procurement_list`, `procurement_list_snapshot_component`, `kitchen_ata_draft`, `procurement_pesquisa_preco`, `procurement_pesquisa_preco_amostra` e `compras_amostra`; `upsert_compras_amostras` com fornecedor
- [ ] 1.3 [database] Aplicar no banco compartilhado (`db:push --dry-run` e depois push); `audit:rls` verde
- [ ] 1.4 [database] Regerar `generated.ts` (`db:types`) e Drizzle (`db:drizzle:pull`)

## 2. Segmentação

- [ ] 2.1 [sisub-domain] `resolveSegment` puro (especificidade, exclusão, conflito) com testes
- [ ] 2.2 [sisub-domain] Operações: listar, criar, editar e remover contratação e regras (`unit:2`), avaliação do universo de itens da OM (atribuídos, sem contratação, conflitos)
- [ ] 2.3 [sisub-domain] `calculateAtaNeeds` com `segmentId` opcional e contagem de excluídos; `procurement_list.segment_id` no rascunho
- [ ] 2.4 [sisub] Tela `/unit/$unitId/procurement/segments`: lista, editor de regras com árvore de pastas pesquisável, prévia de itens, conflitos e sem contratação
- [ ] 2.5 [sisub] Wizard: escolha da contratação no passo 1, vigência herdada, aviso de itens fora
- [ ] 2.6 [sisub] Promover `procurement_segment` a `RESET_STEPS`; integração de segmentação no banco real

## 3. Terminologia e previsão de demanda

- [ ] 3.1 [sisub] Textos do anexo, do CSV e dos limites (tabela D9 do design)
- [ ] 3.2 [sisub] "Suprimentos" → "Previsão de demanda" (navegação, páginas, editor, selo de importação)
- [ ] 3.3 [sisub-domain] `markKitchenDraftReviewed` (`unit:2` na OM da cozinha) ao importar; retorno visível na cozinha

## 4. Fluxos

- [ ] 4.1 [sisub-domain] `fetchProcurementPlanningStatus(unitId)` e `fetchDemandForecastStatus(kitchenId)`
- [ ] 4.2 [sisub] Modelo de etapas puro (`src/lib/flows/`) com testes
- [ ] 4.3 [sisub] Componentes de fluxo (índice, etapa, pendência) e rotas nos dois módulos; "Voltar ao fluxo" nas telas de destino
- [ ] 4.4 [sisub] Item "Fluxos" na navegação e breadcrumbs

## 5. Documentos e pesquisa auditável

- [ ] 5.1 [sisub-domain] Gravar `created_by`, fornecedor e conversão por amostra; `explainAtaNeeds`; `fetchPriceResearchDossier(ataId)`
- [ ] 5.2 [sisub] `auditPriceResearch` e amostragem reproduzível (puros, com testes)
- [ ] 5.3 [sisub] Copiar tabela (HTML e TSV, em partes), CSV com colunas novas, orçamento sigiloso, percentual de cotação mínima
- [ ] 5.4 [sisub] Impressão da memória de cálculo das quantidades
- [ ] 5.5 [sisub] Impressão do relatório de pesquisa de preços, CSV da série e SHA-256

## 6. Verificação

- [ ] 6.1 [sisub] E2E na sentinela: fluxo da cozinha → envio → fluxo da unidade → segmentação → anexo por contratação → pesquisa → documentos
- [ ] 6.2 [sisub] Catálogo de edge cases (Gestão Unidade e Gestão Cozinha) com os casos novos
- [ ] 6.3 [root] `bun run check`, `bun run lint --concurrency=2`, `bun run test --concurrency=2`
