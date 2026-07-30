## 0. Ownership de ativo global vs. local — PR de segurança, primeiro de todos

Corrige bug de autorização em produção (design → "Bug de autorização encontrado na auditoria"). PR isolado e mínimo, para revisão de segurança concentrada. O escopo treino **depende** deste grupo: sem ele, treinando com `kitchen:2` altera receita global de toda a FAB.

- [ ] 0.1 [sisub-domain] Criar o guard `authorizeAssetMutation(db, ctx, table, id)` em `src/guards/`: resolve `kitchen_id` da linha persistida; nulo → `requirePermission(ctx, "global", 2)`; preenchido → `requireKitchen(ctx, 2, ownerKitchenId)`; linha ausente → `NotFoundError` sem vazar propriedade
- [ ] 0.2 [sisub-domain] `meal-types.ts` — corrigir o IDOR: `updateMealType` (:69), `deleteMealType` (:85) e `restoreMealType` (:97) exigem `kitchen:2` sem escopo e mutam por ID sem resolver dono. Passar pelo guard de ownership
- [ ] 0.3 [sisub-domain] `meal-types.ts` — `createMealType` (:53) com `kitchenId` nulo exige `global:2`, não `kitchen:2`
- [ ] 0.4 [sisub-domain] `templates.ts` — corrigir os 6 sítios do padrão de fallback (:225, :272, :311, :385, :451, :477), classificando cada um entre mutação de linha existente (usa o guard) e criação (exige `global:2` quando o destino é global)
- [ ] 0.5 [sisub-domain] `recipes.ts` — `createRecipe` (:229) com `kitchenId` nulo exige `global:2`
- [ ] 0.6 [sisub-domain] `recipes.ts` — `createRecipeVersion` (:310): validar que `baseRecipeId` pertence ao mesmo escopo da versão criada; destino global exige `global:2`. Este é o sítio do bug explorável ponta a ponta
- [ ] 0.7 [sisub-domain] `recipe-flow.ts` — `createStepTemplate` (:445) e `createUtensil` (:487) usam `requireAnyPermission(["kitchen","global"], 2)`, o que deixa `kitchen:2` criar step template/utensílio global. Exigir `global:2` quando o destino é global
- [ ] 0.8 [sisub-domain] Refatorar `authorizeRecipeMutation` (recipes.ts:257) para delegar ao guard novo, eliminando a duplicação — o comportamento dele já é o correto
- [ ] 0.9 [sisub-domain] Teste de contrato afirmando ausência do anti-padrão: nenhuma operação decide autorização de ativo global com `requirePermission(ctx, "kitchen", 2)` num ramo de `kitchenId == null`
- [ ] 0.10 [sisub-domain] Testes de integração de ownership: cozinha 7 não muta ativo da cozinha 9; cozinha não muta ativo global; SDAB muta global; cozinha muta o próprio
- [ ] 0.11 [root] Levantar no banco real quais receitas e templates **globais** têm versões criadas por usuários sem `global:2` — são adaptações locais valendo para toda a FAB. Listar para decisão caso a caso (promover a global ou converter em fork) — R10

## 0-B. Fork de ativo global em edição local (copy-on-write)

Vai logo após o grupo 0: é o caminho de saída para a cozinha que hoje depende do bug para adaptar receita global.

