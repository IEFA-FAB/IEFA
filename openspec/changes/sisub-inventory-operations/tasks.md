# Tasks: sisub-inventory-operations

Ordem pensada para tirar o módulo do zero uso: o piloto começa depois da Fase 4. Cada fase é um PR (ou
trem) e depende das anteriores. Em **toda** fase: classificar as server fns novas no
`assurance-registry` (o contrato é exaustivo e reprova a suíte), `bun run check` + `bun run test` +
integração do sisub antes do PR.

## 0. Corrigir antes de operar

- [ ] 0.1 [database] Revogar `select` de `authenticated` em `inventory.goods_receipt_item_lot` (policy `using (true)`) e `execute` de `public/anon/authenticated` em todas as funções de `inventory`; teste de integração conferindo os privilégios
- [ ] 0.2 [database] Trigger BEFORE de custo: `insert … on conflict do nothing` + `select … for update` em `stock_cost`; `adjustment_in` sem custo ao custo médio, média zero → último custo de `receipt`, senão `raise`
- [ ] 0.3 [database] AFTER de custo: entrada sobre saldo ≤ 0 define a média como o custo da entrada
- [ ] 0.4 [database] `transfer_stock`: lote de origem `for update`, `transfer_in` ao `unit_cost` do `transfer_out`
- [ ] 0.5 [sisub-domain] Testes de operação: sobra sem custo não dilui; transferência preserva valor; entradas concorrentes equivalem a ordem sequencial; saldo negativo
- [ ] 0.6 [database] `register_production_issue` aloca lotes dentro da função com `for update` ordenado por id, ignora vencido (Brasília), sem validade por data de recebimento; remover alocação em TS de `confirmIssueFn`
- [ ] 0.7 [database] `stock_movement.occurred_at` (default `now()`); `close_month`, `stock_movement_period_lock` e `v_stock_balance` por `occurred_at` em `America/Sao_Paulo`; teste do movimento às 22:30 do último dia
- [ ] 0.8 [sisub] `fetchVarianceFn` com limites de mês em Brasília
- [ ] 0.9 [database] Trigger de imutabilidade em `goods_receipt_item` e `goods_receipt_item_lot` (`for share` do recebimento, recusa com `definitive_at` preenchido); `requireOpenReceipt` usa `isReceiptEditable`; esconder "Efetivar" fora de `provisional`
- [ ] 0.10 [sisub] `createReceiptFromNfeFn`: linha sem `ingredient_id` vira "não casada" (não `skipped`); efetivação bloqueia com linha não casada não recusada
- [ ] 0.11 [sisub] `supply-orders.tsx` grava `purchaseItemId`; teste do trânsito do MRP
- [ ] 0.12 [sisub] `listNfeDocumentsFn` sem `kitchen_id is null`; `createReceiptFromNfeFn` recusa nota sem cozinha
- [ ] 0.13 [sisub] `liquidation.fn.ts`: remover o `update goods_receipt set liquidacao_id` cego; mover a leitura do recebimento de `suggestLiquidationFromReceiptFn` para depois do guard
- [ ] 0.14 [root] Regra `.opengrep` para escrita em `inventory.*` fora das RPCs; PR da Fase 0

## 1. Leitor de código de barras

