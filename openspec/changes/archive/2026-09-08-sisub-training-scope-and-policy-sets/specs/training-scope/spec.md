## ADDED Requirements

### Requirement: Entidades sentinela de treino

O sistema SHALL manter exatamente uma unidade, uma cozinha e um refeitório marcados como ambiente de treino, identificados pela coluna `is_training` em `core.units`, `core.kitchen` e `core.mess_halls`. As três entidades SHALL ser criadas por migration com `code = 'TREINO'` (ou `display_name = 'Cozinha Treino'` no caso de `core.kitchen`, que não possui coluna `code`), e a cozinha de treino SHALL pertencer à unidade de treino, com o refeitório de treino vinculado a ambas.

#### Scenario: Migration cria as três entidades

- **WHEN** a migration de seed do escopo treino é aplicada em um banco sem entidades de treino
- **THEN** existe exatamente uma linha em `core.units` com `is_training = true` e `code = 'TREINO'`
- **AND** existe exatamente uma linha em `core.kitchen` com `is_training = true` cujo `unit_id` é o da unidade de treino
- **AND** existe exatamente uma linha em `core.mess_halls` com `is_training = true` cujo `unit_id` e `kitchen_id` apontam para as entidades de treino

#### Scenario: Migration é idempotente

- **WHEN** a migration de seed é aplicada num banco que já possui as entidades de treino
- **THEN** nenhuma linha nova é criada
- **AND** a migration termina com sucesso

#### Scenario: IDs nunca são hard-coded

- **WHEN** qualquer código de aplicação ou migration precisa referenciar uma entidade de treino
- **THEN** o ID é resolvido por consulta em `is_training = true`, nunca escrito literalmente

### Requirement: Unicidade do escopo de treino

O sistema SHALL impedir, no nível do banco, que mais de uma linha por tabela seja marcada como treino, por meio de índice único parcial sobre `is_training` filtrado em `is_training = true`.

#### Scenario: Segunda unidade de treino é rejeitada

- **WHEN** um `UPDATE core.units SET is_training = true` é executado numa segunda unidade
- **THEN** o banco rejeita a operação por violação de índice único
- **AND** a transação é revertida

#### Scenario: Default é não-treino

- **WHEN** uma nova unidade, cozinha ou refeitório é criada sem informar `is_training`
- **THEN** `is_training` recebe `false`

### Requirement: Isolamento das listagens de produção

O sistema SHALL excluir entidades de treino de toda listagem, seletor, agregação e relatório de produção por padrão. As entidades de treino SHALL aparecer apenas para usuários que possuam permissão escopada nelas, e nunca compor totais, médias ou indicadores de analytics.

#### Scenario: Seletor de unidade omite treino

- **WHEN** um usuário sem permissão em escopo de treino abre um seletor de unidade, cozinha ou refeitório
- **THEN** as entidades de treino não aparecem na lista

#### Scenario: Usuário de treino vê o escopo de treino

- **WHEN** um usuário com permissão escopada na cozinha de treino abre o seletor de cozinha
- **THEN** a cozinha de treino aparece na lista, marcada como ambiente de treino

#### Scenario: Analytics ignora treino

- **WHEN** um indicador global ou de unidade é calculado
- **THEN** nenhum dado pendurado em escopo de treino entra no cálculo

#### Scenario: Gestão da SDAB enxerga treino explicitamente

- **WHEN** um usuário com `global:1` ou superior abre o painel de treino da SDAB
- **THEN** as entidades de treino são exibidas, identificadas como tal

### Requirement: Sinalização visual do ambiente de treino

O sistema SHALL exibir um indicador persistente e não dispensável em qualquer tela cujo escopo ativo seja uma entidade de treino, para que o operador nunca confunda exercício com operação real.

#### Scenario: Banner aparece no escopo de treino

- **WHEN** o usuário navega para qualquer tela cujo escopo ativo é a unidade, cozinha ou refeitório de treino
- **THEN** um indicador de "ambiente de treino" é exibido de forma persistente
- **AND** o indicador não pode ser fechado pelo usuário

#### Scenario: Banner não aparece em escopo real

- **WHEN** o usuário navega para uma tela cujo escopo ativo é uma entidade real
- **THEN** nenhum indicador de treino é exibido

#### Scenario: Sinalização respeita o design system do sisub

- **WHEN** o indicador de treino é renderizado
- **THEN** ele não usa faixa de acento lateral (`border-l-*`/`border-r-*` acima de 1px) como marcador
