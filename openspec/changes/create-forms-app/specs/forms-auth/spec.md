## ADDED Requirements

### Requirement: Autenticação por e-mail e senha
O sistema SHALL permitir que usuários façam login com e-mail e senha via Supabase Auth.
Todas as rotas exceto `/login` SHALL redirecionar para `/login` se não houver sessão ativa.

#### Scenario: Login com credenciais válidas
- **WHEN** o usuário submete e-mail e senha corretos na tela de login
- **THEN** o sistema cria uma sessão Supabase, armazena o token e redireciona para `/` (lista de questionários)

#### Scenario: Login com credenciais inválidas
- **WHEN** o usuário submete e-mail ou senha incorretos
- **THEN** o sistema exibe mensagem de erro "E-mail ou senha inválidos" sem revelar qual campo está errado

#### Scenario: Acesso a rota protegida sem sessão
- **WHEN** um usuário não autenticado tenta acessar qualquer rota além de `/login`
- **THEN** o sistema redireciona para `/login` preservando a URL de destino como parâmetro `redirect`

#### Scenario: Redirecionamento pós-login com redirect param
- **WHEN** o usuário faz login com `?redirect=/questionnaires/abc` na URL
- **THEN** após autenticação bem-sucedida o sistema redireciona para `/questionnaires/abc`

### Requirement: Logout
O sistema SHALL permitir que o usuário encerre sua sessão.

#### Scenario: Logout bem-sucedido
- **WHEN** o usuário aciona a ação de logout
- **THEN** o sistema invalida a sessão Supabase, limpa o estado local e redireciona para `/login`

### Requirement: Persistência de sessão
O sistema SHALL recuperar a sessão existente ao recarregar a página, sem exigir novo login.

#### Scenario: Reload com sessão válida
- **WHEN** o usuário recarrega qualquer página com sessão ativa
- **THEN** o sistema restaura a sessão e permanece na rota atual, sem redirecionar para login

#### Scenario: Sessão expirada ao recarregar
- **WHEN** o usuário recarrega a página com sessão expirada
- **THEN** o sistema redireciona para `/login`