- [ ] 1.1 [sisub-domain] `barcode.ts`: `interpretBarcode(raw, config)` → `gtin | gs1 | lot_label | nfe_access_key | unknown`, reaproveitando `parseGtin`
- [ ] 1.2 [sisub-domain] Parser AI GS1 (01, 02, 10, 15, 17, 30, 37, 310n–315n), symbology identifiers, GS e substitutos; testes com dia `00` e peso
- [ ] 1.3 [sisub-domain] `cnpj.ts` e chave de acesso alfanuméricas (DV módulo 11 com ASCII − 48; CPF de emitente); testes com letras
- [ ] 1.4 [sisub] Componente `ScanInput` (campo focado, Enter/Tab não submete, refoco após leitura)
- [ ] 1.5 [sisub] Hook de captura global desligado em campo editável, parâmetros da calibração, término por timeout; testes com eventos sintéticos
- [ ] 1.6 [database] `inventory.scanner_profile` (usuário × cozinha) com os parâmetros calibrados
- [ ] 1.7 [sisub] Tela "Testar leitor" com medição de intervalo, AIs lidos e gravação do perfil
- [ ] 1.8 [sisub] Leitura por câmera: `BarcodeDetector` + `@zxing/browser` em import dinâmico; conferir CSP/`Permissions-Policy`
- [ ] 1.9 [sisub] `GtinScannerField` passa a usar `ScanInput`; remover `burstKeys`; PR da Fase 1

## 2. Núcleo do estoque operável

- [ ] 2.1 [database] `inventory.kitchen_stock_settings` com defaults; tela de configuração nível 3
- [ ] 2.2 [database] Tipos `issue_return`, `lot_split_in/out`; `reason_code` + CHECK por tipo; marcador `inventory.via_rpc` exigido por trigger
- [ ] 2.3 [sisub-domain] Atualizar `inventory-vocabulary.ts` (entradas/saídas, motivos com direção, evidência e natureza) e o contrato `sql-vocabulary` contra funções, `v_stock_balance` e `close_month`; teste de balancete com `issue_return`
- [ ] 2.4 [database] `stock_lot`: `short_code` único, `location`, `quarantined_at/by/reason`, `use_first`, `parent_lot_id`, `derivation`, `opened_at`, `received_at`
- [ ] 2.5 [database] `stock_adjustment` (+ itens, + anexos, `evidence_status`, `approval_exception_reason`)
- [ ] 2.6 [database] `post_stock_adjustment(p_actor, …)`: alçada no SQL com janela de 24 h, alocação sob trava, natureza "em apuração"; substituir `confirm_inventory_count` e `createAdjustmentFn` na mesma migration
- [ ] 2.7 [database] Bucket privado de evidências sem policy de cliente
- [ ] 2.8 [sisub] Upload por URL assinada de upload, validação por magic bytes, remoção de EXIF/GPS, URL de leitura ≤ 300 s
- [ ] 2.9 [root] `LGPD.md` e Política de Privacidade: fotos e documentos de apuração, retenção
- [ ] 2.10 [sisub] Fns de ajuste (criar, enviar, aprovar, rejeitar, completar evidência) e quarentena (marcar, liberar)
- [ ] 2.11 [sisub] Tela de ajuste com `ScanInput`, fila de aprovação e pendências de evidência
- [ ] 2.12 [sisub-domain] Parser de planilha de abertura (colunas, unidades canônicas, rejeições com motivo)
- [ ] 2.13 [sisub] Documento de abertura: importar planilha ou gerar folha do catálogo por classe
- [ ] 2.14 [sisub] Sugestão de custo por última ATA/pesquisa, "aceitar todas", fonte por linha; aprovação lança `opening_balance`
- [ ] 2.15 [sisub] Etiqueta interna: componente de impressão 58/80 mm e A4, individual e em lote
- [ ] 2.16 [database] `ingredient.shelf_life_after_opening_days`, `shelf_life_after_thaw_days`, `default_shelf_life_days`; função `split_lot`
- [ ] 2.17 [sisub] Ação abrir/fracionar/descongelar com etiqueta; PR da Fase 2

## 3. Recebimento rápido, com ou sem NF-e