- [ ] 0B.1 [database] Migration: índice por `(kitchen_id, base_recipe_id)` em `kitchen.recipes` e por `(kitchen_id, base_template_id)` em `kitchen.menu_template`, para a busca de fork existente no caminho de escrita (D14)
- [ ] 0B.2 [sisub-domain] Introduzir o parâmetro de contexto explícito (`{ scope: "global" } | { scope: "kitchen", kitchenId }`) nos schemas de edição de receita e template; contexto ausente é rejeitado, sem default (D12)
- [ ] 0B.3 [sisub-domain] Implementar o fork de receita: ativo global + contexto de cozinha → nova linha com `kitchen_id` do contexto e `base_recipe_id` do global; copiar ingredientes e fluxo com referências remapeadas (reusar `insertIngredients` + `copyRecipeFlow`); o global não é tocado
- [ ] 0B.4 [sisub-domain] Implementar um-fork-por-cozinha-por-linhagem: procurar fork vivo daquela cozinha na linhagem; se existe, versionar o fork em vez de bifurcar (D14)
- [ ] 0B.5 [sisub-domain] Implementar o fork de template de cardápio pelo mesmo desenho, usando `base_template_id`
- [ ] 0B.6 [sisub-domain] Trocar a precedência da dedup por família em `listRecipes` (:111-116) e no equivalente de templates: linha local vence a global incondicionalmente; entre locais da mesma cozinha, maior versão vence. Elimina o empate não-determinístico atual (D13, R12)
- [ ] 0B.7 [sisub-domain] Testes: global intacto após fork; linhagem registrada; ingredientes e fluxo copiados; segunda edição versiona o fork; cozinhas distintas forkam independentemente; nova versão global não sobrepõe fork; visão global ignora forks; empate de versão resolve pelo local
- [ ] 0B.8 [sisub] `RecipeForm.tsx` (:187-199) — o ramo `mode === "edit"` para de derivar o destino de `initialData.kitchen_id` e passa a declarar o contexto da edição. Esta é a linha que hoje causa o bug
- [ ] 0B.9 [sisub] Rota `/kitchen/$kitchenId/recipes/$recipeId/index.tsx` — identificar ativo global antes de editar e avisar que salvar criará cópia local (R11)
- [ ] 0B.10 [sisub] Identificar fork na listagem, com referência ao global de origem, e sinalizar quando o upstream tem versão mais nova
- [ ] 0B.11 [sisub] Avaliar se a rota dedicada `/kitchen/$kitchenId/recipes/$recipeId/fork` continua necessária agora que a edição forka sozinha; remover ou manter como ação explícita, decidindo em favor de um único caminho

## 1. Hardening de escrita global — PR isolado

Ordem deliberada (design → Migration Plan): quebra comportamento existente e precisa de revisão isolada.

- [ ] 1.1 [sisub] Levantar e classificar toda mutação global: para cada server fn com `requireAuth()` que escreve dado da SDAB, registrar em planilha/markdown se é **exclusiva-da-SDAB** ou **compartilhada-com-módulo**, com o chamador que justifica. Cobrir `ingredients.fn.ts` (33 `requireAuth`), `recipes.fn.ts` (12), `policy.fn.ts` (3), `places.fn.ts` (3), `compras-sync.fn.ts`, `nutrition-sync.fn.ts`, `purchase_item.fn.ts`, `frozen_preparation.fn.ts`, `meal-types.fn.ts`
- [ ] 1.2 [sisub-domain] Aplicar `requirePermission(ctx, "global", 2)` nas operações classificadas como exclusivas-da-SDAB
- [ ] 1.3 [sisub-domain] Aplicar `requireAnyPermission(ctx, ["global", "kitchen"], 2)` nas operações classificadas como compartilhadas (catálogo de insumos é o caso conhecido — `global:2` cego aqui quebra montagem de receita pela cozinha)
- [ ] 1.4 [sisub] Nos server fns cujas mutações ainda não passam por operação de domínio, aplicar o gate direto no handler, mantendo o padrão de duas camadas onde a op existe
- [ ] 1.5 [sisub] Estender `src/server/security-contracts.test.ts` com o contrato exaustivo: enumerar cada mutação global e o guard exigido, aceitando `requireAnyPermission` incluindo `global` como proteção válida
- [ ] 1.6 [sisub] Ajustar a UI da SDAB para desabilitar controles de escrita quando `can("global", 2)` for falso — hoje os controles aparecem habilitados para `global:1`
- [ ] 1.7 [sisub] Rodar `bun run test` + suíte de regressão de operações de domínio; confirmar que nenhum fluxo de cozinha regrediu (R6)
- [ ] 1.8 [root] Levantar em `access_control.user_permissions` quem possui `global:1` hoje e escreve em caminho global; documentar no runbook quem precisa subir para `global:2` na janela do deploy (R7)

