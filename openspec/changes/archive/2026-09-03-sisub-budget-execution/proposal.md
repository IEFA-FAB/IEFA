# Proposal: sisub-budget-execution

## Why

O ciclo de estoque fechou a parte **física** (planejamento → NF-e → recebimento → ledger → produção → MCASP), mas a parte **orçamentária** ficou de fora: hoje o empenho é apenas um número digitado à mão em `finance.empenho` (12 colunas), sem crédito disponível, sem natureza de despesa, sem liquidação e sem pagamento. Na prática o gestor da unidade não consegue responder três perguntas básicas: *"tenho crédito para empenhar?"*, *"o que já foi liquidado deste empenho?"* e *"o fornecedor recebeu?"*. Falta também o painel próprio — empenho vive escondido dentro da tela de uma ATA.

A segunda metade da despesa pública (Lei 4.320: empenho → **liquidação** → **pagamento**) simplesmente não existe no sistema, e sem ela o recebimento definitivo do almoxarifado nunca vira fato contábil.

## What Changes

Afeta **sisub** (páginas novas no módulo `unit`, server fns), **packages/database** (schemas `finance` e `siafi_integration`, este último criado vazio desde 2026-06 exatamente para isto) e **apps/api** (parser dos relatórios do Tesouro Gerencial).

- **Crédito disponível**: dotação por UG × natureza de despesa × PTRES × fonte, com empenhado/saldo; emissão de empenho passa a checar crédito e alertar quando insuficiente.
- **Empenho como documento**: tipo (ordinário/estimativo/global), favorecido, ND, PTRES/UGR, fonte, valores empenhado/liquidado/pago/a liquidar; eventos de **reforço e anulação parcial** com histórico; inscrição em **restos a pagar** no encerramento do exercício. **BREAKING (interno)**: `finance.empenho` ganha colunas e passa a ter valores derivados — as telas atuais de ARP continuam funcionando, mas o registro manual simplificado deixa de ser o caminho principal.
- **Liquidação (NS)**: 2ª fase da despesa (art. 63 da Lei 4.320) vinculada ao **recebimento definitivo** e à NF-e — o elo que falta entre o físico e o contábil.
- **Pagamento (OB)**: ordem bancária vinculada à liquidação, com prazo médio de pagamento por fornecedor.
- **Importação Tesouro Gerencial**: upload de relatórios (CSV/XLSX) de crédito, NE, NS e OB; parser + persistência bruta em `siafi_integration` + conciliação automática contra os registros do sisub.
- **Conciliação SIAFI × sisub**: divergências explícitas (ex.: recebimento definitivo de 48 KG mas NS liquidou 50; empenho com saldo no sisub e zerado no SIAFI), com origem por documento (`manual` | `siafi`).
- **Navegação**: novas páginas em Gestão Unidade — Crédito, Empenhos, Liquidações, Pagamentos, Importação/Conciliação SIAFI.

## Capabilities

### New Capabilities

- `budget-credit`: crédito disponível por UG/ND/PTRES/fonte e verificação de saldo antes de empenhar.
- `empenho-document`: empenho como documento orçamentário completo, com reforço, anulação, saldos derivados e restos a pagar.
- `expense-liquidation`: liquidação (NS) vinculada ao recebimento definitivo e à NF-e.
- `expense-payment`: pagamento (OB) vinculado à liquidação, com prazo médio por fornecedor.
- `siafi-file-import`: importação e parse dos relatórios do Tesouro Gerencial (crédito, NE, NS, OB) com persistência bruta auditável.
- `siafi-reconciliation`: conciliação SIAFI × sisub com divergências acionáveis por documento.

### Modified Capabilities

- `arp-empenho-visibility`: o painel de empenho da ATA passa a exibir os saldos derivados do documento completo (a liquidar, liquidado, pago) e a apontar para a nova tela de empenhos; a soma local continua sendo a fonte de verdade do comprometimento.

## Impact

- **packages/database**: `finance.budget_credit`, `finance.empenho_event`, `finance.liquidacao`, `finance.pagamento`, colunas novas em `finance.empenho`; `siafi_integration.import_batch` + `import_row`; views de conciliação. RLS deny-all (acesso via server fns escopadas), padrão do módulo de estoque.
- **apps/api**: parser dos layouts do Tesouro Gerencial (endpoint admin de upload, mesmo padrão do parser de NF-e).
- **apps/sisub**: 5 páginas novas em `/unit/$unitId/*`, server fns `budget.fn.ts`/`liquidation.fn.ts`/`payment.fn.ts`/`siafi-import.fn.ts`, guard escopado por unidade (espelhando `requireStorageForKitchen`).
- **Integração com o estoque**: `inventory.goods_receipt` ganha vínculo opcional com `finance.liquidacao` — recebimento definitivo passa a sugerir a liquidação correspondente.
- **PBAC**: reusa o módulo `unit` (nível 1 leitura, 2 lançar, 3 conciliar/encerrar exercício).

## Não-objetivos

- **Escrita no SIAFI**: o sisub **não** emite NE/NS/OB nem transmite nada ao SIAFI — não existe API pública de escrita. O sistema é espelho, conciliador e memória de cálculo; a emissão continua no SIAFI/SIASG pelo ordenador.
- **Integração online com o SIAFI/Tesouro Gerencial**: esta fase é por **arquivo** (upload do relatório exportado). API/robô com certificado fica para change futuro — o schema já nasce com `origem` por documento para receber isso sem migração destrutiva.
- **Contabilidade completa**: não há razão contábil, lançamentos de partida dobrada nem plano de contas — só a execução da despesa (crédito → empenho → liquidação → pagamento).
- **Folha, diárias, contratos continuados**: escopo é subsistência (ND de gêneros alimentícios e correlatas).
- **Conformidade fiscal da NF-e** (manifestação, cancelamento, carta de correção): permanece fora, como no change de estoque.
