## ADDED Requirements

### Requirement: Política nomeada com statements

O sistema SHALL permitir definir políticas nomeadas em `access_control.policy`, cada uma contendo N statements em `access_control.policy_statement`. Cada statement SHALL ter a mesma forma de um grant atual: um módulo, um nível e no máximo um escopo (`unit_id`, `kitchen_id` ou `mess_hall_id`).

#### Scenario: Política é criada com statements

- **WHEN** um administrador cria uma política com nome, descrição e um ou mais statements
- **THEN** a política é persistida com seus statements vinculados
- **AND** o nome da política é único entre as políticas não removidas

#### Scenario: Statement com mais de um escopo é rejeitado

- **WHEN** um statement é submetido com mais de um entre `unit_id`, `kitchen_id` e `mess_hall_id` preenchidos
- **THEN** a operação é rejeitada
- **AND** nenhum statement é gravado

#### Scenario: Política sem statements não concede nada

- **WHEN** uma política sem statements é anexada a um usuário
- **THEN** as permissões efetivas do usuário não mudam

#### Scenario: Política é removida por soft-delete

- **WHEN** uma política é removida
- **THEN** ela deixa de compor as permissões efetivas de qualquer usuário
- **AND** a linha permanece no banco marcada com `deleted_at`

### Requirement: Políticas gerenciadas são imutáveis

O sistema SHALL marcar políticas criadas por seed como gerenciadas (`managed = true`) e SHALL rejeitar edição, remoção e alteração de statements dessas políticas.

#### Scenario: Edição de política gerenciada é rejeitada

- **WHEN** uma tentativa de alterar nome, descrição ou statements de uma política gerenciada é submetida
- **THEN** a operação é rejeitada com erro explícito

#### Scenario: Remoção de política gerenciada é rejeitada

- **WHEN** uma tentativa de remover uma política gerenciada é submetida
- **THEN** a operação é rejeitada

#### Scenario: Anexo de política gerenciada é permitido

- **WHEN** uma política gerenciada é anexada ou desanexada de um usuário
- **THEN** a operação é permitida

### Requirement: Anexo de política a usuário

O sistema SHALL permitir anexar e desanexar políticas a usuários por meio de `access_control.user_policy_attachment`, com no máximo um anexo por par usuário-política.

#### Scenario: Anexo concede as permissões da política

- **WHEN** uma política é anexada a um usuário
- **THEN** todos os statements da política passam a compor as permissões efetivas desse usuário

#### Scenario: Desanexo revoga em bloco

- **WHEN** uma política é desanexada de um usuário
- **THEN** todas as permissões que vinham exclusivamente daquela política deixam de valer
- **AND** permissões que também vinham de outra origem permanecem

#### Scenario: Anexo duplicado é idempotente

- **WHEN** a mesma política é anexada duas vezes ao mesmo usuário
- **THEN** existe apenas um anexo
- **AND** a operação não falha

### Requirement: Grants inline permanecem válidos

O sistema SHALL preservar `access_control.user_permissions` como mecanismo de grant direto (política inline), com o mesmo comportamento de hoje. A introdução de políticas SHALL ser retrocompatível.

#### Scenario: Usuário sem políticas anexadas não muda

- **WHEN** as permissões efetivas de um usuário sem nenhuma política anexada são resolvidas
- **THEN** o resultado é idêntico ao produzido antes deste change

#### Scenario: Grant inline e política coexistem

- **WHEN** um usuário possui grants inline e políticas anexadas
- **THEN** as permissões efetivas são a união de ambas as origens

#### Scenario: Apps que compartilham a tabela seguem funcionando

- **WHEN** rumaer ou sucont resolvem permissões de um usuário sem políticas anexadas
- **THEN** o comportamento é inalterado

### Requirement: Resolução de permissão efetiva com precedência de deny

O sistema SHALL resolver as permissões efetivas como a união dos statements das políticas anexadas com os grants inline, aplicando `level 0` (deny) como precedência absoluta: um deny para um módulo e escopo SHALL anular qualquer allow para o mesmo módulo e escopo, independentemente da origem.

#### Scenario: União de origens

- **WHEN** uma política concede `kitchen:2` na cozinha 7 e um grant inline concede `unit:1` na unidade 3
- **THEN** as permissões efetivas contêm ambas

#### Scenario: Deny inline anula allow de política

- **WHEN** uma política anexada concede `kitchen:2` na cozinha 7 e um grant inline registra `kitchen:0` na cozinha 7
- **THEN** o usuário não possui permissão em `kitchen` na cozinha 7

