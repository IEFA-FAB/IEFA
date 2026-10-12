## ADDED Requirements

### Requirement: App SISPROV no monorepo
O sistema SHALL ter o app `apps/sisprov` (TanStack Start + Nitro, React 19) construído pelo mesmo trilho dos demais apps do ERP: `@iefa/tsconfig/react-app.json`, `@iefa/supabase-kit` para todo cliente Supabase, `@iefa/auth-kit` para ações de autenticação, `@iefa/pbac/start` para os gates de servidor, entrada em `apps.manifest.json` com os artefatos de deploy regerados por `bun run generate:deploy`, jobs `check-sisprov`, `build-sisprov` e `deploy-sisprov` no `deploy.yml`, stack `infra/sisprov` idêntica às demais salvo o `terraform.tfvars`. O app MUST ler as variáveis `VITE_SISPROV_SUPABASE_URL`, `VITE_SISPROV_SUPABASE_PUBLISHABLE_KEY` (cliente) e `SISPROV_SUPABASE_SECRET_KEY` (servidor), documentadas em `.env.schema`, e falhar na primeira leitura quando faltarem.

#### Scenario: Deploy gerado do manifesto
- **WHEN** o app está em `apps.manifest.json` e `bun run check:deploy` roda
- **THEN** `Dockerfile`, `docker-bake.hcl`, `.github/paths-filter.yml` e as regiões geradas do `deploy.yml` já contêm o sisprov e o comando sai sem drift

#### Scenario: Variável de servidor ausente
- **WHEN** `SISPROV_SUPABASE_SECRET_KEY` não está definida e uma server function é chamada
- **THEN** o módulo de ambiente lança erro nomeando a variável, em vez de o app subir e falhar numa query

### Requirement: Schema `sisprov` vazio e exposto
O banco SHALL ter o schema `sisprov` criado por migration com cabeçalho-decisão, `grant usage` para `anon`, `authenticated` e `service_role`, default privileges de `select` para `authenticated` e `all` para `service_role` em tabelas futuras, incluído em `pgrst.db_schemas` e na lista `SUPABASE_SCHEMAS` do pacote `database`. O schema MUST nascer sem tabelas: tabela com `unit_id` só é criada depois de declarada no guard de reset de treino do sisub.

#### Scenario: Schema criado sem tabela
- **WHEN** a migration de fundação é aplicada
- **THEN** `sisprov` existe, aparece na API do PostgREST e nenhuma tabela nova é encontrada pelo guard `training.operations.test.ts`

### Requirement: Package `sisprov-domain`
O sistema SHALL ter `packages/sisprov-domain` com a estrutura do `sisub-domain` (`schemas/`, `operations/`, `guards/`, `types/`, `utils/`), exports por subpath, `UserContext` re-exportado de `@iefa/pbac`, hierarquia `DomainError` e guards dos três módulos do SISPROV. Operation de escrita MUST receber `ctx` e chamar um guard (regra `domain-op-discards-user-context`, estendida ao package).

#### Scenario: Guard por OM com hierarquia de apoio
- **WHEN** um usuário tem `sisprov-supply` nível 2 na OM apoiadora e a operation exige nível 2 numa OM apoiada por ela
- **THEN** o guard aceita; na OM não coberta, lança `PermissionDeniedError`

### Requirement: Rotas legais e aviso de ciência
O app SHALL servir `/termos-de-uso`, `/politica-de-privacidade` e `/politica-de-cookies` a partir de `iefa.legal_documents` via `@iefa/legal-kit`, públicos, e mostrar o aviso de ciência (`LegalNoticeBanner`) a toda sessão com documento pendente, sem bloquear a navegação. O SISPROV MUST constar da lista de sistemas dos Termos e da Privacidade e das linhas do inventário da Política de Cookies das chaves que grava (`theme`, `auth_rate_limit`, `fab_remember_email`), em versão nova dos documentos.

#### Scenario: Chave gravada sem linha que nomeie o app
- **WHEN** o app grava uma chave de armazenamento cuja linha no inventário não cita o SISPROV
- **THEN** `cookie-inventory.test.ts` falha nomeando a chave e o app

### Requirement: Shell autenticado com hub por permissão
O app SHALL ter `/` redirecionando para `/hub` (autenticado) ou `/auth`; `/hub` listando só os módulos que a política concede; a casca com um item de navegação por módulo acessível, menu do usuário e links legais; e, sem módulo nenhum, uma tela que diz que o acesso ainda não foi concedido e como pedir. A tela MUST NOT oferecer módulo que a política nega; a negativa de rota redireciona ao hub com o motivo visível.

#### Scenario: Sessão sem grant
- **WHEN** um usuário autenticado sem módulo `sisprov-*` abre `/hub`
- **THEN** vê a mensagem de acesso não concedido com o canal para pedir, e nenhum card de módulo

#### Scenario: Rota negada
- **WHEN** um usuário com `sisprov-supply` apenas abre `/admin`
- **THEN** é redirecionado a `/hub` com `denied=sisprov-admin` e a tela explica a negativa

### Requirement: Saúde e estado do banco
O app SHALL expor `/health` para o ALB e mostrar a faixa de instabilidade do banco (`DatabaseStatusBanner`) quando a leitura de saúde falhar. Estado vazio, carregando e falha MUST ser telas distintas em toda listagem.

#### Scenario: Banco indisponível
- **WHEN** a consulta de saúde falha ou expira
- **THEN** a faixa aparece no topo e nenhuma tela mostra lista vazia como se fosse ausência de dados
