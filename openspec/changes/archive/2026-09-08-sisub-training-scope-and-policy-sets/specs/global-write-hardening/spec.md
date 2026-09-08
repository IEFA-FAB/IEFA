## ADDED Requirements

### Requirement: `global` nível 1 é leitura estrita

O sistema SHALL tratar `global` nível 1 como permissão exclusivamente de leitura. Toda mutação de dado sob responsabilidade da SDAB SHALL exigir `global` nível 2, salvo quando o mesmo recurso for legitimamente escrito por outro módulo.

#### Scenario: Leitura global é permitida em nível 1

- **WHEN** um usuário com `global:1` abre qualquer tela de administração global
- **THEN** a tela carrega e os dados são exibidos

#### Scenario: Escrita global é rejeitada em nível 1

- **WHEN** um usuário com `global:1` submete qualquer mutação de dado global
- **THEN** a operação é rejeitada com erro de permissão
- **AND** nenhum dado é alterado

#### Scenario: Escrita global é permitida em nível 2

- **WHEN** um usuário com `global:2` submete uma mutação de dado global
- **THEN** a operação é executada

### Requirement: Cobertura das mutações globais

O sistema SHALL aplicar o gate de escrita global em todas as famílias de mutação hoje protegidas apenas por autenticação: catálogo de insumos, receitas globais, regras de política de revisão, locais, disparo e interrupção de rotinas de sincronização, e administração de permissões e políticas.

#### Scenario: Mutação de insumo do catálogo exige nível 2

- **WHEN** um usuário sem `global:2` tenta criar, alterar ou remover um insumo do catálogo global
- **THEN** a operação é rejeitada

#### Scenario: Mutação de receita global exige nível 2

- **WHEN** um usuário sem `global:2` tenta criar, alterar ou remover uma receita global
- **THEN** a operação é rejeitada

#### Scenario: Mutação de regra de política exige nível 2

- **WHEN** um usuário sem `global:2` tenta criar, alterar ou remover uma regra de política de revisão
- **THEN** a operação é rejeitada

#### Scenario: Disparo de sincronização exige nível 2

- **WHEN** um usuário sem `global:2` tenta disparar ou interromper uma rotina de sincronização
- **THEN** a operação é rejeitada

#### Scenario: Administração de acesso exige nível 2

- **WHEN** um usuário sem `global:2` tenta criar, alterar ou remover grants, políticas, statements ou anexos
- **THEN** a operação é rejeitada

### Requirement: Recursos compartilhados entre módulos preservam a escrita legítima

O sistema SHALL preservar a escrita de módulos não-globais em recursos que eles legitimamente editam, aceitando `global` nível 2 **ou** o módulo próprio no nível exigido.

#### Scenario: Cozinha continua editando recurso compartilhado

- **WHEN** um usuário com `kitchen:2` e sem permissão global escreve num recurso compartilhado entre `global` e `kitchen`
- **THEN** a operação é permitida

#### Scenario: Recurso exclusivamente global não aceita gate de cozinha

- **WHEN** um usuário com `kitchen:2` e sem permissão global tenta escrever num recurso exclusivo da SDAB
- **THEN** a operação é rejeitada

#### Scenario: Gate compartilhado é explícito no código

- **WHEN** uma operação aceita mais de um módulo como autorização suficiente
- **THEN** ela usa o guard de múltiplos módulos, não uma checagem ad-hoc

### Requirement: Teste de contrato exaustivo dos gates globais

O sistema SHALL manter um teste de contrato que enumera toda mutação global e o guard exigido, falhando quando uma nova mutação global for adicionada sem gate.

#### Scenario: Mutação global sem gate falha o teste

- **WHEN** uma nova operação de escrita global é adicionada sem exigir `global:2` nem gate compartilhado
- **THEN** o teste de contrato falha identificando a operação

#### Scenario: Contrato aponta o alvo movido

- **WHEN** um arquivo coberto pelo contrato é movido ou renomeado
- **THEN** o teste falha com mensagem legível apontando o alvo ausente, não com erro opaco de arquivo inexistente

#### Scenario: Gate compartilhado é aceito pelo contrato

- **WHEN** uma mutação de recurso compartilhado usa o guard de múltiplos módulos incluindo `global`
- **THEN** o teste de contrato aceita a operação como protegida
