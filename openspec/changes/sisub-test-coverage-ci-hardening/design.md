## Context

O `sisub` é uma aplicação TanStack Start/Nitro com server functions como backend principal. O servidor usa dois clientes Supabase: `getSupabaseAuthClient()` para validar cookies/JWT e `getSupabaseServerClient()` com service role para acessar dados no schema `sisub`. Esse padrão exige testes explícitos de autenticação/autorização, porque RLS não protege automaticamente as queries feitas com service role.

A cobertura atual está concentrada em smoke/auth/navigation E2E e alguns testes de schema/CRUD para ingredientes/receitas. O pipeline de deploy executa `lint typecheck test`, mas o baseline observado falha em `lint`/`typecheck`, e testes de integração podem ser reportados como `pass` quando Supabase não está disponível. O E2E do `sisub` existe no projeto, mas foi removido do workflow de deploy.

Não há necessidade de migration Supabase nesta change. Se a implementação revelar ausência de constraints indispensáveis para testes de segurança ou consistência, isso deve virar change separada com migration própria.

## Goals / Non-Goals

**Goals:**

- Tornar o pipeline do `sisub` bloqueante para falhas reais em lint, typecheck, unit, integração obrigatória, build e E2E mínimo.
- Definir suites separadas para feedback rápido local e validação completa em CI/staging.
- Cobrir primeiro os riscos de maior impacto: service role, PBAC, operações financeiras/compra, forecast/presença, IA/SQL e realtime.
- Evitar falsos positivos: teste que não executa por falta de ambiente deve ser `skip` explícito em execução local ou `fail` no CI quando a suite exigir integração.
- Reaproveitar padrões existentes: Bun test para unit/integration leve, Playwright para E2E, Turborepo para orquestração e Biome/tsgo para qualidade.

**Non-Goals:**

- Criar um framework paralelo de testes.
- Substituir Playwright por teste de componente.
- Rodar todos os E2E multi-browser em todo deploy.
- Criar dados de produção para teste ou usar contas reais.
- Corrigir bugs funcionais encontrados pelos testes dentro desta proposta; esses fixes devem acontecer nas tasks de implementação quando bloquearem o gate.

## Decisions

### D1: Separar suites por intenção

**Decisão:** Criar scripts distintos para `test:unit`, `test:integration`, `test:e2e:ci` e manter `test` como agregador seguro para CI.

- `test:unit`: não acessa rede nem banco; roda em PR e local sempre.
- `test:integration`: usa Supabase/API staging, requer env obrigatória e falha no CI se indisponível.
- `test:e2e:ci`: Playwright Chromium com fluxos críticos e artifacts.
- `test:e2e:full`: execução manual/agendada com cobertura ampliada e, opcionalmente, multi-browser.

**Alternativa considerada:** manter tudo em `bun test src/**/*.test.ts`. Rejeitada porque mistura testes puros e integração, mascara skips e dificulta diagnóstico.

### D2: Testes de autorização devem chamar server functions diretamente

**Decisão:** Cobrir server functions sensíveis por teste de integração/contrato, simulando requests autenticados, sem permissão, escopo errado e sem sessão.

Rotas protegidas continuam importantes, mas não bastam: o risco observado está no acesso direto às server functions que usam service role. A implementação deve criar helpers de teste para usuários PBAC com permissões controladas e cleanup determinístico.

**Alternativa considerada:** testar apenas via Playwright. Rejeitada porque E2E não cobre combinações suficientes de payload/escopo e é mais lento para matrizes de autorização.

### D3: PBAC deve ser testado no pacote canônico

**Decisão:** Criar testes unitários em `packages/pbac` para `hasPermission()` e `resolveUserPermissions()`.

O app `sisub` reexporta PBAC, mas o contrato real vive no package compartilhado. Tests no pacote reduzem regressão em qualquer consumidor futuro.

**Alternativa considerada:** testar PBAC somente indiretamente por rota. Rejeitada porque não isola edge cases de escopo/global/deny.

### D4: Integração com Supabase precisa de ambiente controlado

