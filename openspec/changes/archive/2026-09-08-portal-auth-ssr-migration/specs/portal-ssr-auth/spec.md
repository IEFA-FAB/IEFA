## ADDED Requirements

### Requirement: Sessão baseada em cookies SSR
O portal SHALL usar `@supabase/ssr` com `createBrowserClient` no cliente e `createServerClient` no servidor, armazenando o JWT em cookies HttpOnly em vez de `localStorage`.

#### Scenario: Login persiste após reload
- **WHEN** usuário faz login com sucesso
- **THEN** a sessão SHALL estar disponível após reload completo da página sem novo login

#### Scenario: SSR recebe sessão válida
- **WHEN** usuário autenticado navega para uma rota protegida via SSR (hard navigation)
- **THEN** o servidor SHALL reconhecer o usuário como autenticado no primeiro render, sem flash de tela de login

#### Scenario: Token renovado automaticamente
- **WHEN** o JWT de acesso expira e o refresh token ainda é válido
- **THEN** o `createServerClient` SHALL renovar o token via `setAll` e a sessão SHALL continuar ativa sem deslogar o usuário

---

### Requirement: Validação JWT server-side via createServerFn
O portal SHALL validar o JWT no servidor Supabase (não apenas verificar `localStorage`) usando `getServerSessionFn` — um `createServerFn` que chama `supabase.auth.getUser()` via `getSupabaseAuthClient()`.

#### Scenario: authQueryOptions usa server function
- **WHEN** `authQueryOptions().queryFn` é invocado (SSR ou cliente)
- **THEN** SHALL chamar `getServerSessionFn()` que valida o token server-side via `createServerClient` com cookies

#### Scenario: Usuário não autenticado retorna null
- **WHEN** `getServerSessionFn()` é chamado sem cookie de sessão válido
- **THEN** SHALL retornar `{ user: null, session: null }` sem lançar erro

#### Scenario: Token inválido/expirado retorna null
- **WHEN** `getServerSessionFn()` é chamado com cookie de sessão expirado ou inválido
- **THEN** SHALL retornar `{ user: null, session: null }` sem lançar erro

---

### Requirement: Separação de clientes Supabase (browser vs server)
O portal SHALL manter dois clientes Supabase distintos — nunca importar cliente server em código client-side e vice-versa.

#### Scenario: Cliente browser acessível em componentes React
- **WHEN** componente React importa `supabase` de `@/lib/supabase`
- **THEN** SHALL receber instância `createBrowserClient` com schemas `iefa` e `journal` acessíveis via `portalDb()` e `journalDb()`

#### Scenario: Cliente server nunca vaza para o browser
- **WHEN** bundler processa `src/lib/supabase.server.ts`
- **THEN** o arquivo SHALL conter apenas imports server-safe (`@supabase/ssr`, `@tanstack/react-start/server`) — sem `import.meta.env`, sem `window`, sem `localStorage`

---

### Requirement: Variáveis de ambiente server-only validadas
O portal SHALL validar `PORTAL_SUPABASE_SECRET_KEY` no startup do servidor via `src/lib/env.server.ts`, usando `process.env` (não `import.meta.env`).

#### Scenario: Variável ausente causa falha ruidosa
- **WHEN** servidor inicia sem `PORTAL_SUPABASE_SECRET_KEY` definida
- **THEN** SHALL lançar `Error` com mensagem listando a variável ausente antes de aceitar requests

#### Scenario: Variável presente permite startup normal
- **WHEN** servidor inicia com `PORTAL_SUPABASE_SECRET_KEY` definida
- **THEN** `envServer.PORTAL_SUPABASE_SECRET_KEY` SHALL estar disponível para importação em arquivos server-only

---

### Requirement: safeRedirect em guards de rota
O portal e o sisub SHALL usar `safeRedirect(target, fallback)` nos guards `beforeLoad` da rota `/auth` para prevenir open redirect.

#### Scenario: Redirect para path interno é permitido
- **WHEN** `?redirect=/journal/submit` está na URL e usuário está autenticado
- **THEN** o guard SHALL redirecionar para `/journal/submit`

#### Scenario: Redirect para domínio externo é bloqueado
- **WHEN** `?redirect=https://evil.com` está na URL
- **THEN** o guard SHALL redirecionar para o fallback padrão (`/` no portal, `/hub` no sisub)

#### Scenario: Redirect com `//` é bloqueado
- **WHEN** `?redirect=//evil.com/path` está na URL
- **THEN** o guard SHALL redirecionar para o fallback padrão

#### Scenario: Redirect ausente usa fallback
- **WHEN** `?redirect` não está na URL
- **THEN** o guard SHALL redirecionar para o fallback padrão
