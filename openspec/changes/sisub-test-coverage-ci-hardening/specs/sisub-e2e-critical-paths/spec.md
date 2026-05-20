## ADDED Requirements

### Requirement: E2E mínimo bloqueia deploy do sisub
O workflow de deploy do `sisub` MUST executar uma suíte Playwright Chromium mínima antes de permitir deploy em produção.

#### Scenario: E2E mínimo falha bloqueia deploy
- **WHEN** qualquer teste da suíte E2E mínima falha
- **THEN** `deploy-sisub` MUST NOT executar

#### Scenario: E2E mínimo passa libera deploy
- **WHEN** lint, typecheck, unit, integração obrigatória, build e E2E mínimo passam
- **THEN** o workflow PODE prosseguir para deploy

### Requirement: E2E mínimo cobre autenticação e navegação
A suíte E2E mínima MUST cobrir login válido, login inválido, rota protegida sem sessão, acesso a `/hub` e navegação SPA para pelo menos um módulo.

#### Scenario: Login válido redireciona para hub
- **WHEN** usuário E2E informa credenciais válidas em `/auth`
- **THEN** o app MUST redirecionar para `/hub`

#### Scenario: Login inválido exibe erro
- **WHEN** usuário informa credenciais inválidas
- **THEN** o app MUST permanecer em `/auth` e exibir alerta de erro

#### Scenario: Rota protegida redireciona sem sessão
- **WHEN** visitante sem sessão acessa `/hub`
- **THEN** o app MUST redirecionar para `/auth`

### Requirement: E2E mínimo cobre fluxos de produto por risco
A suíte E2E mínima MUST cobrir pelo menos um fluxo feliz e um bloqueio de autorização para comensal, fiscal/rancho, cozinha ou unidade/global.

#### Scenario: Comensal altera forecast
- **WHEN** usuário com permissão `diner` altera uma previsão de refeição
- **THEN** a UI MUST refletir o novo estado após persistência

#### Scenario: Usuário sem permissão não acessa módulo restrito
- **WHEN** usuário com permissão apenas `diner` tenta acessar módulo `global` ou `unit`
- **THEN** o app MUST redirecionar para `/hub` ou exibir bloqueio equivalente

#### Scenario: Página crítica renderiza sem erro de console
- **WHEN** usuário autenticado acessa uma rota crítica do módulo permitido
- **THEN** a página MUST NOT emitir `pageerror` JavaScript durante o carregamento inicial

### Requirement: E2E ampliado roda fora do caminho crítico
Fluxos longos ou dependentes de serviços externos MUST rodar em workflow manual/agendado, não em todo deploy.

#### Scenario: Full suite manual cobre compras
- **WHEN** workflow manual E2E full é executado
- **THEN** a suíte MUST cobrir criação/visualização de ATA ou fluxo equivalente em ambiente staging

#### Scenario: Full suite agendada cobre IA
- **WHEN** workflow agendado é executado com secrets de IA configurados
- **THEN** a suíte PODE executar smoke de analytics/module-chat sem bloquear deploy diário

### Requirement: E2E usa usuários dedicados
Testes E2E MUST usar contas dedicadas e dados isolados de teste.

#### Scenario: Conta real não é usada
- **WHEN** o E2E roda no CI
- **THEN** as credenciais MUST vir de secrets dedicados a teste, não de usuários administrativos reais

#### Scenario: Dados criados são limpos
- **WHEN** o E2E cria dados em Supabase staging
- **THEN** o teste MUST limpar ou marcar soft delete antes de finalizar
