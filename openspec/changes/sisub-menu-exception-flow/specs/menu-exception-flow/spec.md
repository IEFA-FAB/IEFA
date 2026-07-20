## ADDED Requirements

### Requirement: Tipo de cardápio de exceção

O sistema SHALL suportar um terceiro tipo de cardápio, `template_type = 'exception'`, em `kitchen.menu_template`, ao lado de `'weekly'` e `'event'`. O CHECK constraint da coluna MUST aceitar exatamente os três valores. Uma exceção MUST ser sempre vinculada a uma cozinha (`kitchen_id` não nulo) — não existe exceção global/SDAB.

#### Scenario: Criar cardápio de exceção

- **WHEN** um usuário com permissão de cozinha nível 2 cria um cardápio informando `templateType: 'exception'` e uma `kitchen_id` válida
- **THEN** o sistema persiste um `menu_template` com `template_type = 'exception'` vinculado àquela cozinha
- **AND** redireciona para o editor dia-a-dia daquele cardápio

#### Scenario: Rejeitar valor de tipo inválido

- **WHEN** uma escrita tenta gravar `template_type` fora de `{'weekly','event','exception'}`
- **THEN** o banco rejeita a operação pelo CHECK constraint

#### Scenario: Exceção exige cozinha

- **WHEN** uma criação de exceção é submetida com `kitchen_id` nulo
- **THEN** o sistema rejeita a operação com erro de validação, sem persistir o registro

### Requirement: Gestão de cardápios de exceção

O sistema SHALL prover rotas dedicadas `/kitchen/$kitchenId/exceptions` (lista), `/kitchen/$kitchenId/exceptions/new` (criação) e `/kitchen/$kitchenId/exceptions/$exceptionId` (edição dia-a-dia), reaproveitando o editor e o snapshot de receita já usados por eventos. O acesso a essas rotas MUST exigir permissão de cozinha nível 2 sobre a `kitchenId` da rota.

#### Scenario: Listar apenas exceções da cozinha

- **WHEN** um usuário abre `/kitchen/$kitchenId/exceptions`
- **THEN** a lista exibe somente `menu_template` com `template_type = 'exception'` e `kitchen_id = $kitchenId`
- **AND** não exibe cardápios semanais nem eventos

#### Scenario: Bloquear acesso sem permissão

- **WHEN** um usuário sem permissão de cozinha nível 2 sobre `$kitchenId` acessa qualquer rota `/kitchen/$kitchenId/exceptions/*`
- **THEN** o sistema nega o acesso via guard de permissão

### Requirement: Isolamento dos três regimes nas listagens

O sistema SHALL garantir que os três tipos de cardápio permaneçam mutuamente exclusivos em todas as listagens, usando allowlist explícita por `template_type` em vez de exclusão binária. Um cardápio de qualquer tipo MUST aparecer em exatamente uma das três listas (semanais, eventos, exceções).

#### Scenario: Cardápio semanal não vaza para exceções

- **WHEN** existe um `menu_template` com `template_type = 'weekly'`
- **THEN** ele aparece somente na lista de cardápios semanais
- **AND** a lista de semanais filtra por `template_type === 'weekly'` (allowlist), não por `!== 'event'`

#### Scenario: Exceção não vaza para semanais nem eventos

- **WHEN** existe um `menu_template` com `template_type = 'exception'`
- **THEN** ele aparece somente na lista de exceções
- **AND** está ausente das listas de cardápios semanais e de eventos
