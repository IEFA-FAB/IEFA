# server-auth-guards (delta)

## ADDED Requirements

### Requirement: Garantia de identidade nas mutations de alto impacto
As server functions de mutação de alto impacto SHALL exigir, **além** do módulo e nível PBAC que já exigem hoje, o grau de garantia de identidade correspondente: `"fresh"` para `createUserPermissionFn`, `updateUserPermissionFn`, `deleteUserPermissionFn`, `createMcpKeyFn`, concessão de acesso a parceiro externo, reset do ambiente de treino, exportação de dados nominais e remoção de MFA de terceiro; `"session"` para as mutações de empenho, liquidação, pagamento e conciliação. A exigência SHALL ser aplicada no ponto de autorização já usado por cada função — `requireAuthWithPermission`, `requireUnitScope`, `requireStorageForKitchen` ou o guard de domínio correspondente — e SHALL NOT depender de `requireLevel` de `@iefa/pbac/start`, que o sisub não utiliza. Toda execução bem-sucedida de operação classificada SHALL gravar `access_control.sensitive_operation_log`.

#### Scenario: Concessão de permissão com elevação fresca
- **WHEN** um administrador com `admin` nível 3 e verificação de fator há 2 minutos chama `createUserPermissionFn`
- **THEN** a permissão é concedida normalmente

#### Scenario: Concessão de permissão com elevação vencida
- **WHEN** um administrador com `admin` nível 3 e verificação de fator há 40 minutos chama `createUserPermissionFn`
- **THEN** o sistema rejeita com `MFA_REQUIRED` e `nextStep: "step-up"`, sem executar nenhuma escrita no banco

#### Scenario: Liquidação em sessão elevada de longa duração
- **WHEN** um operador em sessão AAL2, cuja verificação ocorreu no login há 3 horas, registra a décima liquidação do turno
- **THEN** a operação executa sem qualquer desafio adicional

#### Scenario: Liquidação em sessão AAL1
- **WHEN** um operador com fator cadastrado, porém em sessão AAL1, tenta registrar uma liquidação
- **THEN** o sistema rejeita com `MFA_REQUIRED` e `nextStep: "challenge"`, sem executar nenhuma escrita no banco

#### Scenario: Chave MCP não alcança operação de alto impacto
- **WHEN** uma requisição autenticada por chave de API chama uma mutação classificada como `"session"` ou `"fresh"`
- **THEN** o sistema rejeita informando que chaves de API não executam essa operação

### Requirement: Mutations de rotina permanecem sem exigência de garantia
As server functions de mutação de rotina operacional — previsão de refeição, presença, avaliação, lançamento de produção, cardápio, estoque e rascunhos de cozinha — SHALL permanecer classificadas como `"none"` e SHALL NOT exigir AAL2.

#### Scenario: Previsão de refeição de comensal sem fator
- **WHEN** um comensal sem nenhum fator cadastrado chama `upsertForecastFn`
- **THEN** a operação executa normalmente, sem desafio de segundo fator

#### Scenario: Lançamento de produção por gestor de cozinha em AAL1
- **WHEN** um gestor de cozinha em sessão AAL1 registra produção do dia
- **THEN** a operação executa normalmente