- [ ] 3.1 [database] `core.units.cnpj` alfanumérico com função de DV e unique parcial; cadastro na administração de unidades
- [ ] 3.2 [api] Validação de `mod`, `tpAmb`, `cStat ∈ {100,150}`, `chNFe`, `digVal`
- [ ] 3.3 [api] Validação XMLDSig com cadeia ICP-Brasil; testes com XML adulterado
- [ ] 3.4 [api] Persistir `uTrib`, `qTrib`, componentes de valor, `finNFe`, referenciadas, resultado da autenticidade; completar nota `announced`
- [ ] 3.5 [sisub-domain] `nfe-cost.ts`: custo por item com rateio e invariante Σ = `vNF`
- [ ] 3.6 [database] `nfe_document.status` gravado + view de estado derivado; `unit_id`; "destinatário não confirmado"
- [ ] 3.7 [sisub] Destinatário → unidade → cozinhas da unidade; assumir nota; triagem global
- [ ] 3.8 [sisub] Entrada pela chave do DANFE criando `announced`
- [ ] 3.9 [sisub] Registro de consulta de situação da nota (atalho da SEFAZ montado da chave, validade de 3 dias, cancelamento)
- [ ] 3.10 [database] `procurement.contract_designation` (papéis, fonte `ato | empenho | permanente`, vigência, encerramento sem delete)
- [ ] 3.11 [sisub] Cadastro de designações por empenho/contrato/unidade (`unit` nível 3), com atalho para derivar do próprio empenho
- [ ] 3.12 [sisub] Guard de designação no provisório e no definitivo; gravar designação no recebimento e no termo
- [ ] 3.13 [database] `goods_receipt.source`; vínculo NF-e ↔ N recebimentos; `receipt_scan_event` (client id único, `seq`, estorno único, `based_on_seq`) com trigger de imutabilidade
- [ ] 3.14 [database] `purchase_item.quantity_tolerance_pct`; pendência fiscal e glosa no recebimento; motivos de recusa de linha
- [ ] 3.15 [sisub-domain] `receiving-scan.ts`: casamento cEAN → cEANTrib → alias → hierarquia, fator, peso 310n; testes
- [ ] 3.16 [database] `gs1_integration.gtin_alias` + fila na revisão global
- [ ] 3.17 [sisub] Fns de evento (leitura, ×N, `manual_confirm`, `bulk_confirm`, estorno, sobrescrita com `based_on_seq`)
- [ ] 3.18 [sisub] Tela de conferência — lista de linhas com esperado × conferido, não casadas visíveis
- [ ] 3.19 [sisub] Tela de conferência — `ScanInput`, ×N, aceitar conforme faturado, histórico e desfazer
- [ ] 3.20 [sisub] Diálogo "não consta na nota" (alias, troca, ignorar)
- [ ] 3.21 [sisub] Lotes na conferência: GS1, validade padrão, temperatura, local, etiquetas; validade mínima com motivo e revisão do gestor
- [ ] 3.22 [sisub] Recebimento sem NF-e (`delivery_note`/`ad_hoc`) com linhas por leitura/busca e custo do empenho/ATA
- [ ] 3.23 [database] `finalize_goods_receipt` recalcula dos eventos na transação; tolerância; pendência fiscal; divergência para linha sem conversão
- [ ] 3.24 [sisub] Recusa de linha (reposição prometida) e de recebimento inteiro
- [ ] 3.25 [database] Remover `goods_receipt.liquidacao_id`; ajustar `v_physical_accounting_reconciliation`
- [ ] 3.26 [sisub] `createLiquidacaoFn`: validações do vínculo (unidade, status, empenho, situação da nota, pendência fiscal); testes de IDOR
- [ ] 3.27 [sisub] "Registrar liquidação" pré-preenchida no recebimento; dias úteis desde o definitivo no painel
- [ ] 3.28 [sisub] Termo de recebimento com designação e exceções; PR da Fase 3

## 4. Saída do dia