## 2. Resolução de permissão compartilhada com precedência de deny

- [ ] 2.1 [pbac] Criar `src/effective-permissions.ts` com a resolução pura em duas fases (coleta denies → emite allows não cobertos), recebendo grants inline e statements de política como entrada e devolvendo `UserPermission[]`
- [ ] 2.2 [pbac] Implementar a semântica de cobertura de deny: deny sem escopo cobre todos os escopos do módulo; deny escopado cobre só aquele escopo; nível efetivo = maior allow sobrevivente
- [ ] 2.3 [pbac] Mover a injeção de `diner:1` implícito para a resolução compartilhada, condicionada a não haver deny de `diner` em nenhuma origem
- [ ] 2.4 [pbac] Escrever teste de equivalência retrocompatível: para um conjunto exaustivo de combinações de grants **sem políticas**, o resultado da resolução nova é idêntico ao do filtro `level > 0` atual (R5)
- [ ] 2.5 [pbac] Escrever testes da precedência de deny cobrindo os cenários da spec `access-policy-sets` (deny inline anula política, deny de política anula inline, deny global anula escopado, deny escopado não anula outro escopo)
- [ ] 2.6 [pbac] Refatorar `resolve-permissions.ts` (Supabase, consumido por rumaer/sucont) para delegar à resolução compartilhada, sem mudar a assinatura pública
- [ ] 2.7 [sisub-domain] Refatorar `listEffectiveUserPermissions` em `operations/permissions.ts` para delegar à resolução compartilhada
- [ ] 2.8 [root] Rodar as suítes de rumaer e sucont e confirmar verde (R5)

## 3. Migrations — escopo treino, políticas e auditoria

Timestamps de 14 dígitos, todas aditivas.

- [ ] 3.1 [database] Migration: `is_training boolean not null default false` em `core.units`, `core.kitchen`, `core.mess_halls` + índice único parcial `WHERE is_training = true` em cada
- [ ] 3.2 [database] Migration: seed idempotente (`WHERE NOT EXISTS`) da unidade `TREINO`, da cozinha de treino vinculada a ela e do refeitório `TREINO` vinculado a ambas, resolvendo FKs por consulta
- [ ] 3.3 [database] Migration: `access_control.policy` (`name` unique entre não-removidas, `description`, `managed`, `created_at`, `updated_at`, `deleted_at`)
- [ ] 3.4 [database] Migration: `access_control.policy_statement` (`policy_id` FK cascade, `module`, `level`, `unit_id`, `kitchen_id`, `mess_hall_id`) com check de no máximo um escopo preenchido
- [ ] 3.5 [database] Migration: `access_control.user_policy_attachment` (`user_id`, `policy_id`, unique no par, `created_at`, `created_by`)
- [ ] 3.6 [database] Migration: RLS deny-all nas três tabelas de política + índices de lookup por `user_id` e por `policy_id`
- [ ] 3.7 [database] Migration: seed da política gerenciada "Conjunto Treino" com os 7 statements da spec, escopos resolvidos por `is_training = true` (nunca hard-coded)
- [ ] 3.8 [database] Migration: `core.training_reset_log` (`id`, `actor_id`, `started_at`, `duration_ms`, `deleted_counts jsonb`, `status`, `error_message`)
- [ ] 3.9 [database] Aplicar as migrations e regenerar `src/generated.ts` pelos scripts do package — **não** rodar `drizzle pull` fresco (drift conhecido de nomes contra os hand-patches)
- [ ] 3.10 [database] Verificar que `bun run typecheck --force` passa com os tipos regenerados (cache do turbo mascara falha de typecheck)

## 4. Domínio de políticas

