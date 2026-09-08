## ADDED Requirements

### Requirement: Mutação de ativo global exige permissão global

O sistema SHALL exigir `global` nível 2 para qualquer mutação de linha cujo `kitchen_id` seja nulo (ativo global, de propriedade da SDAB), em todas as tabelas que admitem linhas globais e locais na mesma estrutura — receitas, templates de cardápio, tipos de refeição, step templates e utensílios. A permissão `kitchen` nível 2, em qualquer escopo, SHALL NOT autorizar mutação de ativo global.

#### Scenario: Cozinha não altera receita global

- **WHEN** um usuário com `kitchen:2` e sem permissão global tenta criar uma nova versão de uma receita cujo `kitchen_id` é nulo
- **THEN** a operação é rejeitada por falta de permissão
- **AND** nenhuma linha nova é inserida

#### Scenario: Cozinha não altera template global

- **WHEN** um usuário com `kitchen:2` e sem permissão global tenta alterar, publicar ou remover um template de cardápio cujo `kitchen_id` é nulo
- **THEN** a operação é rejeitada por falta de permissão

#### Scenario: Cozinha não altera tipo de refeição global

- **WHEN** um usuário com `kitchen:2` e sem permissão global tenta alterar, remover ou restaurar um tipo de refeição cujo `kitchen_id` é nulo
- **THEN** a operação é rejeitada por falta de permissão

#### Scenario: Cozinha não cria ativo global

- **WHEN** um usuário com `kitchen:2` e sem permissão global submete a criação de receita, template, tipo de refeição, step template ou utensílio com `kitchen_id` nulo
- **THEN** a operação é rejeitada por falta de permissão

#### Scenario: SDAB altera ativo global

- **WHEN** um usuário com `global:2` altera um ativo global
- **THEN** a operação é executada

### Requirement: Mutação de ativo local exige escopo naquela cozinha

O sistema SHALL resolver o dono da linha antes de autorizar qualquer mutação de ativo local, exigindo `kitchen` nível 2 **escopado na cozinha proprietária**. Uma permissão `kitchen` nível 2 sem escopo ou escopada em outra cozinha SHALL NOT autorizar a mutação.

#### Scenario: Cozinha não altera ativo de outra cozinha

- **WHEN** um usuário com `kitchen:2` escopado na cozinha 7 tenta alterar um tipo de refeição, receita ou template pertencente à cozinha 9
- **THEN** a operação é rejeitada por falta de permissão

#### Scenario: Ownership é resolvido do banco, não da entrada

- **WHEN** uma mutação de ativo local é autorizada
- **THEN** a cozinha proprietária é lida da linha persistida, nunca aceita como parâmetro da requisição

#### Scenario: Ativo inexistente retorna não-encontrado

- **WHEN** uma mutação referencia um ID que não existe
- **THEN** a operação falha com erro de não-encontrado, sem vazar se o ID pertence a outra cozinha

#### Scenario: Cozinha altera o próprio ativo

- **WHEN** um usuário com `kitchen:2` escopado na cozinha 7 altera um ativo pertencente à cozinha 7
- **THEN** a operação é executada

### Requirement: Base de versão pertence a quem versiona

O sistema SHALL validar que a linha usada como base de uma nova versão pertence ao mesmo escopo da versão sendo criada, impedindo que uma versão local seja encadeada em base de outra cozinha e que uma versão global seja criada a partir de base local.

#### Scenario: Base de outra cozinha é rejeitada

- **WHEN** uma nova versão escopada na cozinha 7 declara como base uma linha pertencente à cozinha 9
- **THEN** a operação é rejeitada

#### Scenario: Base global gera versão global apenas com permissão global

- **WHEN** uma nova versão com `kitchen_id` nulo declara como base uma linha global
- **THEN** a operação exige `global:2`

#### Scenario: Versão local a partir de base global é tratada como fork

- **WHEN** uma nova versão escopada numa cozinha declara como base uma linha global
- **THEN** a operação é tratada como fork, conforme a capability de fork de ativo global

### Requirement: Guard de ownership centralizado

O sistema SHALL concentrar a resolução de propriedade e autorização em um guard reutilizável, em vez de repetir a checagem por operação, e SHALL NOT usar o padrão de fallback que autoriza ativo global com `kitchen` nível 2.

#### Scenario: Nenhum fallback de kitchen para global

- **WHEN** o código das operações de domínio é inspecionado
- **THEN** não existe ramo que, ao encontrar `kitchen_id` nulo, autorize a mutação com `requirePermission(ctx, "kitchen", 2)`

#### Scenario: Teste de contrato cobre o anti-padrão

- **WHEN** uma operação de mutação sobre tabela com linhas globais e locais é adicionada sem passar pelo guard de ownership
- **THEN** o teste de contrato falha identificando a operação