- [ ] 4.1 [database] `production_task.issue_date` (default `production_date`); `ingredient.issue_package_quantity`
- [ ] 4.2 [database] `stock_issue_request` (+ itens com `suggested_qty`, `variance_reason`), status e fechamento
- [ ] 4.3 [database] `issue_stock(p_actor, emission_id, …)`: alocação sob trava, lote explícito, vencido só nível 3, falta sem lote com alerta
- [ ] 4.4 [database] `return_issue(…)`: limite por lote emitido líquido, custo médio das saídas do lote, mesma trava
- [ ] 4.5 [sisub-domain] Sugestão bruta por data de retirada com fator de correção e arredondamento à embalagem; teste contra o cálculo do MRP
- [ ] 4.6 [sisub-domain] `issue-variance.ts`: tolerância percentual + piso, linhas que exigem motivo
- [ ] 4.7 [sisub] Fns: abrir/recalcular, emitir, devolver, fechar, avulsa
- [ ] 4.8 [sisub] Job/consulta de fechamento automático `closed_unexplained` às 23:59 de Brasília e lista de pendências
- [ ] 4.9 [sisub] Tela "Saída" — lista sugerida com lotes antes de confirmar
- [ ] 4.10 [sisub] Tela "Saída" — `ScanInput` (GTIN, GS1, etiqueta) e busca manual
- [ ] 4.11 [sisub] Tela "Saída" — devolução e fechamento do dia com motivos
- [ ] 4.12 [sisub] Pós-`DONE` abre requisição do dia; descarte de sobra com `production_leftover_discard`; remover `register_production_issue`
- [ ] 4.13 [sisub] Relatório de variância com sugestão congelada, motivos, avulsas e `closed_unexplained`
- [ ] 4.14 [sisub] MRP: disponível exclui quarentena, desconta emitido de requisição aberta e saldo sem lote; PR da Fase 4

## 5. Vencimentos

- [ ] 5.1 [database] `inventory.expiry_alert_policy` com resolução ingrediente → classe → global → default
- [ ] 5.2 [sisub] Fn de vencimentos por faixa com `limit` e `total`, fuso de Brasília, perecíveis sem validade
- [ ] 5.3 [sisub] Tela "Vencimentos" com ações usar primeiro, transferir, quarentena, baixar
- [ ] 5.4 [sisub] Tela de transferência sobre `transfer_stock` (hoje sem UI)
- [ ] 5.5 [sisub] Badge no menu e bloco no painel da cozinha
- [ ] 5.6 [sisub] Bloco "vence no período planejado" no planejamento de cardápio
- [ ] 5.7 [database] Perfis de espelho do SILOMS (tabela de colunas, códigos de natureza, formatos) + perfil default
- [ ] 5.8 [sisub] Geração do espelho por competência com conferência contra o balancete; PR da Fase 5

## 6. Inventário

- [ ] 6.1 [database] `inventory_count`: `type`, `scope`, `scope_params`, `blind`, status, rodadas, expiração
- [ ] 6.2 [database] `count_scope_item` com índice único parcial para contagens abertas; materialização na abertura e inclusão de achados
- [ ] 6.3 [database] `inventory_count_entry` (`client_event_id` único, `counted_at` servidor, `device_at`, desvio de relógio, lote ou item)
- [ ] 6.4 [database] Função `balance_at(lot|item, instante)` por `occurred_at`, com regra item × lote
- [ ] 6.5 [database] `approve_inventory_count(p_actor, …)`: pré-condições (tarefa `DONE` sem requisição fechada, provisório), segregação, lança ajuste, regulariza sem lote; bloqueio de `close_month`
- [ ] 6.6 [sisub-domain] `count-math.ts`: referência temporal com offline limitado, soma × sobrescrita, recontagem por percentual e valor; testes dos cenários da spec
- [ ] 6.7 [sisub] Abrir contagem por tipo e escopo (incluindo `menu_cycle`); comissão para `annual`/`responsibility_transfer`
- [ ] 6.8 [sisub] Cegueira no servidor: leituras de saldo ocultam itens do escopo para nível 2 durante `counting`
- [ ] 6.9 [sisub] Folha de contagem com `ScanInput`, busca, lote novo e achado
- [ ] 6.10 [sisub] Fila IndexedDB — gravação local e medição de desvio de relógio
- [ ] 6.11 [sisub] Fila IndexedDB — reenvio ordenado idempotente e indicador de pendentes
- [ ] 6.12 [legal-kit] Declarar o IndexedDB da contagem no inventário da Política de Cookies — versão nova do documento (linha nova em `iefa.legal_documents`), porque ali o armazenamento local é inevitável: é o que permite contar sem sinal
- [ ] 6.13 [sisub] Revisão: diferenças, não contados, recontagem, aprovação e relatório de exceções; PR da Fase 6

