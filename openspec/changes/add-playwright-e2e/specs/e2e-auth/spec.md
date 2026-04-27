## ADDED Requirements

### Requirement: Login programático via Supabase API
O sistema de testes DEVE autenticar usuários via `supabase.auth.signInWithPassword()` sem interação com a UI de login.

#### Scenario: Auth setup global gera storageState
- **WHEN** o global setup do Playwright executa antes dos testes
- **THEN** DEVE fazer login via Supabase API com credenciais do env (`E2E_TEST_USER_EMAIL`, `E2E_TEST_USER_PASSWORD`) e salvar o `storageState` (cookies + localStorage) em arquivo `.auth/user.json`

#### Scenario: Falha de login aborta testes
- **WHEN** o login programático falha (credenciais inválidas, Supabase indisponível)
- **THEN** o global setup DEVE falhar com mensagem clara e nenhum teste DEVE executar

### Requirement: Reutilização de storage state
Testes autenticados DEVEM reutilizar a sessão criada no global setup sem re-autenticar.

#### Scenario: Teste autenticado usa sessão existente
- **WHEN** um teste usa o fixture `authenticatedPage`
- **THEN** a página DEVE carregar com o `storageState` do `.auth/user.json`, já logado

#### Scenario: Múltiplos testes compartilham sessão
- **WHEN** 10 testes autenticados executam em sequência
- **THEN** todos DEVEM usar o mesmo `storageState` sem chamadas adicionais ao Supabase Auth

### Requirement: Fixture de autenticação customizado
O projeto DEVE fornecer um fixture `authenticatedPage` que encapsula a lógica de auth.

#### Scenario: Fixture disponível nos testes
- **WHEN** um teste importa `{ test, expect }` de `../fixtures/auth`
- **THEN** o objeto `test` DEVE incluir o fixture `authenticatedPage` com sessão ativa

#### Scenario: Fixture garante redirecionamento
- **WHEN** `authenticatedPage` navega para uma rota protegida (ex: `/_protected/modules/diner`)
- **THEN** a página DEVE carregar normalmente sem redirecionamento para `/auth`

### Requirement: Env vars de credenciais
As credenciais do usuário de teste DEVEM vir exclusivamente de variáveis de ambiente.

#### Scenario: Env vars documentadas no schema
- **WHEN** desenvolvedor consulta `.env.schema`
- **THEN** DEVE encontrar `E2E_TEST_USER_EMAIL` e `E2E_TEST_USER_PASSWORD` documentadas

#### Scenario: Credenciais nunca em código
- **WHEN** o codebase é auditado
- **THEN** nenhum arquivo commitado DEVE conter credenciais de teste hardcoded

### Requirement: Arquivo .auth/ no gitignore
O diretório `.auth/` com storage states DEVE ser ignorado pelo git.

#### Scenario: Storage state não commitado
- **WHEN** global setup gera `.auth/user.json`
- **THEN** o arquivo DEVE ser excluído pelo `.gitignore` de `apps/sisub`
