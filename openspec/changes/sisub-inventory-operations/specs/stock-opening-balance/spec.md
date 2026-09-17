# stock-opening-balance (delta)

## ADDED Requirements

### Requirement: Carga de abertura por planilha ou catálogo
O sistema SHALL permitir, por cozinha, um documento de carga de abertura preenchido por importação de planilha (item, quantidade, unidade, lote, validade, local) ou por folha gerada do catálogo de ingredientes filtrada por classe de conservação. A importação SHALL validar cada linha e listar as rejeitadas com motivo, sem descartar as válidas. Itens com qualquer movimento anterior na cozinha MUST ser recusados.

#### Scenario: Planilha com linhas inválidas
- **WHEN** a planilha tem 300 linhas e 12 com unidade desconhecida
- **THEN** 288 linhas entram no documento e as 12 aparecem com o motivo para correção

### Requirement: Custo em lote com fonte
O documento SHALL sugerir o custo unitário de cada linha a partir do último preço de ATA ou pesquisa de preço do item, permitir "aceitar todas as sugestões" e edição individual, e gravar a fonte do custo por linha. Linha sem custo MUST impedir a aprovação.

#### Scenario: Aceitar sugestões
- **WHEN** o gestor aciona "aceitar todas" num documento em que 270 de 288 linhas têm sugestão
- **THEN** as 270 recebem custo com fonte "ATA", e as 18 restantes ficam destacadas para preenchimento

### Requirement: Aprovação única gera saldo inicial
A aprovação por nível 3 SHALL lançar um ajuste de entrada com motivo `opening_balance` por linha, criando os lotes, sem recontagem e sem contagem cega. Movimentos `opening_balance` MUST NOT entrar no relatório de perdas e ganhos.

#### Scenario: Abertura da cozinha piloto
- **WHEN** o documento com 288 linhas é aprovado
- **THEN** 288 lotes são criados, o saldo e o custo médio da cozinha passam a existir, e o relatório de perdas do mês continua zerado