- [ ] 4.1 [sisub-domain] Criar `src/schemas/policies.ts` com os schemas Zod de criação/edição de política, de statement e de anexo, validando o "no máximo um escopo"
- [ ] 4.2 [sisub-domain] Criar `src/operations/policies.ts`: listar políticas com contagem de statements e de usuários anexados, buscar política com statements, criar/atualizar/soft-delete de política — todas guardadas por `global:2`
- [ ] 4.3 [sisub-domain] Implementar a rejeição de edição e remoção de política `managed = true`
- [ ] 4.4 [sisub-domain] Implementar CRUD de statement (adicionar, editar, remover), guardado por `global:2` e bloqueado em política gerenciada
- [ ] 4.5 [sisub-domain] Implementar anexo/desanexo de política a usuário, idempotente no anexo duplicado
- [ ] 4.6 [sisub-domain] Estender `operations/permissions.ts` com `listEffectiveUserPermissionsWithOrigin`: monta a resolução por selects explícitos + merge em TS, **não** por query relacional aninhada (R9 — limite de 63 chars de alias)
- [ ] 4.7 [sisub-domain] Testes de unidade das operações de política, incluindo rejeição de statement com dois escopos e imutabilidade de política gerenciada

## 5. Isolamento do escopo treino

- [ ] 5.1 [sisub-domain] Centralizar o filtro `is_training = false` nas operações de listagem de unidade, cozinha e refeitório — um único ponto por entidade, com inclusão de treino sendo parâmetro opt-in explícito (R1)
- [ ] 5.2 [sisub-domain] Auditar as operações de analytics e dashboard para garantir que nenhum agregado inclui escopo de treino
- [ ] 5.3 [sisub-domain] Expor operação de leitura das entidades de treino para o painel da SDAB
- [ ] 5.4 [sisub-domain] Teste de integração afirmando que as listagens padrão não retornam entidades de treino e que a listagem opt-in retorna
- [ ] 5.5 [sisub] Criar o componente de banner de ambiente de treino — persistente, não dispensável, sem faixa de acento lateral
- [ ] 5.6 [sisub] Plugar o banner no shell/layout, acionado quando o escopo ativo for de treino
- [ ] 5.7 [sisub] Marcar visualmente as entidades de treino nos seletores onde elas aparecem

## 6. Reset do ambiente de treino

- [ ] 6.1 [sisub-domain] Criar `src/operations/training.ts` com a lista declarativa de tabelas escopadas em ordem topológica de exclusão (filhos antes de pais) — não confiar em `ON DELETE CASCADE`, cujo comportamento é heterogêneo no schema (D4)
- [ ] 6.2 [sisub-domain] Implementar `resetTrainingScope(db, { actorId })`: advisory lock, transação única, DELETEs na ordem declarada com contagem por tabela, verificando `code = 'TREINO'` **além** de `is_training` antes de apagar qualquer coisa (R4)
- [ ] 6.3 [sisub-domain] Implementar o seed do baseline de demonstração: template de cardápio, tipos de refeição da cozinha, efetivo base — determinístico e idempotente. O baseline **reusa as receitas globais**; o treinando que editá-las gera fork local (grupo 0-B), que o reset apaga junto com o resto
- [ ] 6.4 [sisub-domain] Gravar `core.training_reset_log` com autor, instante, duração e contagens; registrar também as falhas, fora da transação de dados para persistir apesar do rollback
- [ ] 6.5 [sisub-domain] Guardar a operação por `global:2` e receber o autor por parâmetro explícito, sem ler sessão (spec: invocável sem contexto de request)
- [ ] 6.6 [sisub-domain] Operação de leitura do histórico de reset, guardada por `global:1`
- [ ] 6.7 [sisub-domain] Teste de integração do reset: limpa dados de treino (inclusive forks locais criados na cozinha de treino), preserva dados reais, preserva as sentinelas, preserva o catálogo global, é idempotente em duas execuções seguidas
- [ ] 6.8 [sisub-domain] Teste de completude da lista de reset: consulta o catálogo do banco por tabelas com `kitchen_id`/`unit_id`/`mess_hall_id` e falha se alguma não estiver na lista nem numa allowlist de exclusões justificadas (R2)
- [ ] 6.9 [sisub-domain] Teste do rollback: falha injetada no meio do reset não deixa estado parcial

