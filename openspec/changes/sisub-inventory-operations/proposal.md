# Proposal: sisub-inventory-operations

## Why

O change `sisub-inventory-cycle` (PRs #117–#123, arquivado em 2026-09-03) construiu a **fundação**
do estoque: ledger imutável, lotes, custo médio, recebimento em dois estágios, baixa FEFO, MCASP e
MRP. Em 2026-09-17 **todas** as tabelas de `inventory`, `finance.empenho/liquidacao` e
`procurement.supply_order` estão com **0 linhas em produção** — o módulo nunca operou. A auditoria de
lacunas deste change (código + banco + benchmark + 4 revisões adversariais, ver `review.md`) mostra
que a fundação existe, mas as **operações do dia a dia de um rancho** não fecham:

- **Não há como começar.** Sem carga de abertura, a primeira contagem sai vazia e cada item teria de
  entrar como "achado", com custo digitado linha a linha.
- **Só se recebe o que tem NF-e.** Pão e leite diários com nota semanal, remessa de depósito de
  subsistência, guia de outra OM: não há onde lançar.
- **Não se sabe o que está chegando.** NF-e só entra por upload manual de XML; não há captura pela
  SEFAZ, lista "a caminho", nem CNPJ da unidade. O parser não confere autorização, assinatura nem
  ambiente — um `cStat` editado à mão vira base de liquidação.
- **A conferência com leitor não registra nada** e compara com o GTIN do catálogo, não com o da nota;
  item "SEM GTIN" não tem confirmação; item sem insumo casado some da conferência.
- **Quem efetiva o definitivo é "qualquer nível 3"**, e não o gestor/fiscal designado (Decreto
  11.246/2022, art. 25) — o termo e a liquidação apoiada nele ficam viciados.
- **Liquidação desligada do recebimento**, e a gravação do vínculo aceita recebimento de outra unidade.
- **Baixa para produção só depois do `DONE`**, sem leitor, sem motivo, sem devolução, com alocação FEFO
  fora da transação (dois lançamentos simultâneos deixam o lote negativo).
- **Vencimento é um card fixo de 30 dias**, o **FEFO consome lote vencido primeiro**, e lote sem validade
  sai por último (apodrece o hortifrúti).
- **Não há etiqueta interna** de lote nem registro de produto aberto/fracionado/descongelado, que a RDC
  ANVISA 216/2004 exige.
- **Inventário não é ferramenta de inventário**: não é cego, não tem escopo, não enxerga falta "sem lote",
  e o saldo de referência é lido na confirmação.
- **Ajuste não tem tela nem motivo tipado.**
- **Defeitos de valoração e de segurança já em produção**: `adjustment_in` sem custo entra a R$ 0 e
  dilui o custo médio; transferência entra a custo do lote; fechamento mensal corta o mês em UTC;
  `inventory.goods_receipt_item_lot` está legível por qualquer sessão autenticada via PostgREST e
  `inventory.transfer_stock` executável por `authenticated`.

## What Changes

Afeta **sisub** (rotas `/storage/$kitchenId/*`, `/unit/$unitId/liquidations`, planejamento, server fns),
**packages/sisub-domain**, **packages/database** (`inventory`, `core`, `finance`, `procurement`,
`gs1_integration`), **api** (parser de NF-e; coletor DF-e condicionado) e **legal-kit** (inventário de
armazenamento local e de dado pessoal em evidências).

As fases estão ordenadas para **tirar o módulo do zero uso** o quanto antes (ver `tasks.md`):

1. **Fase 0 — Corrigir antes de operar**: custo de entradas sem custo e de transferência; FEFO sem
   vencido e FIFO para lote sem validade; alocação de lote sob `FOR UPDATE` dentro da RPC; imutabilidade
   do recebimento no banco; fuso de Brasília no fechamento; grants de `inventory` fechados; IDOR na
   liquidação; notas sem cozinha.
2. **Fase 1 — Leitor de código de barras**: campo de leitura focado como caminho principal, captura
   global como complemento calibrado; câmera; parser GS1 (inclui peso variável 310n); chave de acesso
   **alfanumérica** (NT 2025.001).
3. **Fase 2 — Núcleo do estoque operável**: configurações por cozinha; documento de ajuste com motivo
   tipado; quarentena de lote; **carga de abertura** por planilha ou catálogo; **etiqueta interna** de
   lote e ação **abrir/fracionar/descongelar** com validade derivada.
4. **Fase 3 — Recebimento rápido, com ou sem NF-e**: origem `nfe | delivery_note | ad_hoc`; NF-e por XML ou
   leitura do DANFE com validação real (cStat 100/150, assinatura, `digVal`, `tpAmb`, `mod`);
   conferência por leitura com "×N" e "aceitar conforme faturado"; item sem GTIN confirmado à mão;
   provisório completável depois; custo com desconto/frete/ST; pendência fiscal de recebimento a menor;
   **designação de fiscal e gestor** para provisório e definitivo; liquidação oferecida e validada.
5. **Fase 4 — Saída do dia**: requisição por dia com refeição por linha, sugerida pela produção quando
   houver planejamento; três modos (lista, leitura, busca); saída a menor/maior livre, **motivo pedido no
   fechamento do dia** e só acima da tolerância com piso absoluto; complementar, devolução, avulsa.
6. **Fase 5 — Vencimentos e espelho do SILOMS**: faixas por classe/item, ações (usar primeiro,
   transferir, baixar), bloco no **planejamento de cardápio**, e exportação da competência para o SILOMS
   com perfil de layout configurável.
7. **Fase 6 — Inventário**: tipos da IN 205/88, escopo, cega, referência pelo **instante físico**
   (`occurred_at` do movimento, horário do dispositivo validado), recontagem e segregação configuráveis,
   comissão para anual e transferência de responsabilidade.
8. **Fase 7 — A caminho e entrada de XML em lote**: painel OF + NF-e, vínculo sugerido com empenho,
   importação de vários XML (caixa postal do fornecedor), manifestação registrada manualmente; **coletor
   DF-e parado por falta de certificado**.
9. **Fase 8 — Piloto**: uma cozinha, 4 semanas, saldo batendo na contagem semanal.

## Capabilities

### New Capabilities

- `barcode-capture`: leitura por campo focado, captura global calibrada e câmera; interpretação GS1 e da
  chave de acesso alfanumérica.
- `stock-adjustment`: documento de ajuste com motivo tipado, evidência, alçada, quarentena e apuração.
- `stock-opening-balance`: carga de abertura por planilha ou catálogo.
- `stock-lot-labeling`: etiqueta interna de lote e derivação por abertura, fracionamento ou descongelamento.
- `receipt-designation`: designação de gestor, fiscais e comissão por contrato/empenho, exigida pelo
  recebimento e pelo inventário formal.
- `incoming-deliveries`: painel "A caminho" e vínculo sugerido NF-e ↔ empenho ↔ OF.
- `stock-count`: inventário físico com tipo, escopo, contagem cega, referência temporal, recontagem e aprovação.
- `stock-expiry-monitoring`: limites de validade, painel por faixa, ações e aviso ao planejamento.
- `nfe-dfe-collector`: coletor `NFeDistribuicaoDFe` — **não implementado agora** (a OM não tem
  certificado digital e a raiz de CNPJ é do COMAER inteiro); fica especificado para quando houver
  certificado, e é removido antes do archive se a decisão for não ter.

### Modified Capabilities

- `nfe-ingestion`: validação de autenticidade, entrada pela chave, ciclo de vida, custo por item.
- `goods-receipt`: origens sem NF-e, conferência por leitura, recusa, pendência fiscal, imutabilidade,
  competência designada.
- `expense-liquidation`: vínculo validado, glosa, prazo.
- `production-stock-issue`: requisição do dia, motivo no fechamento, modos, devolução, FEFO/FIFO.
- `stock-ledger`: tipos e `occurred_at`, valoração, transferência, lote em quarentena.
- `stock-accounting-mcasp`: competência por `occurred_at` no fuso de Brasília; rótulo gerencial;
  exportação por motivo.
- `stock-replenishment-mrp`: disponível exclui quarentena e vencido; considera requisições em rascunho.
- `gtin-gs1-catalog`: GTIN aprendido no recebimento vira alias pendente de revisão, sem sobrescrever o catálogo.

## Impact

- **packages/database**: `core.units.cnpj` (alfanumérico); `inventory.kitchen_stock_settings`;
  `stock_movement.occurred_at` e `reason_code`, tipo `issue_return`; `stock_lot` ganha `location`,
  `quarantined_at`, `use_first`, `parent_lot_id`, `opened_at`; tabelas `stock_adjustment` (+ itens, +
  anexos), `receipt_scan_event`, `stock_issue_request` (+ itens), `expiry_alert_policy`,
  `contract_designation`, `count_scope_item`, `gs1_integration.gtin_alias`; remoção de
  `goods_receipt.liquidacao_id` (redundante com `liquidacao.goods_receipt_id`). Tudo sem dado a migrar.
- **packages/sisub-domain**: `barcode.ts`, `count-math.ts`, `issue-variance.ts`, `adjustment-reasons.ts`,
  `receiving-scan.ts`, `nfe-cost.ts`, com teste de contrato do vocabulário SQL.
- **apps/sisub**: telas novas (Saída, Ajustes, Vencimentos, Abertura, Etiquetas, A caminho, Leitor);
  reescrita da conferência e da contagem; bloco de vencimentos no planejamento.
- **apps/api**: validação de autenticidade da NF-e; coletor como task agendada separada (se Q1).
- **legal-kit / LGPD**: chaves de `localStorage`/IndexedDB no inventário da Política de Cookies; fotos e
  documentos de apuração como dado pessoal, com retenção, **antes** de entrar em uso.
- **PBAC e designação**: `storage` 1 ler · 2 conferir, lançar saída, contar, ajuste até a alçada · 3
  aprovar. Provisório e definitivo exigem **designação** vigente além do PBAC.

## Não-objetivos

- **Emitir NS/liquidar no SIAFI.** O sisub registra, valida e concilia; a NS nasce no SIAFI.
- **Ser a escrituração oficial do almoxarifado agora.** O SILOMS e o SIAFI seguem oficiais; o sisub é o
  operacional e gera o **espelho por competência** para lançamento lá, com layout parametrizado. Substituir
  o SILOMS é objetivo declarado do mantenedor, mas é decisão de outro change.
- **Assinatura digital do termo** (ICP/gov.br): segue no processo (SEI).
- **Conduzir sindicância/TCA/TCE**: o sisub registra, anexa e deixa o valor em apuração.
- **Registro contínuo de temperatura de câmara**: aceita-se o valor medido como evidência.
- **Emitir NF-e de devolução**: a nota é do fornecedor; o sisub exige a chave dela.
- **Itens não alimentares** e **consumo por venda (PDV)**.