**Decisão:** Definir um ambiente staging/dev com:

- usuário E2E de comensal;
- usuário fiscal/messhall;
- usuário kitchen scoped;
- usuário unit scoped;
- usuário global admin;
- dados seedados marcados com prefixo `[TEST]` ou IDs conhecidos;
- cleanup por soft delete ou hard delete conforme tabela.

No CI, falta de env obrigatória deve falhar rapidamente. Localmente, suites de integração podem ter skip explícito por `SISUB_INTEGRATION_REQUIRED=false`.

**Alternativa considerada:** usar banco local Supabase em todo CI. Rejeitada nesta change por custo inicial maior e porque parte dos riscos envolve serviços externos já usados em staging.

### D5: E2E mínimo bloqueia deploy; E2E ampliado roda fora do caminho crítico

**Decisão:** Reativar no deploy um E2E Chromium curto cobrindo login, hub, autorização negativa e um fluxo de produto por área. Rodar cobertura ampliada em workflow agendado/manual.

Isso reduz chance de deploy quebrado sem tornar cada deploy excessivamente lento.

**Alternativa considerada:** rodar todos os fluxos E2E em todo deploy. Rejeitada por flakiness e tempo de feedback.

### D6: IA e SQL são testados sem chamar LLM real por padrão

**Decisão:** Testar `validateSql()`, parsing/normalização de chart spec e module-chat tools com fixtures/mocks. Chamadas reais ao provider LLM ficam fora do gate de deploy ou em smoke manual.

**Alternativa considerada:** chamar OpenRouter em CI. Rejeitada por custo, instabilidade externa e baixa determinismo.

## Risks / Trade-offs

- **[Risk] Testes de integração flakey por dependência externa** → Mitigação: timeouts curtos, retry apenas no E2E, fixtures pequenas, cleanup robusto e execução full fora do caminho crítico.
- **[Risk] Service role em testes pode modificar dados reais** → Mitigação: usar ambiente staging/dev, prefixos `[TEST]`, usuários dedicados e proibir produção como target de CI.
- **[Risk] A suíte cresce e desacelera PRs** → Mitigação: unit obrigatório em todo PR; integração/E2E mínimo só quando paths do `sisub` ou packages dependentes mudarem; full suite agendada/manual.
- **[Risk] Testes descobrem bugs de autorização existentes** → Mitigação: implementar em ordem de risco e manter cada fix pequeno, com spec/task rastreável.
- **[Risk] `bun test` não tem semântica de skip/fail adequada para integrações condicionais atuais** → Mitigação: trocar `return` silencioso por `test.skip()` local ou `throw` no CI quando `SISUB_INTEGRATION_REQUIRED=true`.

## Migration Plan

1. Corrigir baseline atual de `lint` e `typecheck` do `sisub` sem alterar comportamento de produto.
2. Separar scripts de teste e atualizar `turbo.json`.
3. Adicionar unit tests puros em `packages/pbac`, `packages/sisub-domain` e libs críticas do `sisub`.
4. Adicionar helpers de integração Supabase e migrar testes existentes para skip/fail explícito.
5. Adicionar testes de autorização e fluxos críticos por domínio.
6. Reativar E2E mínimo no workflow de deploy antes do job `build-sisub` ou como dependency de deploy.
7. Adicionar workflow manual/agendado para E2E full e integrações externas mais lentas.

Rollback: se o gate novo bloquear deploy por flakiness não relacionada ao produto, desabilitar temporariamente apenas a job afetada via condition/env e abrir issue com o artifact do run. Não remover os testes ou voltar a `return` silencioso.

## Open Questions

- Qual instância Supabase será o ambiente oficial de integração/staging para CI?
- Os usuários PBAC de teste já existem ou precisam ser criados por seed automatizado?
- O workflow de deploy deve bloquear no E2E mínimo antes de `build-sisub` ou entre `build-sisub` e `deploy-sisub`?
- O smoke de Compras.gov deve mockar HTTP no CI ou chamar API pública apenas em execução agendada?