## 7. Server functions

- [ ] 7.1 [sisub] Criar `src/server/policies.fn.ts` — CRUD de política, CRUD de statement, anexo/desanexo, listagem com contagens. `createServerFn().validator(...)`, `getDb()` por request no handler
- [ ] 7.2 [sisub] Criar `src/server/training.fn.ts` — reset, histórico, leitura das entidades de treino
- [ ] 7.3 [sisub] Estender `src/server/permissions.fn.ts` com a consulta de permissões efetivas com origem
- [ ] 7.4 [sisub] Adicionar as novas fns ao teste de contrato `server-fn-auth.contract.test.ts`
- [ ] 7.5 [sisub] Registrar as query keys novas em `src/lib/query-keys.ts`

## 8. Painel de treino da SDAB

- [ ] 8.1 [sisub] Criar a rota `/_protected/_modules/global/training.tsx` com `beforeLoad` exigindo `global`, loader das entidades de treino e do histórico
- [ ] 8.2 [sisub] Painel com o estado do ambiente de treino: as três entidades, contagem de dados atualmente pendurados nelas, último reset
- [ ] 8.3 [sisub] Botão "Resetar ambiente de treino" com diálogo de confirmação por digitação, visível só com `global:2`, informando que a ação é irreversível
- [ ] 8.4 [sisub] Tabela do histórico de resets, mais recente primeiro, com autor, instante, duração e contagens
- [ ] 8.5 [sisub] Adicionar a entrada de navegação em `NavItems.tsx`

## 9. Console de permissões

- [ ] 9.1 [sisub] Reorganizar `global/permissions.tsx` em duas visões (Usuários / Políticas), preservando a rota atual
- [ ] 9.2 [sisub] Refatorar `PermissionsManager.tsx`: visão de usuário com as três seções — políticas anexadas, grants inline, permissões efetivas
- [ ] 9.3 [sisub] Criar o componente de permissões efetivas com origem por linha, sinalizando explicitamente allow anulado por deny (R8)
- [ ] 9.4 [sisub] Criar a visão de listagem de políticas: nome, descrição, nº de statements, nº de usuários anexados, marcação de gerenciada
- [ ] 9.5 [sisub] Criar a tela de detalhe/edição de política com CRUD de statements, escopo condicional ao módulo, somente-leitura quando gerenciada
- [ ] 9.6 [sisub] Criar o diálogo de anexo de política, omitindo políticas já anexadas ao usuário
- [ ] 9.7 [sisub] Diálogo de desanexo com confirmação; diálogo de remoção de política informando quantos usuários serão afetados
- [ ] 9.8 [sisub] Garantir que todo seletor usa os primitivos Base UI do app (`value={x ?? null}`, `<SelectValue>` com children de label) e que nenhum card/callout usa faixa de acento lateral

## 10. Verificação e fechamento

- [ ] 10.1 [sisub] Rodar `/react-doctor` no sisub e resolver os achados legítimos
- [ ] 10.2 [root] `bun run test` (turbo, todos os apps) verde — não `bunx vitest run` da raiz, onde o alias `@/` não resolve
- [ ] 10.3 [root] `SISUB_RUN_INTEGRATION=true bun run test:integration` verde contra o banco real, incluindo os testes de completude do reset e de equivalência de resolução
- [ ] 10.4 [docs] Documentar o ambiente de treino e o modelo de políticas em `apps/docs`, com runbook do reset e da migração de quem tem `global:1`
- [ ] 10.5 [root] Corrigir `openspec/config.yaml`, que ainda documenta `.inputValidator(...)` — o repo padronizou `.validator(...)`
- [ ] 10.6 [root] `bun run check` (Biome + typecheck) verde
