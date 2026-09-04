# budget-credit Specification

## Purpose
TBD - created by archiving change sisub-budget-execution. Update Purpose after archive.
## Requirements
### Requirement: Crédito disponível por classificação orçamentária
O sistema SHALL manter `finance.budget_credit` por `(unit_id, ug, nd, ptres, fonte, competencia)` com dotação, empenhado e saldo **conforme o SIAFI**, além de `snapshot_at` e o lote de importação de origem. Os valores MUST ser tratados como snapshot datado — o sistema NUNCA recalcula o saldo oficial.

#### Scenario: Exibição do crédito
- **WHEN** o gestor abre a tela de Crédito da unidade
- **THEN** cada linha mostra ND, PTRES, fonte, dotação, empenhado (SIAFI), saldo (SIAFI) e a data/hora do snapshot

#### Scenario: Snapshot antigo é destacado
- **WHEN** o snapshot mais recente tem mais de 7 dias
- **THEN** a tela destaca visualmente a idade do dado e sugere nova importação

### Requirement: Comprometimento local separado do saldo oficial
A tela SHALL exibir, ao lado do saldo oficial, o **comprometimento local**: soma dos empenhos ativos registrados no sisub com `data_empenho` posterior ao `snapshot_at`. As duas grandezas MUST NOT ser somadas nem apresentadas como um único número.

#### Scenario: Empenho lançado após o snapshot
- **WHEN** o snapshot indica saldo de R$ 100.000 e o sisub registrou R$ 30.000 em empenhos após essa data
- **THEN** a tela mostra saldo oficial R$ 100.000, comprometimento local R$ 30.000 e saldo projetado R$ 70.000, com os três rotulados distintamente

### Requirement: Alerta de crédito na emissão de empenho
Ao registrar um empenho, o sistema SHALL verificar o saldo projetado da classificação correspondente e alertar quando o valor exceder o disponível. O alerta MUST NOT bloquear o registro — a decisão é do ordenador — e a data do snapshot usado SHALL constar na mensagem.

#### Scenario: Empenho acima do saldo projetado
- **WHEN** o gestor registra empenho de R$ 80.000 com saldo projetado de R$ 70.000
- **THEN** o sistema exibe alerta informando o excedente e a idade do snapshot, e permite prosseguir com confirmação explícita

#### Scenario: Classificação sem crédito importado
- **WHEN** não há snapshot para a classificação do empenho
- **THEN** o sistema informa que não há dado de crédito e permite o registro, marcando o empenho como "sem verificação de crédito"