## 7. A caminho e manifestação

- [ ] 7.1 [sisub] `fetchIncomingFn` (OF abertas, notas não recebidas, entregas sem nota, reposições) com `limit`, `total`, atraso e próxima ação
- [ ] 7.2 [sisub] Sugestão de vínculo NF-e ↔ empenho ↔ OF ↔ entregas sem nota; confirmação grava nos recebimentos
- [ ] 7.3 [sisub] Conversão da OF para unidade base no status da OF e no painel do empenho
- [ ] 7.4 [sisub] Tela "A caminho" substituindo o card "Notas aguardando recebimento"
- [ ] 7.5 [sisub] Registro manual de manifestação feita fora (210200/210220/210240) com prazo de 180 dias
- [ ] 7.6 [sisub] Caixa postal de XML: instruções ao fornecedor e importação em lote de vários XML de uma vez (caminho sem certificado); PR da Fase 7

## 7b. Coletor DF-e — PARADO (não há certificado; Q1 respondida em 2026-09-17)

- [ ] 7b.1 [design] Sem certificado, esta fase não é implementada. Antes de retomar: confirmar com o administrador do e-CNPJ da raiz (00.394.429) se já há consumo de DF-e por outro sistema, e que o coletor será único para a Força. Se a decisão for não ter certificado, remover `specs/nfe-dfe-collector` antes do archive
- [ ] 7b.2 [database] `inventory.nfe_dfe_cursor` (raiz, `ult_nsu`, `lease_until`, `blocked_until`, último 137)
- [ ] 7b.3 [api] Cliente SOAP `distNSU`/`consChNFe` com mTLS (PFX do Secrets Manager → PEM em memória, cadeia ICP-Brasil)
- [ ] 7b.4 [api] Worker com lease e compare-and-set do NSU
- [ ] 7b.5 [api] Regras 137/656/30 dias e alertas
- [ ] 7b.6 [api] Distribuição `resNFe`/`procNFe`, eventos de cancelamento, `210210` automático configurável
- [ ] 7b.7 [root] ECS scheduled task separada no manifesto de deploy (`apps.manifest.json`, `bun run generate:deploy`)
- [ ] 7b.8 [sisub] Emissão assistida de 210200/210220/210240; PR

## 8. Piloto

- [ ] 8.1 [sisub] Zerar filas de revisão de GTIN/unidade dos insumos da cozinha piloto
- [ ] 8.2 [sisub] Cadastrar CNPJ da unidade, designações e comissão da cozinha piloto
- [ ] 8.3 [sisub] Carga de abertura da cozinha piloto
- [ ] 8.4 [sisub] E2E Playwright: recebimento por chave → XML → conferência com leitura simulada → definitivo → liquidação
- [ ] 8.5 [sisub] E2E Playwright: requisição do dia → devolução → fechamento → contagem rotativa → ajuste
- [ ] 8.6 [sisub] Operação assistida por 4 semanas; critério de sucesso: contagem semanal com diferença abaixo da tolerância em ≥ 90 % das linhas
- [ ] 8.7 [sisub] Levar o espelho de uma competência ao pessoal do SILOMS e ajustar o perfil com o retorno (Q7)
- [ ] 8.8 [root] Revisar defaults de tolerância e alçada com os dados do piloto
- [ ] 8.9 [root] Arquivar o change e atualizar as specs
