## ADDED Requirements

### Requirement: Forecast de comensal tem cobertura
Fluxos de previsão de refeição MUST ter testes unitários/de integração para default mess hall, upsert, delete e isolamento por usuário autenticado.

#### Scenario: Upsert usa usuário autenticado
- **WHEN** usuário autenticado chama `upsertForecastFn()`
- **THEN** a linha em `meal_forecasts` MUST usar o `user_id` derivado da sessão, não de payload controlado pelo cliente

#### Scenario: Delete remove apenas forecast do usuário autenticado
- **WHEN** usuário autenticado chama `deleteForecastFn()` para data/refeição
- **THEN** apenas a previsão desse usuário MUST ser removida

#### Scenario: Default mess hall é persistido
- **WHEN** usuário salva um rancho padrão
- **THEN** `fetchUserDefaultMessHallFn()` MUST retornar o rancho salvo para esse usuário

### Requirement: Fiscalização de presença tem cobertura
Fluxos de presença MUST testar inserção, duplicidade, exclusão, leitura com dados de identidade e contagem de presenças manuais.

#### Scenario: Inserção duplicada retorna código tratável
- **WHEN** `insertPresenceFn()` tenta inserir presença já existente para usuário/data/refeição/rancho
- **THEN** a função MUST lançar erro com código de duplicidade preservado para o caller

#### Scenario: Fiscal registra presença de outro usuário
- **WHEN** fiscal autenticado chama `insertPresenceFn()` com `user_id` de outro militar
- **THEN** a presença MUST ser registrada para o militar informado e a autenticação do fiscal MUST ser validada

#### Scenario: Contagem de outros reflete inserções manuais
- **WHEN** `addOtherPresenceFn()` registra uma presença sem cadastro
- **THEN** `fetchOtherPresencesCountFn()` MUST incrementar a contagem do slot de refeição

### Requirement: QR/self check-in tem cobertura E2E
O fluxo de QR/self check-in MUST ser coberto por E2E mínimo ou integração browser para validar leitura de código, rancho correto, forecast esperado e mensagem de resultado.

#### Scenario: Comensal com forecast válido faz check-in
- **WHEN** usuário autenticado abre URL de self check-in para rancho válido e possui previsão `will_eat=true`
- **THEN** o app MUST exibir estado de sucesso e registrar/confirmar presença conforme regra atual

#### Scenario: Código de rancho inválido mostra erro
- **WHEN** usuário abre self check-in com código inexistente
- **THEN** o app MUST exibir erro sem executar escrita de presença

### Requirement: Onboarding de usuário tem cobertura
Sincronização de email, número de ordem e avaliação do usuário MUST ter testes para submissão, duplicidade esperada e isolamento por sessão.

#### Scenario: Sync de número de ordem grava usuário autenticado
- **WHEN** usuário autenticado salva número de ordem
- **THEN** `syncUserNrOrdemFn()` MUST persistir o valor no registro do usuário correto

#### Scenario: Avaliação usa usuário autenticado
- **WHEN** usuário submete avaliação
- **THEN** a resposta MUST ser gravada com o userId da sessão e não aceitar impersonation via payload
