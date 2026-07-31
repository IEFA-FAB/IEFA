# Tasks: sisub-budget-execution

> Cada grupo = uma fase = 1 PR. `bun run check` + gate transacional de integração antes de cada merge. Após cada migration: `db:types` + `typecheck --force`.

## 1. Fase 1 — Staging de importação SIAFI

- [x] 1.1 [database] Migration `siafi_integration.import_batch` (arquivo, `content_hash` UNIQUE, `report_type` CHECK, competência, autor, contagens, status) + `import_row` (linha crua jsonb, resultado do parse, vínculo com o domínio) + RLS deny-all
- [x] 1.2 [api] Parser de relatório do Tesouro Gerencial: CSV + XLSX (lib `xlsx` já existe), mapa de sinônimos de coluna por `report_type`, normalização pt-BR de moeda (`1.234,56`) e data (`DD/MM/AAAA`), guard "zero linhas reconhecidas = layout desconhecido"
- [x] 1.3 [api] Endpoint `POST /api/admin/siafi/import` (admin-secret, mesmo padrão do NF-e): valida colunas obrigatórias por tipo ANTES de persistir, grava lote + linhas cruas, devolve resumo
- [x] 1.4 [api] Testes do parser com fixtures dos 4 tipos (crédito, NE, NS, OB), incluindo cabeçalhos alternativos, moeda pt-BR e arquivo de layout desconhecido
- [x] 1.5 [sisub] `siafi-import.fn.ts` (upload proxy + listar lotes + reprocessar linhas cruas) com guard escopado por unidade

## 2. Fase 2 — Crédito disponível

- [ ] 2.1 [database] Migration `finance.budget_credit` (UNIQUE unit×ug×nd×ptres×fonte×competencia, dotação/empenhado/saldo, `snapshot_at`, `import_batch_id`) + RLS
- [ ] 2.2 [sisub-domain] Cálculo puro do comprometimento local e saldo projetado (empenhos ativos após `snapshot_at`) — com testes unit cobrindo "nunca somar oficial com local"
- [ ] 2.3 [sisub] `budget.fn.ts` (listar crédito com projeção, aplicar snapshot do lote) + tela `/unit/$unitId/credit` com as três grandezas rotuladas e destaque de snapshot antigo (>7 dias)
- [ ] 2.4 [sisub] Alerta de crédito na emissão de empenho (não-bloqueante, informando a idade do snapshot; classificação sem crédito → marca "sem verificação")

## 3. Fase 3 — Empenho como documento

- [ ] 3.1 [database] Migration: colunas novas em `finance.empenho` (tipo, favorecido, nd, ptres, fonte, ug_emitente, exercicio, origem, siafi_synced_at, rp_*) + backfill (`origem=manual`, exercício da data)
- [ ] 3.2 [database] Migration `finance.empenho_event` (reforço/anulação/cancelamento com justificativa obrigatória) + views de valor vigente/liquidado/pago/a liquidar
- [ ] 3.3 [database] Trigger da invariante `pago ≤ liquidado ≤ vigente`
- [ ] 3.4 [sisub-domain] Operation `empenho`: aplicar evento, derivar saldos, inscrever em restos a pagar (com testes unit)
- [ ] 3.5 [sisub] Tela `/unit/$unitId/empenhos` (lista com filtros por ND/exercício/status, detalhe com histórico de eventos e saldos)
- [ ] 3.6 [sisub] Fluxo de encerramento de exercício: inscrição em RP processado/não-processado como ação explícita
- [ ] 3.7 [sisub] Atualizar o painel da ATA: exibir liquidado/pago/a liquidar por empenho + atalho para o documento (delta `arp-empenho-visibility`); anulação passa a gerar evento

## 4. Fase 4 — Liquidação e pagamento

- [ ] 4.1 [database] Migration `finance.liquidacao` (NS única por unidade+exercício, valor, empenho, `goods_receipt_id`, `nfe_document_id`, competência, origem) + guard de não exceder o empenho vigente
- [ ] 4.2 [database] Migration `finance.pagamento` (OB, banco/agência/conta, liquidação de origem) + guard de não exceder o liquidado; `inventory.goods_receipt.liquidacao_id`
- [ ] 4.3 [sisub-domain] Cálculo do valor sugerido de liquidação a partir do recebimento definitivo (Σ recebido × custo unitário) + prazo médio de pagamento por fornecedor (testes unit)
- [ ] 4.4 [sisub] `liquidation.fn.ts` + `payment.fn.ts` (guards escopados por unidade; liquidação NUNCA criada automaticamente)
- [ ] 4.5 [sisub] Tela `/unit/$unitId/liquidations` (lista, registro com sugestão pré-preenchida a partir do recebimento, divergência sinalizada)
- [ ] 4.6 [sisub] Tela `/unit/$unitId/payments` (contas a pagar por antiguidade, registro de OB, prazo médio por fornecedor)
- [ ] 4.7 [sisub] Atalho na tela de recebimento definitivo: "registrar liquidação" com valor pré-preenchido

## 5. Fase 5 — Conciliação

- [ ] 5.1 [database] View `finance.v_siafi_reconciliation` (por documento: só sisub / só SIAFI / divergente) + tabela de divergências aceitas com justificativa
- [ ] 5.2 [sisub] Aplicação do lote ao domínio: crédito substitui snapshot; NE/NS/OB upsert por número; enriquecimento sem sobrescrita silenciosa; marca `origem=siafi` + vínculo com o lote
- [ ] 5.3 [sisub] Tela `/unit/$unitId/siafi` (importar arquivo, revisar resumo antes de aplicar, lista de lotes)
- [ ] 5.4 [sisub] Painel de divergências com resolução explícita (adotar SIAFI / manter e justificar) e reaparecimento quando a divergência persiste em novo lote
- [ ] 5.5 [sisub] Conciliação físico × contábil: recebimento definitivo sem liquidação (>30 dias), liquidação sem recebimento, diferença de valor

## 6. Navegação, testes e encerramento

- [ ] 6.1 [sisub] NavItems: adicionar Crédito, Empenhos, Liquidações, Pagamentos e SIAFI ao módulo `unit` (níveis: 1 leitura, 2 lançar, 3 conciliar/encerrar)
- [ ] 6.2 [sisub] `requireUnitScope` em `src/lib/unit-auth.server.ts` (irmão do `requireStorageForKitchen`) aplicado em todas as fns novas
- [ ] 6.3 [sisub] Teste de integração transacional (banco real + rollback): crédito → empenho → reforço → liquidação vinculada ao recebimento → pagamento → invariantes e conciliação
- [ ] 6.4 [sisub] Smoke Playwright das 5 telas novas (read-only, padrão do `storage.spec.ts`)
- [ ] 6.5 [database] Adicionar as suítes novas ao `test:integration:gate` do CI
- [ ] 6.6 [root] `bun run check` + `bun run test` + gate de integração verdes
- [ ] 6.7 [docs] Página de execução orçamentária em `apps/docs` (fluxo, o que vem do SIAFI, limites do espelho)
