## ADDED Requirements

### Requirement: PBAC tem cobertura unitária canônica
O package `@iefa/pbac` MUST ter testes unitários para `hasPermission()` e `resolveUserPermissions()` cobrindo permissões globais, escopadas, deny explícito e allow implícito de `diner`.

#### Scenario: Permissão global concede qualquer escopo do módulo
- **WHEN** `hasPermission()` recebe uma permissão com `unit_id`, `mess_hall_id` e `kitchen_id` nulos
- **THEN** o acesso MUST ser concedido para qualquer scope compatível do mesmo módulo e nível mínimo

#### Scenario: Permissão escopada não concede outro escopo
- **WHEN** `hasPermission()` recebe permissão `unit_id=1` e a validação exige `{ type: "unit", id: 2 }`
- **THEN** o acesso MUST ser negado

#### Scenario: Deny explícito não aparece nas permissões efetivas
- **WHEN** `resolveUserPermissions()` lê uma linha com `level=0`
- **THEN** a permissão efetiva retornada MUST NOT incluir essa linha

#### Scenario: Diner implícito é adicionado sem regra explícita
- **WHEN** `resolveUserPermissions()` não encontra regra para módulo `diner`
- **THEN** a permissão efetiva MUST incluir `diner` nível 1 sem escopo

### Requirement: Server functions sensíveis exigem autenticação
Toda server function `POST` do `sisub` que usa service role para escrita MUST ter teste provando rejeição sem sessão antes de qualquer operação de banco.

#### Scenario: Mutation sem cookie é rejeitada
- **WHEN** um request sem cookie de sessão chama uma mutation protegida
- **THEN** a resposta MUST ser 401 ou erro equivalente `UNAUTHORIZED`

#### Scenario: Mutation autenticada executa
- **WHEN** um usuário autenticado chama a mesma mutation com payload válido
- **THEN** a operação MUST passar pelo guard de autenticação e executar apenas no escopo permitido pelo teste

### Requirement: Server functions com escopo PBAC têm testes negativos
Server functions que modificam dados organizacionais MUST ter testes provando que usuário sem permissão ou com escopo errado não consegue executar a ação.

#### Scenario: Usuário sem permissão global é rejeitado
- **WHEN** um usuário autenticado sem permissão `global` chama `createUserPermissionFn` ou `updatePlacesEntityFn`
- **THEN** a operação MUST ser rejeitada antes da escrita

#### Scenario: Usuário de unidade errada é rejeitado
- **WHEN** um usuário com permissão `unit` escopada para unidade A tenta alterar dados da unidade B
- **THEN** a operação MUST ser rejeitada antes da escrita

#### Scenario: Usuário de cozinha errada é rejeitado
- **WHEN** um usuário com permissão `kitchen` escopada para cozinha A tenta alterar dados da cozinha B
- **THEN** a operação MUST ser rejeitada antes da escrita

### Requirement: Rotas protegidas têm cobertura de redirect
As rotas protegidas do `sisub` MUST ter cobertura E2E ou unitária de `beforeLoad` para autenticação ausente e permissão insuficiente.

#### Scenario: Usuário não autenticado vai para auth
- **WHEN** usuário sem sessão acessa rota dentro de `/_protected`
- **THEN** o router MUST redirecionar para `/auth`

#### Scenario: Usuário autenticado sem permissão vai para hub
- **WHEN** usuário autenticado sem permissão acessa módulo protegido
- **THEN** o router MUST redirecionar para `/hub`
