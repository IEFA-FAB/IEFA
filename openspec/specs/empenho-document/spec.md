# empenho-document Specification

## Purpose
TBD - created by archiving change sisub-budget-execution. Update Purpose after archive.
## Requirements
### Requirement: Empenho como documento orçamentário completo
`finance.empenho` SHALL registrar, além dos campos atuais: tipo (`ordinario` | `estimativo` | `global`), favorecido (CNPJ e nome), natureza de despesa, PTRES, fonte, UG emitente, exercício e origem (`manual` | `siafi`). Empenhos preexistentes MUST ser migrados como `origem = manual` com exercício derivado da data.

#### Scenario: Registro completo
- **WHEN** o gestor registra um empenho informando tipo, favorecido, ND, PTRES e fonte
- **THEN** o documento é criado com esses atributos e origem `manual`

#### Scenario: Backfill preserva o histórico
- **WHEN** a migration roda sobre empenhos já existentes
- **THEN** cada um recebe `origem = manual` e `exercicio` derivado de `data_empenho`, sem perda de dados

### Requirement: Reforço e anulação por evento
Alterações de valor SHALL ser registradas em `finance.empenho_event` (tipo `reforco` | `anulacao` | `cancelamento`, valor, data, documento, justificativa obrigatória) — o valor original do empenho MUST NOT ser editado. O valor vigente é o original somado aos eventos.

#### Scenario: Reforço
- **WHEN** um empenho de R$ 10.000 recebe reforço de R$ 5.000
- **THEN** o valor vigente passa a R$ 15.000, com o evento visível no histórico

#### Scenario: Anulação parcial
- **WHEN** um empenho de R$ 10.000 sofre anulação de R$ 3.000 com justificativa
- **THEN** o valor vigente passa a R$ 7.000 e o histórico registra autor, data e justificativa

#### Scenario: Evento sem justificativa é rejeitado
- **WHEN** um reforço ou anulação é submetido sem justificativa
- **THEN** o sistema rejeita a operação

### Requirement: Saldos derivados e invariante da cadeia
O sistema SHALL derivar por empenho: valor vigente, liquidado (Σ liquidações), pago (Σ pagamentos) e saldo a liquidar. O banco MUST garantir a invariante `pago ≤ liquidado ≤ vigente`.

#### Scenario: Painel do empenho
- **WHEN** o gestor abre um empenho com R$ 15.000 vigentes, R$ 9.000 liquidados e R$ 4.000 pagos
- **THEN** a tela mostra saldo a liquidar R$ 6.000 e valor a pagar R$ 5.000

#### Scenario: Liquidação acima do empenhado é rejeitada
- **WHEN** uma liquidação faria o total liquidado exceder o valor vigente do empenho
- **THEN** o banco rejeita a operação com erro explícito

### Requirement: Inscrição em restos a pagar
No encerramento do exercício, o sistema SHALL permitir inscrever empenhos em restos a pagar: saldo a liquidar → `nao_processado`; liquidado e não pago → `processado`. A inscrição MUST ser ação explícita registrada como evento — nunca automática.

#### Scenario: Inscrição de RP não-processado
- **WHEN** o gestor encerra o exercício e um empenho tem R$ 6.000 a liquidar
- **THEN** o empenho é marcado como RP não-processado do exercício, com evento no histórico