#### Scenario: Deny em política anula allow inline

- **WHEN** uma política anexada registra `kitchen:0` na cozinha 7 e um grant inline concede `kitchen:2` na cozinha 7
- **THEN** o usuário não possui permissão em `kitchen` na cozinha 7

#### Scenario: Deny global anula allow escopado

- **WHEN** existe um deny sem escopo para um módulo e um allow escopado para o mesmo módulo
- **THEN** o usuário não possui permissão nesse módulo em nenhum escopo

#### Scenario: Deny escopado não anula outro escopo

- **WHEN** existe um deny em `kitchen` na cozinha 7 e um allow em `kitchen` na cozinha 9
- **THEN** o usuário mantém permissão em `kitchen` na cozinha 9

#### Scenario: Nível efetivo é o maior allow

- **WHEN** duas origens concedem o mesmo módulo e escopo em níveis diferentes, sem deny
- **THEN** o nível efetivo é o maior entre eles

#### Scenario: Comensal implícito é preservado

- **WHEN** um usuário não possui nenhuma regra explícita para `diner`
- **THEN** ele recebe `diner:1` implícito
- **AND** um deny explícito em `diner`, de qualquer origem, remove esse acesso implícito

### Requirement: Origem rastreável de cada permissão efetiva

O sistema SHALL informar, para cada permissão efetiva de um usuário, de onde ela veio: o nome da política que a concedeu ou a marcação de grant inline.

#### Scenario: Permissão de política reporta o nome da política

- **WHEN** as permissões efetivas de um usuário com política anexada são consultadas com origem
- **THEN** cada permissão vinda da política reporta o nome dessa política

#### Scenario: Permissão inline reporta origem inline

- **WHEN** as permissões efetivas incluem um grant direto
- **THEN** essa permissão é reportada como inline

#### Scenario: Permissão concedida por duas origens reporta ambas

- **WHEN** a mesma permissão vem de uma política e de um grant inline
- **THEN** ambas as origens são reportadas para aquela permissão

### Requirement: Política gerenciada "Conjunto Treino"

O sistema SHALL semear por migration uma política gerenciada chamada "Conjunto Treino" que concede escrita em todos os escopos de treino e apenas leitura na administração global.

#### Scenario: Statements do Conjunto Treino

- **WHEN** a política "Conjunto Treino" é inspecionada
- **THEN** ela contém `unit:2` escopado na unidade de treino, `kitchen:2` e `kitchen-production:2` escopados na cozinha de treino, `messhall:2` escopado no refeitório de treino, `local-analytics:2` escopado na unidade de treino, `global:1` sem escopo e `analytics:1` sem escopo

#### Scenario: Usuário do Conjunto Treino escreve no treino

- **WHEN** um usuário com apenas o Conjunto Treino anexado executa uma escrita na cozinha de treino
- **THEN** a operação é permitida

#### Scenario: Usuário do Conjunto Treino não escreve em escopo real

- **WHEN** um usuário com apenas o Conjunto Treino anexado tenta escrever em uma cozinha real
- **THEN** a operação é rejeitada por falta de permissão

#### Scenario: Usuário do Conjunto Treino lê a SDAB

- **WHEN** um usuário com apenas o Conjunto Treino anexado abre uma tela de administração global
- **THEN** a tela carrega em modo leitura

#### Scenario: Usuário do Conjunto Treino não escreve na SDAB

- **WHEN** um usuário com apenas o Conjunto Treino anexado tenta qualquer mutação de dado global
- **THEN** a operação é rejeitada por falta de permissão

#### Scenario: Seed resolve os escopos dinamicamente

- **WHEN** a migration de seed da política é aplicada
- **THEN** os IDs de escopo dos statements são resolvidos por consulta em `is_training = true`, não hard-coded

### Requirement: Acesso às tabelas de política restrito ao service role

O sistema SHALL aplicar RLS deny-all em `access_control.policy`, `access_control.policy_statement` e `access_control.user_policy_attachment`, de modo que só o service role as acesse.

#### Scenario: Cliente anônimo não lê políticas

- **WHEN** um cliente com chave publicável consulta qualquer uma das três tabelas
- **THEN** nenhuma linha é retornada

#### Scenario: Cliente autenticado não escreve políticas

- **WHEN** um cliente autenticado com chave publicável tenta inserir, atualizar ou remover linhas nessas tabelas
- **THEN** a operação é rejeitada
