# stock-accounting-mcasp (delta)

## ADDED Requirements

### Requirement: Natureza contábil por motivo
O balancete e a exportação SHALL separar as saídas por natureza derivada do motivo — consumo, perda, em apuração, doação, redução de custo, correção, inventário e implantação — e os relatórios gerados pelo sisub SHALL ser rotulados "gerencial" até a definição da escrituração oficial.

#### Scenario: Furto no mês
- **WHEN** o mês tem um ajuste `theft` de R$ 800
- **THEN** o balancete mostra R$ 800 em "em apuração", separado de perdas e consumo

### Requirement: Espelho para o SILOMS
O sistema SHALL gerar, por cozinha e competência, um arquivo de espelho para lançamento no SILOMS, agrupado por item de catálogo e natureza de movimento, com quantidade, valor a custo médio e documento de origem. O layout (colunas, ordem, códigos de natureza, formato de número e data) SHALL vir de um perfil configurável em dados, com perfil default "planilha de digitação", e MUST NOT exigir alteração de código para um layout novo. O arquivo SHALL declarar competência, cozinha e a data de geração.

#### Scenario: Fechamento do mês para o SILOMS
- **WHEN** o gestor gera o espelho da competência 2026-08 de uma cozinha
- **THEN** o arquivo traz uma linha por item e natureza, conferindo com o balancete do mesmo período

#### Scenario: Layout diferente
- **WHEN** o pessoal do SILOMS pede outra ordem de colunas e outros códigos de natureza
- **THEN** um perfil novo é cadastrado e passa a ser selecionável, sem mudança de código

## MODIFIED Requirements

### Requirement: Fechamento mensal com lock de período
O sistema SHALL permitir fechar a competência mensal por cozinha (`inventory.monthly_closing`, UNIQUE cozinha×competência), gravando snapshot do saldo valorado, totais de entradas/saídas e valores inicial/final. A competência de um movimento SHALL ser o mês de `occurred_at` no fuso `America/Sao_Paulo`. Após o fechamento, movimentos com competência fechada MUST ser bloqueados; correções SHALL entrar como ajuste no período aberto seguinte, com motivo. O fechamento MUST ser recusado enquanto houver contagem em revisão com contagem realizada naquele mês.

#### Scenario: Fechamento
- **WHEN** o responsável (PBAC storage nível 3) fecha a competência 2026-08 de uma cozinha
- **THEN** o snapshot é gravado e o período fica bloqueado para novos movimentos

#### Scenario: Lançamento retroativo bloqueado
- **WHEN** um operador tenta lançar movimento com competência dentro de período fechado
- **THEN** o sistema rejeita e orienta a lançar ajuste no período aberto

#### Scenario: Movimento às 22:30 do último dia
- **WHEN** uma saída ocorre às 22:30 de 31/08 no horário de Brasília
- **THEN** ela pertence à competência 2026-08

#### Scenario: Contagem pendente
- **WHEN** há contagem realizada em 30/09 ainda em revisão
- **THEN** o fechamento de 2026-09 é recusado indicando a contagem

### Requirement: Exportação para SIAFI/SIADS
O sistema SHALL exportar os dados do fechamento em CSV/JSON estruturado por código CATMAT e por natureza contábil do movimento, para lançamento em SIAFI/SIADS. O layout SHALL ficar isolado no schema `siafi_integration` para evoluir sem tocar o ledger.

#### Scenario: Exportação por CATMAT
- **WHEN** o gestor exporta o fechamento de uma competência
- **THEN** o arquivo agrega quantidades e valores por `catmat_item_codigo` e natureza, incluindo itens sem CATMAT em seção separada
