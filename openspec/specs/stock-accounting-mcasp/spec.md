# stock-accounting-mcasp Specification

## Purpose
TBD - created by archiving change sisub-inventory-cycle. Update Purpose after archive.
## Requirements
### Requirement: Fechamento mensal com lock de período
O sistema SHALL permitir fechar a competência mensal por cozinha (`inventory.monthly_closing`, UNIQUE cozinha×competência), gravando snapshot do saldo valorado, totais de entradas/saídas e valores inicial/final. Após o fechamento, lançamentos com data no período fechado MUST ser bloqueados; correções SHALL entrar como ajuste no período aberto seguinte, com justificativa obrigatória.

#### Scenario: Fechamento
- **WHEN** o responsável (PBAC storage nível 3) fecha a competência 2026-08 de uma cozinha
- **THEN** o snapshot é gravado e o período fica bloqueado para novos movimentos

#### Scenario: Lançamento retroativo bloqueado
- **WHEN** um operador tenta lançar movimento datado dentro de período fechado
- **THEN** o sistema rejeita e orienta a lançar ajuste no período aberto com justificativa

### Requirement: Ficha de Almoxarifado
O sistema SHALL gerar, por ingrediente e período, o ledger cronológico de entradas/saídas com quantidades, custos e saldos acumulados, no formato da Ficha de Almoxarifado (MCASP), exportável em PDF.

#### Scenario: Emissão da ficha
- **WHEN** o gestor solicita a ficha de um ingrediente para um trimestre
- **THEN** o sistema lista cada movimento com data, documento de origem, quantidade, custo e saldo acumulado

### Requirement: Balancete mensal (RMA/RMB)
O sistema SHALL gerar o balancete mensal valorado: saldo inicial + entradas − saídas = saldo final, por ingrediente e agregado, com nomenclatura MCASP, cobrindo o Relatório de Movimentação de Almoxarifado.

#### Scenario: Balancete confere com o ledger
- **WHEN** o balancete de um mês é gerado
- **THEN** saldo inicial + entradas − saídas do relatório é igual ao saldo final da view de saldo na data de corte

### Requirement: Exportação para SIAFI/SIADS
O sistema SHALL exportar os dados do fechamento em CSV/JSON estruturado por código CATMAT, para lançamento em SIAFI/SIADS. O layout SHALL ficar isolado no schema `siafi_integration` para evoluir sem tocar o ledger.

#### Scenario: Exportação por CATMAT
- **WHEN** o gestor exporta o fechamento de uma competência
- **THEN** o arquivo agrega quantidades e valores por `catmat_item_codigo`, incluindo itens sem CATMAT em seção separada

### Requirement: Painel empenho × liquidação
O sistema SHALL exibir por empenho: quantidade empenhada, recebida (definitivos) e a receber, com valores, fechando a tríade orçamentário-físico-contábil.

#### Scenario: Consulta do painel
- **WHEN** o gestor abre o painel de um empenho com 500 KG empenhados e 300 KG recebidos
- **THEN** o painel mostra 200 KG a receber com os valores correspondentes

