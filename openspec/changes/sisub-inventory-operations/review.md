# Revisão adversarial (2026-09-17)

Quatro revisores independentes atacaram a primeira versão do change, cada um com uma lente. Esta
tabela registra os achados que mudaram o desenho e onde foram tratados. Achados que confirmaram o
estado atual do código estão na Fase 0 de `tasks.md`.

## Legal, contábil e fiscal

| Sev. | Achado | Tratamento |
|---|---|---|
| Crítico | CNPJ e chave de acesso alfanuméricos (NT 2025.001) quebravam parser e cadastro | D1; `barcode-capture`, `nfe-ingestion`; task 1.3 |
| Crítico | Nível PBAC não é competência para receber (Decreto 11.246/2022, art. 25) | D6; nova capability `receipt-designation` |
| Alto | Exigir só `cStat 100` recusa nota válida com `150` | D2; `nfe-ingestion` |
| Alto | `cStat` no arquivo não prova autenticidade (assinatura, `digVal`, `tpAmb`, `mod`) | D2; tasks 3.2–3.3 |
| Alto | Cancelamento posterior (110111) não detectado antes de definitivo e liquidação | D2; consulta de situação registrada |
| Alto | Manifestação mal mapeada (210200/210220/210240, prazo de 180 dias) | D3; `nfe-dfe-collector`; task 7.5 |
| Alto | Recebimento a menor não fecha no fiscal (carta de correção não altera quantidade) | D5; pendência fiscal e glosa em `goods-receipt` |
| Alto | Furto/extravio não pode ir direto para perda nem travar esperando sindicância | D13; natureza "em apuração" |
| Alto | Escrituração oficial em outro sistema | Q2 respondida: SILOMS + SIAFI; D21 espelho por competência, relatórios gerenciais |
| Médio | Custo ignora desconto, frete, ST | D9; `nfe-ingestion` custo por item |
| Médio | Prazo de liquidação (IN SEGES/ME 77/2022) | D19; `expense-liquidation` |
| Médio | Tipos de inventário da IN 205/88 e comissão | D15; `stock-count`, `receipt-designation` |
| Médio | Abertura como `count_gain` contamina resultado | D14; motivo `opening_balance` |
| Médio | Faltavam doação, recolhimento sanitário, termo de inutilização; apoio a outra OM é transferência | D13; D11; Q5 |
| Médio | Provisório com perecível já consumido | Pré-condição da contagem e provisório completável (D5, D15) |

## Dados, concorrência e segurança

| Sev. | Achado | Tratamento |
|---|---|---|
| — | **Em produção hoje**: `goods_receipt_item_lot` legível por `authenticated`; `transfer_stock` executável por `authenticated`; fechamento mensal em UTC; `update` cego de liquidação em recebimento de outra unidade | Task 0.1, 0.7, 0.13 |
| Crítico | Offline (`counted_at` no reenvio) contradizia a referência temporal | D15 (horário do dispositivo limitado e corrigido) |
| Crítico | Movimento lançado com atraso gera perda em dobro na contagem | D8 `occurred_at`; pré-condições da aprovação |
| Crítico | Trava por requisição não protege o lote | D10 alocação sob `for update` dentro da RPC |
| Crítico | Emissão e leitura sem idempotência | `emission_id`/`client_event_id` únicos, estorno único |
| Alto | Corrida no custo médio e na primeira linha de `stock_cost` | D9 |
| Alto | Média errada sobre saldo negativo | D9 |
| Alto | Contagem por item e por lote do mesmo item inflava estoque | D15 regra item × lote |
| Alto | Segregação "no SQL" inviável com service role | D7 (`p_actor`, INVOKER, revoke, marcador de sessão) |
| Alto | Imutabilidade só na API; duas fontes de quantidade | D5 trigger + recálculo dos eventos |
| Alto | Contagem cega vazava pelo painel de saldo | D15 cegueira no servidor |
| Alto | Coletor DF-e: raiz compartilhada, lock no pooler, certificado | D1 lease com fencing, task separada |
| Médio | Exclusão de sobreposição de escopos heterogêneos | D15 `count_scope_item` |
| Médio | Várias cozinhas por unidade de compra | `nfe-ingestion` destinatário → cozinhas da unidade |
| Médio | Anexos: policy de Storage não avalia PBAC; LGPD | D20 |
| Médio | Sobrescrita concorrente na conferência | `based_on_seq` |
| Médio | Ajuste fatiado para fugir da alçada | D7 janela de 24 h |
| Médio | Competência da contagem aprovada no mês seguinte | `stock-accounting-mcasp` |

