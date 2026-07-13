## ADDED Requirements

### Requirement: Tipos de refeição custom por cozinha

O sistema SHALL permitir que uma cozinha crie, edite, ordene e remova (soft-delete) tipos de refeição próprios em `kitchen.meal_type` com `kitchen_id` igual à cozinha, sem alterar o schema. Os tipos canônicos (café, almoço, janta, ceia) permanecem disponíveis; tipos adicionais como colação passam a ser possíveis por cozinha. A gestão MUST exigir permissão de cozinha nível 2 e MUST ser exposta por uma entrada de UI navegável (`MealTypeManager`).

#### Scenario: Criar tipo de refeição colação

- **WHEN** um usuário com permissão de cozinha nível 2 cria o tipo "Colação" para sua cozinha
- **THEN** o sistema persiste um `meal_type` com `kitchen_id` da cozinha e o nome informado
- **AND** "Colação" fica disponível para seleção nos cardápios daquela cozinha

#### Scenario: Custom não afeta outras cozinhas

- **WHEN** a cozinha A cria o tipo "Colação"
- **THEN** o tipo não aparece para a cozinha B
- **AND** os tipos genéricos (`kitchen_id` nulo) continuam visíveis para todas as cozinhas

### Requirement: Disponibilidade de tipos custom nos três regimes de produção

Os tipos de refeição custom de uma cozinha SHALL estar disponíveis para seleção em todos os cardápios de produção daquela cozinha — semanais, eventos e exceções — nos mesmos pontos onde os tipos genéricos são oferecidos.

#### Scenario: Colação selecionável em cardápio semanal

- **WHEN** a cozinha tem o tipo custom "Colação" e o usuário monta um item de cardápio semanal
- **THEN** "Colação" aparece como opção de tipo de refeição do item

#### Scenario: Colação selecionável em exceção

- **WHEN** a cozinha tem o tipo custom "Colação" e o usuário monta um cardápio de exceção
- **THEN** "Colação" aparece como opção de tipo de refeição do item

### Requirement: Isolamento do módulo diner/rancho

Os tipos de refeição custom SHALL permanecer restritos ao lado produção. O sistema MUST NOT expor tipos custom nas telas de previsão/presença do militar (diner/rancho), e a mudança MUST NOT alterar os CHECK constraints de `meal_forecasts`, `meal_presences` e `other_presences`, nem os tipos `MealKey`/`DayMeals`/`MEAL_TYPES`.

#### Scenario: Diner não enxerga tipos custom

- **WHEN** uma cozinha cria o tipo custom "Colação"
- **THEN** a tela de previsão/presença do militar continua oferecendo apenas café, almoço, janta e ceia
- **AND** nenhum registro de `meal_forecasts`/`meal_presences` com `meal = 'colacao'` pode ser criado (CHECK inalterado)

#### Scenario: Constraints do rancho preservadas

- **WHEN** a migration desta mudança é aplicada
- **THEN** os CHECK constraints de `meal_forecasts`, `meal_presences` e `other_presences` permanecem restritos a `{'cafe','almoco','janta','ceia'}`
