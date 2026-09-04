# siafi-reconciliation Specification

## Purpose
TBD - created by archiving change sisub-budget-execution. Update Purpose after archive.
## Requirements
### Requirement: Painel de divergências SIAFI × sisub
O sistema SHALL expor uma conciliação por documento (NE, NS, OB) classificando cada caso como: apenas no sisub, apenas no SIAFI, ou presente nos dois com valor divergente. A lista SHALL ser ordenada por severidade (divergência de valor primeiro) e informar o lote de importação de referência.

#### Scenario: Documento só no sisub
- **WHEN** um empenho registrado manualmente não aparece no último relatório de NE importado
- **THEN** ele é listado como "apenas no sisub", sugerindo verificar se a NE foi realmente emitida

#### Scenario: Documento só no SIAFI
- **WHEN** o relatório traz uma NS que não existe no sisub
- **THEN** ela é listada como "apenas no SIAFI" com ação de importar para o domínio

#### Scenario: Divergência de valor
- **WHEN** um empenho tem R$ 15.000 no sisub e R$ 12.000 no relatório
- **THEN** a divergência de R$ 3.000 é destacada no topo da lista

### Requirement: Resolução explícita, nunca automática
A resolução de divergência SHALL ser uma ação do operador entre "adotar o valor do SIAFI" (atualiza o registro e marca `origem = siafi`) ou "manter e justificar" (registra justificativa e mantém o valor local). O sistema MUST NOT alterar registros do domínio sem essa escolha.

#### Scenario: Adotar o SIAFI
- **WHEN** o operador escolhe adotar o valor do SIAFI numa divergência de empenho
- **THEN** o registro é atualizado, marcado com `origem = siafi` e a alteração fica registrada no histórico do documento

#### Scenario: Manter com justificativa
- **WHEN** o operador mantém o valor local informando o motivo
- **THEN** a divergência fica marcada como "aceita" com a justificativa e some da lista ativa

#### Scenario: Divergência reaparece após novo lote
- **WHEN** um novo relatório mantém a mesma divergência já aceita
- **THEN** ela volta a ser listada, referenciando a justificativa anterior

### Requirement: Conciliação físico × contábil
O painel SHALL confrontar recebimentos definitivos e liquidações, apontando: recebimento definitivo sem liquidação, liquidação sem recebimento e diferença de valor entre os dois.

#### Scenario: Recebimento sem liquidação
- **WHEN** um recebimento definitivo de R$ 4.800 não tem liquidação vinculada há mais de 30 dias
- **THEN** aparece na lista como pendência contábil, com atalho para registrar a NS

