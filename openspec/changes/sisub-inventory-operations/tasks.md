# Tasks: sisub-inventory-operations

## Status da entrega (2026-09-20)

| Fase | PR | Estado |
|---|---|---|
| 0 — Corrigir antes de operar | #355 | mergeado |
| 1 — Leitor de código de barras | #356 | mergeado |
| 2 — Núcleo do estoque operável | #357, #358 | mergeado |
| 3 — Recebimento rápido | #363, #364 | mergeado |
| — correções de revisão das fases 0–3 | #367 | mergeado (2026-09-18) |
| — autenticidade de NF-e sem exagero | #380 | mergeado (2026-09-18) |
| 4 — Saída do dia | #366 | mergeado (2026-09-19) |
| — contrato de reset, antes das migrations | #373 | mergeado |
| 5 — Vencimentos | #372 | mergeado (2026-09-19) |
| 6 — Inventário | #374 | mergeado (2026-09-19) |
| 7 — A caminho | #375 | mergeado (primeira metade: o painel) |
| 3 — conferência por leitura, na tela | #393 (substitui o #365) | mergeado (2026-09-19) |
| 7 — manifestação e caixa postal | — | não começou (7.2, 7.3, 7.5, 7.6) |
| 7b — Coletor DF-e | — | **parado**: não há certificado (Q1) |
| 8 — Piloto | — | **bloqueado** — ver "Prontidão do piloto" abaixo |

**O #393 cobre, pela descrição dele, o grosso de 3.17–3.19 e partes de 3.20 e 3.24**
(eventos atômicos e idempotentes, ×N de 1 a 999, estorno, aceitar conforme faturado, fila de
código fora da nota com associação ao insumo, recusa de linha com motivo). As caixas seguem
desmarcadas pela regra abaixo: marcar exige conferir cada subtarefa contra o código,
e em 3.20 (troca/ignorar) e 3.24 (recusa do recebimento inteiro) a descrição não basta.

## Prontidão do piloto (levantada em 2026-09-20, leitura no banco de produção)

A Fase 8 não começa só com código. Estado de produção hoje:

| Pré-condição | Estado |
|---|---|
| Cozinha operando cardápio/produção (a saída do dia se apoia nisso) | **nenhuma** — 4 `daily_menu` vivos no total, o mais recente para 2026-01-30; 0 `production_task` |
| CNPJ da unidade (8.2; casar NF-e pelo destinatário) | **0 de 35** unidades |
| UASG da unidade | 3 de 35 |
| Movimento de estoque, recebimento | 0 e 0 |
| Carga de abertura (8.3) | **sem ferramenta** — 2.12–2.14 não entregues; `opening_balance` existe só como motivo de ajuste |
| E2E 8.4/8.5 | E2E desligado do CI por decisão de custo (#278), e a conta E2E do `.env` é pessoal (ver `add-playwright-e2e` 8.2) |

Ordem que destrava o piloto, e quem decide:

1. **Escolher a cozinha piloto** — decisão do mantenedor/SDAB. Critério: uma cozinha que
   vá operar cardápio e produção no sisub no mesmo período. Sem isso a Fase 4 não tem o que
   baixar.
2. **2.12–2.14 (documento de abertura)** — é código, e é o bloqueio técnico de 8.3. Precisa
   da ordem de migration de sempre (declara → aplica → mergeia).
3. **8.2** — CNPJ, designações e comissão da cozinha escolhida, pela tela.
4. 8.1 e 8.3 com a cozinha escolhida; 8.4/8.5 só se o E2E voltar com banco de teste próprio.
   Se não voltar, trocar por roteiro manual assinado no início da operação assistida (8.6).

**As caixas abaixo não foram marcadas em massa.** Fase mergeada não garante que cada
subtarefa dela tenha entrado — e marcar por inferência é pior do que não marcar, porque
some com o item da lista de quem revisa. O que está confirmado como **NÃO entregue**,
apesar da fase correspondente já ter mergeado, e portanto precisa de PR próprio:

- **2.7, 2.8, 2.9** — bucket privado de evidências, upload por URL assinada e o registro
  no `LGPD.md`. O ajuste grava `evidence_reference` em texto; não há anexo de arquivo.
- **2.12, 2.13, 2.14** — documento de abertura de saldo (planilha, folha do catálogo,
  sugestão de custo). Sem ele, a cozinha nova começa com estoque zerado e o primeiro
  inventário vira uma montanha de `found_stock`.
- **3.3** — validação XMLDSig com cadeia ICP-Brasil. Hoje o parser confere só a
  coerência do arquivo (`mod`, `tpAmb`, `cStat`, `chNFe`, `digVal`) — isso não é
  autenticidade, e a única verificação real até lá é a consulta de situação na SEFAZ.
- **3.17–3.20** — eventos de conferência na tela (×N, estorno, sobrescrita com
  `based_on_seq`) e o diálogo "não consta na nota". O domínio (`receiving-scan.ts`) e as
  RPCs existem; a tela de conferência que os consome, não.
- **3.22** — recebimento sem NF-e. A coluna `goods_receipt.source` já aceita
  `delivery_note` e `ad_hoc`; nenhuma server fn cria recebimento por esses caminhos.
- **3.24** — recusa de linha e de recebimento inteiro.
- **3.25** — remover `goods_receipt.liquidacao_id`; a coluna segue em uso.
- **3.27, 3.28** — "Registrar liquidação" pré-preenchida, dias úteis no painel e o termo
  de recebimento com designação.
- **4.8** — fechamento automático `closed_unexplained` às 23:59 de Brasília. O status
  existe no banco; nada o aplica.
- **4.12, 4.13** — pós-`DONE` abrindo a requisição do dia, descarte de sobra e o
  relatório de variância.
- **5.7, 5.8** — espelho do SILOMS. Parado de propósito: o formato de ingestão é
  desconhecido (Q7). Vai depois da conversa com o pessoal do SILOMS, que é a 8.7.
- **6.10 a 6.12** — fila IndexedDB da contagem offline. O domínio está pronto
  (`resolveCountedAt`, `movedDuringSync`, `lineQuantity`) e o servidor já aceita
  lote idempotente de lançamentos, que é a metade difícil. Falta a fila no
  navegador — e ela **exige versão nova da Política de Cookies antes do uso**
  (linha nova em `iefa.legal_documents`, nunca `UPDATE`).
- **Comissão em contagem `annual` / `responsibility_transfer`** — a spec manda
  seguir a comissão designada sem exceção; a capability existe, o vínculo não.
- **7.2, 7.3, 7.5, 7.6** — confirmação do vínculo sugerido, conversão da OF para
  unidade base, registro manual de manifestação e importação em lote de XML.

## A ordem de aplicação de migration, que mudou no meio do caminho

Estabelecida em 2026-09-18, depois de migration aplicada adiantado quebrar
branch de outro app **quatro vezes num dia**:

> A suíte da `main` tem de passar contra o banco compartilhado em TODO instante.
> Logo: qualquer mudança no banco compartilhado é precedida, na `main`, pela
> mudança de teste/contrato que deixa a `main` verde tanto no estado velho
> quanto no novo.

Na prática, três passos: **declara → aplica → mergeia o recurso**. O passo 1 é
um PR minúsculo só de contrato (#373 é o exemplo); o passo 3 traz o teste de
integração no MESMO PR do código, porque o banco já tem o objeto.

Um critério anterior — "migration aditiva pode ser aplicada adiantada" — foi
descartado: `inventory_scanner_profile` e `inventory_operable_core` eram
puramente aditivas e derrubaram o `check-sisub` do mesmo jeito, porque o
contrato de reset de treino é default-deny e varre o banco vivo.

O invariante também **converte big-bang em expand/contract por construção**:
"verde antes e depois" é logicamente incompatível com derrubar objeto em uso.
Foi o que impediu a Fase 6 de dropar `inventory_count_item` no mesmo PR.

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
- [ ] 0.6 [database] `register_production_issue` aloca lotes dentro da função com `for update` ordenado por id, ignora vencido (Brasília), lote sem validade concorre pela data de recebimento no lugar da validade (não depois dos datados); remover alocação em TS de `confirmIssueFn`
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
- [ ] 3.4 [api] Persistir `uTrib`, `qTrib`, componentes de valor, `finNFe`, referenciadas, resultado da coerência do arquivo; completar nota `announced`
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
- [ ] 3.27 [sisub] "Registrar liquidação" pré-preenchida no recebimento; dias úteis desde o recebimento da nota no painel (IN SEGES/ME 77/2022, art. 7º, I; §4º suspende na pendência fiscal)
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
- [ ] 4.14 [sisub] MRP: disponível exclui quarentena e vencido e desconta saldo sem lote; demanda já atendida por saída emitida sai da demanda bruta (nunca do disponível); lote que vence no horizonte conta até o dia do vencimento; PR da Fase 4

## 5. Vencimentos

- [ ] 5.1 [database] `inventory.expiry_alert_policy` com resolução ingrediente na cozinha → classe na cozinha → ingrediente global → classe global → default
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
