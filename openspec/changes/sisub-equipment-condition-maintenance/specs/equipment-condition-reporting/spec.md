# equipment-condition-reporting

## ADDED Requirements

### Requirement: Pane relatada pela produção
O sistema SHALL manter `kitchen.equipment_issue` com `unit_id`, `severity` (`degraded` | `inoperative`), `status` (`open` | `in_repair` | `resolved` | `dismissed`, default `open`), `category` (`mechanical`, `electrical`, `gas`, `hydraulic`, `refrigeration`, `structural`, `other`), `description` obrigatória, autor e data do relato. A cozinha da pane MUST ser derivada de `equipment_unit.kitchen_id` por join — a coluna MUST NOT ser denormalizada na pane.

#### Scenario: Relato pela praça
- **WHEN** um usuário com `kitchen-production` nível 1 relata que o forno não aquece
- **THEN** a pane é criada com `status = 'open'` e ele como autor

#### Scenario: Duas panes na mesma unidade
- **WHEN** a mesma unidade já tem uma pane aberta e outro defeito distinto é relatado
- **THEN** as duas panes coexistem abertas

#### Scenario: Descrição vazia
- **WHEN** o relato é enviado sem descrição
- **THEN** a operação é recusada

### Requirement: Condição da unidade é derivada
O sistema SHALL derivar a condição exibida de cada unidade a partir de `status` e das panes abertas, em função pura e num único lugar do domínio, sem coluna persistida:

| Condição | Regra |
|---|---|
| `retired` | `status = 'decommissioned'` |
| `down` | pane aberta (`open` ou `in_repair`) com `severity = 'inoperative'`, ou `status = 'maintenance'` |
| `degraded` | `status = 'active'` e pane aberta apenas com `severity = 'degraded'` |
| `operational` | `status = 'active'` e nenhuma pane aberta |

A precedência MUST ser exatamente essa ordem.

#### Scenario: Baixa vence pane
- **WHEN** a unidade está `decommissioned` e tem pane aberta inoperante
- **THEN** a condição é `retired`

#### Scenario: Inoperante vence degradada
- **WHEN** a unidade tem uma pane `degraded` e outra `inoperative`, ambas abertas
- **THEN** a condição é `down`

#### Scenario: Pane resolvida
- **WHEN** a última pane aberta de uma unidade `active` é resolvida
- **THEN** a condição volta a `operational` sem nenhuma outra escrita

### Requirement: Pane inoperante remove a unidade do cálculo de atendimento
Uma unidade com pane aberta (`open` ou `in_repair`) de severidade `inoperative` MUST ser excluída do parque considerado por `evaluateRecipeEquipmentFitness` e `evaluateMenuEquipmentFitness`, do mesmo modo que `status <> 'active'`. Pane `degraded` MUST NOT excluir. A exclusão MUST valer também quando o parque lido é o da cozinha produtora resolvida por `resolveProducingKitchen`, e não o da cozinha pedida.

#### Scenario: Forno quebrado derruba o atendimento
- **WHEN** a cozinha tem um único forno combinado e ele recebe pane inoperante aberta
- **THEN** a preparação que exige forno combinado passa a ser reportada como não atendida, com a falta listada

#### Scenario: Degradada não derruba
- **WHEN** o mesmo forno recebe pane `degraded` em vez de `inoperative`
- **THEN** o atendimento continua sendo calculado com ele, e a condição `degraded` aparece na tela

#### Scenario: Cozinha central
- **WHEN** um refeitório é servido por cozinha central e a pane inoperante está numa unidade da central
- **THEN** o cálculo do refeitório também deixa de contar aquela unidade

#### Scenario: Pane descartada devolve a unidade
- **WHEN** a Gestão Cozinha marca a pane como `dismissed`
- **THEN** a unidade volta a contar no atendimento e a pane permanece no histórico com autor e justificativa

### Requirement: Ciclo de vida da pane
Resolver (`resolved`) ou descartar (`dismissed`) uma pane SHALL exigir `kitchen` nível 2 no escopo da cozinha e SHALL gravar autor, data e nota de resolução. Pane MUST NOT ser apagada — nem por hard delete, nem por soft delete originado da UI de produção.

#### Scenario: Produção tenta descartar
- **WHEN** um usuário com apenas `kitchen-production` nível 1 tenta descartar uma pane
- **THEN** a operação é recusada por falta de permissão

#### Scenario: Histórico preservado
- **WHEN** uma pane é descartada
- **THEN** ela deixa de afetar a condição e o atendimento, mas continua listada no histórico da unidade

### Requirement: Produção cadastra unidade, não a destrói
`createEquipmentUnit` SHALL aceitar `kitchen` nível 2 **ou** `kitchen-production` nível 1 no escopo da cozinha. `updateEquipmentUnit`, `deleteEquipmentUnit`, a mudança de `status` e a edição de catálogo (papel, modelo, plano) MUST continuar exigindo `kitchen` nível 2 ou a permissão de catálogo correspondente.

#### Scenario: Praça cadastra o que existe
- **WHEN** um usuário com `kitchen-production` nível 1 cadastra um freezer que estava na praça e não no sistema
- **THEN** a unidade é criada na cozinha dele

#### Scenario: Praça tenta dar baixa
- **WHEN** o mesmo usuário tenta excluir ou dar baixa em uma unidade
- **THEN** a operação é recusada por falta de permissão

#### Scenario: Escopo alheio
- **WHEN** o mesmo usuário tenta cadastrar unidade em outra cozinha
- **THEN** a operação é recusada por escopo
