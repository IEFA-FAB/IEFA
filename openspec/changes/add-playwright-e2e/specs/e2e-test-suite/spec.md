## ADDED Requirements

### Requirement: Teste de fluxo de login via UI
O test suite DEVE incluir um teste que valida o fluxo completo de login pela interface.

#### Scenario: Login com credenciais válidas
- **WHEN** usuário navega para `/auth`, preenche email e senha válidos, e submete o formulário
- **THEN** o sistema DEVE redirecionar para a página principal (dashboard/módulos) e exibir indicadores de sessão ativa

#### Scenario: Login com credenciais inválidas
- **WHEN** usuário navega para `/auth` e submete credenciais inválidas
- **THEN** o sistema DEVE exibir mensagem de erro e permanecer na página `/auth`

### Requirement: Teste de navegação em rotas protegidas
O test suite DEVE incluir testes que validam acesso e navegação entre rotas protegidas.

#### Scenario: Acesso autenticado a módulo
- **WHEN** usuário autenticado navega para um módulo protegido (ex: `/modules/diner`)
- **THEN** a página DEVE carregar corretamente com conteúdo do módulo visível

#### Scenario: Redirecionamento de rota protegida sem auth
- **WHEN** usuário não autenticado tenta acessar `/_protected/modules/diner`
- **THEN** o sistema DEVE redirecionar para `/auth`

#### Scenario: Navegação entre módulos
- **WHEN** usuário autenticado navega de um módulo para outro via sidebar/menu
- **THEN** o conteúdo DEVE atualizar sem reload completo da página (SPA navigation)

### Requirement: Teste de smoke da página inicial
O test suite DEVE incluir um teste de smoke que valida o carregamento básico do app.

#### Scenario: Página carrega sem erros
- **WHEN** navegador acessa a URL base do sisub
- **THEN** a página DEVE renderizar sem erros de JavaScript no console e com status HTTP 200

#### Scenario: SSR funciona corretamente
- **WHEN** página é carregada com JavaScript desabilitado
- **THEN** o HTML da resposta DEVE conter conteúdo renderizado pelo servidor (não apenas um div vazio)

### Requirement: Convenções de teste
Todos os testes DEVEM seguir convenções padronizadas para manutenibilidade.

#### Scenario: Testes usam data-testid
- **WHEN** testes interagem com elementos da UI
- **THEN** DEVEM preferencialmente usar `data-testid` attributes ou roles ARIA, nunca seletores CSS frágeis

#### Scenario: Testes são independentes
- **WHEN** qualquer teste individual é executado isoladamente
- **THEN** DEVE passar sem depender de estado deixado por outros testes

#### Scenario: Testes têm nomes descritivos
- **WHEN** um teste falha no CI
- **THEN** o nome do teste DEVE descrever claramente o fluxo sendo validado (ex: "usuário autenticado pode acessar módulo diner")
