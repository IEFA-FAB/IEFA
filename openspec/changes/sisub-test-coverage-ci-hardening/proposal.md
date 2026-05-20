## Why

O `sisub` já possui alguns testes, mas a cobertura atual não protege os pontos de maior risco observados: server functions com service role, PBAC escopado, integrações de compras/ATA, fluxos de comensal/fiscal, SQL gerado por IA e gates reais do CI. Hoje ainda há testes de integração que podem passar sem exercitar Supabase e o workflow de deploy do `sisub` não executa E2E antes de produção.

**App afetado:** `sisub`. **Packages relacionados:** `@iefa/pbac`, `@iefa/sisub-domain`, `@iefa/database`.

## What Changes

- Criar uma estratégia de testes por camadas para `apps/sisub`: unitários puros, integração com Supabase/staging, testes de contrato de autorização e E2E crítico.
- Corrigir o baseline do pipeline para que `lint`, `typecheck`, `test`, `build` e uma suíte E2E mínima sejam gates antes do deploy.
- Separar testes unitários de testes de integração, evitando que integrações sejam reportadas como `pass` quando dependências externas estiverem indisponíveis.
- Adicionar testes específicos para PBAC, autorização em server functions, operações do `@iefa/sisub-domain`, compras/ATA/ARP/empenho, forecast/presença/check-in, analytics SQL/LLM e realtime.
- Definir uma matriz de CI com execução rápida em PR/deploy e execução ampliada em agenda/manual.
- Adicionar documentação operacional para dados de teste, secrets, limpeza de fixtures e critérios de bloqueio do deploy.

## Não-objetivos

- Reescrever a arquitetura de server functions ou migrar todos os handlers diretos para o domain layer.
- Trocar Bun, Turborepo, Biome, Playwright ou TanStack Start.
- Criar testes de carga, visual regression por screenshot ou testes multi-browser obrigatórios em todo deploy.
- Alterar schema Supabase apenas para facilitar testes; migrations só entram se forem necessárias para corrigir comportamento de produto.
- Cobrir integralmente todos os componentes visuais do `sisub` com testes de componente nesta change.

## Capabilities

### New Capabilities

- `sisub-ci-quality-gates`: Define os gates obrigatórios do CI/CD para `sisub`, incluindo baseline verde, build, separação de suites e E2E mínimo antes de deploy.
- `sisub-authz-test-coverage`: Define cobertura unitária/de integração para PBAC, guards de server functions e acesso direto a endpoints que usam service role.
- `sisub-domain-test-coverage`: Define cobertura para schemas, guards e operações do `@iefa/sisub-domain` usadas por receitas, templates, planejamento, cozinhas e tipos de refeição.
- `sisub-procurement-test-coverage`: Define cobertura para cálculo e ciclo de vida de compras: ATA, ARP, empenho, sync Compras.gov e dashboard de saldos.
- `sisub-diner-fiscal-test-coverage`: Define cobertura para fluxos de comensal e fiscal: forecast, default mess hall, QR/self check-in, presenças e duplicidades.
- `sisub-analytics-ai-test-coverage`: Define cobertura para analytics SQL, streaming de chat, module-chat tools e limites de segurança de IA.
- `sisub-e2e-critical-paths`: Define os fluxos E2E mínimos que devem rodar no CI e os fluxos ampliados para execução agendada/manual.

### Modified Capabilities

Nenhuma. Não há capabilities arquivadas em `openspec/specs/` para alterar nesta change.

## Impact

- **Código de teste:** novos arquivos em `apps/sisub/src/**/*.test.ts`, `packages/pbac/src/**/*.test.ts`, `packages/sisub-domain/src/**/*.test.ts` e `apps/sisub/e2e/tests/**/*.spec.ts`.
- **CI/CD:** ajustes em `.github/workflows/deploy.yml`, `turbo.json` e scripts de `apps/sisub/package.json` para separar suites e bloquear deploy em falhas reais.
- **Dados externos:** Supabase staging/dev precisa ter usuário(s) de teste dedicados, permissões PBAC controladas e dados seedados/limpáveis.
- **Contratos de segurança:** endpoints com service role devem ter testes provando rejeição sem sessão, sem permissão ou com escopo errado.
- **Confiabilidade:** testes de integração devem falhar explicitamente quando ambiente obrigatório estiver mal configurado, em vez de retornar `pass` silencioso.