## Operação real do rancho

| Sev. | Achado | Tratamento |
|---|---|---|
| Crítico | Não havia recebimento sem NF-e (pão diário, remessa de depósito) | D4 |
| Crítico | Carga inicial inviável pela contagem | D14; `stock-opening-balance` |
| Crítico | Saída dependia de planejamento e pedia motivo a cada emissão | D11 motivo no fechamento, piso absoluto, sem plano = livre |
| Crítico | Offline invalidava a referência temporal | D15 |
| Alto | Leitura GS1 com lote quase não existe em varejo; RDC 216 exige etiqueta após abertura | D12; `stock-lot-labeling` |
| Alto | 40 linhas com caminhão esperando | D5 ×N, aceitar conforme faturado, provisório completável |
| Alto | Ajuste pendente deixava lote estragado disponível | D13 quarentena imediata |
| Alto | Segregação que cozinha pequena não cumpre | D7 `strict`/`dual` com exceção registrada |
| Alto | Lote sem validade saía por último | D10 FIFO por recebimento |
| Alto | Ordem das fases ruim para adoção | `tasks.md` reordenado; DF-e e A caminho no fim |
| Médio | Heurística de rajada frágil | D17 campo focado primeiro, calibração medida |
| Médio | Vencimento não chegava ao planejador | D16 bloco no planejamento |
| Médio | Peso variável 310n | D5; `barcode-capture` |
| Médio | Troca pelo fornecedor sem pendência | Recusa com reposição prometida em "A caminho" |
| Médio | Contagem esquecida bloqueia as outras | Expiração em 7 dias |

## Consistência interna

| Sev. | Achado | Tratamento |
|---|---|---|
| Alto | `issue_return` não chegava a vocabulário, view e `close_month` | Task 2.3; `stock-ledger` MODIFIED |
| Alto | Dependências entre fases quebradas; `assurance-registry` tardio | Ordem nova; regra em todas as fases |
| Alto | `stock_policy` não comporta configuração por cozinha | D18 `kitchen_stock_settings` |
| Alto | Nível 2 de estoque escreveria no catálogo global | D5 alias; `gtin-gs1-catalog` |
| Alto | Nota pela chave ficava invisível (chave não traz destinatário) | D1 herda a unidade da cozinha |
| Alto | `reason_code` obrigatório quebrava descarte de sobra | `production_leftover_discard` |
| Médio | Custo de `issue_return` definido duas vezes; status da NF-e em três listas; congelamento da sugestão | Unificados em D9, D3, D11 |
| Médio | MODIFIED perdiam texto; specs vigentes contraditórias (transferência, MRP, MCASP) | Deltas completos em `stock-ledger`, `stock-accounting-mcasp`, `stock-replenishment-mrp`, `production-stock-issue` |
| Médio | LGPD: `localStorage`, IndexedDB, fotos | D20; tasks 1.7, 2.9, 6.12 |
| Médio | Liquidação N:1 já existe em `liquidacao.goods_receipt_id` | D19 remove `goods_receipt.liquidacao_id` |
| Baixo | Tasks acima de 2 h | Quebradas |
| Baixo | Coletor DF-e como SHALL sem decisão | Capability separada, removida se Q1 negativa |

## Não verificado pelos revisores

Norma de subsistência do COMAER; contas PCASP de perda e de responsável em apuração; base normativa para
doação de alimentos por órgão público; obrigação de manifestação por órgão federal; raiz de CNPJ das OMs.
