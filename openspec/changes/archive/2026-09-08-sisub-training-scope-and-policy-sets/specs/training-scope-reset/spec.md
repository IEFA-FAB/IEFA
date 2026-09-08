## ADDED Requirements

### Requirement: Reset transacional do ambiente de treino

O sistema SHALL oferecer uma operação de reset que, em uma única transação, remove todos os dados operacionais pendurados nos escopos de treino e re-semeia o baseline de demonstração. A operação SHALL ser atômica: qualquer falha reverte tudo, deixando o ambiente de treino no estado anterior.

#### Scenario: Reset limpa dados de treino

- **WHEN** o reset é executado
- **THEN** todos os cardápios diários, templates de cardápio, receitas locais, tarefas de produção, presenças, previsões de refeição, listas de compra, rascunhos de ATA, utensílios e step templates escopados nas entidades de treino são removidos

#### Scenario: Reset preserva dados reais

- **WHEN** o reset é executado
- **THEN** nenhuma linha pendurada em unidade, cozinha ou refeitório não marcado como treino é alterada ou removida

#### Scenario: Reset preserva as entidades sentinela

- **WHEN** o reset é executado
- **THEN** as linhas de `core.units`, `core.kitchen` e `core.mess_halls` marcadas como treino continuam existindo com os mesmos IDs

#### Scenario: Reset preserva o catálogo global

- **WHEN** o reset é executado
- **THEN** insumos, receitas globais, preparações congeladas, tipos de refeição globais e regras de política não são afetados

#### Scenario: Falha no meio do reset não deixa estado parcial

- **WHEN** o reset falha ao remover ou semear qualquer tabela
- **THEN** a transação é revertida integralmente
- **AND** o erro é retornado ao operador com a tabela que falhou

### Requirement: Seed do baseline de demonstração

Após a limpeza, o reset SHALL semear um conjunto mínimo e determinístico de dados que permita exercitar o fluxo completo de treinamento sem cadastro manual prévio.

#### Scenario: Baseline permite operar imediatamente

- **WHEN** o reset termina com sucesso
- **THEN** o ambiente de treino possui ao menos um template de cardápio, os tipos de refeição da cozinha e um efetivo base configurado

#### Scenario: Seed é determinístico

- **WHEN** o reset é executado duas vezes em sequência
- **THEN** o estado final do ambiente de treino é equivalente nas duas execuções

#### Scenario: Reset é idempotente

- **WHEN** o reset é executado num ambiente de treino já limpo e semeado
- **THEN** a operação conclui com sucesso sem duplicar dados de baseline

### Requirement: Gate e confirmação do reset

O sistema SHALL exigir permissão `global` nível 2 para executar o reset e SHALL exigir confirmação explícita do operador antes de disparar a operação.

#### Scenario: Usuário sem global:2 é bloqueado

- **WHEN** um usuário com `global:1` ou sem permissão global tenta executar o reset
- **THEN** a operação é rejeitada com erro de permissão
- **AND** nenhum dado é removido

#### Scenario: Confirmação é obrigatória

- **WHEN** o operador aciona o botão de reset no painel da SDAB
- **THEN** a operação só é disparada após confirmação explícita por digitação
- **AND** o diálogo informa que a ação é irreversível

#### Scenario: Reset concorrente é serializado

- **WHEN** dois resets são disparados simultaneamente
- **THEN** apenas um executa por vez, com o segundo aguardando ou sendo rejeitado
- **AND** o ambiente nunca fica em estado parcialmente limpo

### Requirement: Auditoria do reset

O sistema SHALL registrar cada execução de reset em `core.training_reset_log`, com autor, instante, duração e contagem de linhas removidas por tabela.

#### Scenario: Execução bem-sucedida é registrada

- **WHEN** um reset conclui com sucesso
- **THEN** uma linha é gravada com o ID do usuário, o instante de início, a duração e a contagem de linhas removidas por tabela

#### Scenario: Falha também é registrada

- **WHEN** um reset falha
- **THEN** uma linha é gravada marcando a falha e a mensagem de erro
- **AND** o registro da falha persiste apesar do rollback dos dados

#### Scenario: Histórico é visível na SDAB

- **WHEN** um usuário com `global:1` abre o painel de treino
- **THEN** o histórico das execuções de reset é exibido, mais recente primeiro

### Requirement: Reset invocável sem contexto de request

A operação de reset SHALL ser implementada como operação de domínio pura, sem dependência de sessão HTTP, de forma que um agendador futuro possa chamá-la diretamente.

#### Scenario: Operação recebe o autor por parâmetro

- **WHEN** a operação de reset é chamada
- **THEN** o autor da execução é recebido como parâmetro explícito, não lido de cookie ou sessão

#### Scenario: Chamada fora de request funciona

- **WHEN** a operação é chamada de um script ou job sem contexto HTTP
- **THEN** o reset executa normalmente e é auditado
