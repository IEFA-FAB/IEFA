## Context

### Estado atual do PBAC

O sisub resolve autorização por grants diretos em `access_control.user_permissions`, uma linha por `(user_id, module, level, escopo)` onde escopo é no máximo um entre `unit_id`, `kitchen_id`, `mess_hall_id`. A lógica vive em `packages/pbac`:

- `has-permission.ts` — `hasPermission(permissions, module, minLevel, scope)`. Um grant sem escopo (`isGlobal`) vale para qualquer contexto; com escopo, casa por tipo+id. Sem `scope` no argumento, qualquer grant do módulo passa.
- `resolve-permissions.ts` — variante Supabase usada por rumaer/sucont: injeta `diner:1` implícito e **filtra `level > 0`**, isto é, o deny é apenas descartado da lista.
- `packages/sisub-domain/src/operations/permissions.ts` — `listEffectiveUserPermissions` faz o mesmo via Drizzle, e é a fonte usada pelo sisub.
- `packages/sisub-domain/src/guards/require-permission.ts` — `requirePermission`, `requireAnyPermission`, `requireKitchen`, `requireKitchenProduction`, `requireUnit`, `requireMessHall`.

Consumo no app: `apps/sisub/src/auth/pbac.ts` expõe `requirePermission` para `beforeLoad` e `usePBAC()` para componentes, ambos lendo do cache React Query preenchido em `/_protected`. A UI de administração é `apps/sisub/src/components/features/global/PermissionsManager.tsx`.

### Duas limitações que este change ataca

**1. Deny não é precedência, é ausência.** Hoje `level 0` é removido pelo resolver antes de qualquer checagem. Com uma única origem de grants isso é equivalente a negar — não havia como um allow coexistir com um deny para o mesmo módulo/escopo, porque a UI edita a mesma linha. Ao introduzir uma segunda origem (políticas), passa a ser possível ter allow de política e deny inline simultâneos, e o filtro atual daria o resultado errado: o allow da política sobreviveria.

**2. `global:1` não é read-only.** Levantamento nos server functions do sisub: 7 operações de domínio guardam `global:2`; a maioria das mutações globais chega ao banco protegida apenas por `requireAuth()`. `ingredients.fn.ts` tem 33 chamadas de `requireAuth()`, `policy.fn.ts` 3, `places.fn.ts` 3. Um usuário com `global:1` hoje **consegue** alterar o catálogo global. Sem corrigir isso, o Conjunto Treino não entrega o que promete.

### Bug de autorização encontrado na auditoria

Tabelas que guardam ativo global e local na mesma estrutura (`kitchen_id IS NULL` = global, da SDAB) usam este padrão:

```ts
if (input.kitchenId != null) requireKitchen(ctx, 2, input.kitchenId)
else requirePermission(ctx, "kitchen", 2)   // ← autoriza mutação de GLOBAL com kitchen:2
```

Doze ocorrências: `recipes.ts` (2), `templates.ts` (6), `meal-types.ts` (4). O padrão **correto** já existe no mesmo arquivo — `authorizeRecipeMutation` (recipes.ts:257) resolve o dono da linha e exige `global:2` quando `kitchenId == null`, e o guard de `saveRecipeFlow` (recipe-flow.ts:99) faz o mesmo. Está aplicado de forma inconsistente: delete/rename/restore de receita estão protegidos, `createRecipeVersion` não.

Caminho de exploração verificado ponta a ponta:

1. `listRecipes` (recipes.ts:93) retorna, para uma cozinha, `or(isNull(kitchenId), eq(kitchenId, input.kitchenId))` — globais aparecem na listagem da cozinha, por desenho.
2. A rota `/kitchen/$kitchenId/recipes/$recipeId/index.tsx:31` renderiza `<RecipeForm mode="edit">` para **qualquer** `recipeId`, sem verificar propriedade.
3. `RecipeForm.tsx:190` no ramo `mode === "edit"` chama `createRecipeVersion` com `kitchen_id: initialData.kitchen_id` — nulo para receita global.
4. `createRecipeVersion` (recipes.ts:310) cai no `else` e passa com `kitchen:2`.
5. `listRecipes` deduplica por família mantendo a **maior versão** (recipes.ts:115). A nova versão vira a receita canônica **de toda a FAB**.

Nenhum ownership check sobre `baseRecipeId` existe em ponto algum.

`meal-types.ts` é uma classe pior: `updateMealType` (:69), `deleteMealType` (:85) e `restoreMealType` (:97) exigem `kitchen:2` **sem escopo** e mutam por `mealTypeId` sem resolver o dono — IDOR direto entre cozinhas, além do global.

### Estado atual dos escopos

`core.units` (PK `bigserial`, `code` unique), `core.kitchen` (PK `bigint identity`, FK `unit_id` e `purchase_unit_id` → units, **sem coluna `code`** — identificada por `display_name`), `core.mess_halls` (PK `bigserial`, `code` unique, FKs para unit e kitchen). Vinte e quatro tabelas carregam `unit_id`/`kitchen_id`/`mess_hall_id`.

### Restrições

- Estoque fora de escopo: o módulo `storage` existe como label PBAC, mas as tabelas vivem nos PRs #117–#123 (não mergeados).
- Sem cron: nenhum `pg_cron` nas migrations; syncs são disparados por botão em `/global/sync-routines`.
- `packages/pbac` é compartilhado com rumaer e sucont — qualquer mudança de resolução precisa ser byte-a-byte compatível na ausência de políticas.
- Migrations Supabase exigem prefixo de timestamp de 14 dígitos (prefixo de 8 quebra a CLI).
- Convenções do repo: `createServerFn().validator(...)` (nunca `inputValidator`), fns em `src/server/*.fn.ts`, `getDb()`/`getSupabaseServerClient()` por request dentro do handler.

## Goals / Non-Goals

**Goals:**

- Um escopo de treino descartável — uma unidade, uma cozinha, um refeitório — isolado das listagens e dos indicadores de produção.
- Reset manual atômico e auditado, disparável pela SDAB, implementado como operação de domínio pura para ser agendável depois sem retrabalho.
- Políticas nomeadas e anexáveis no modelo AWS IAM (managed policy + inline policy), com deny de precedência absoluta e origem rastreável.
- `global:1` como leitura estrita de fato, verificado por teste de contrato.
- Retrocompatibilidade total para quem não usa políticas, incluindo rumaer e sucont.

**Non-Goals:**

- Estoque treino, reset automático semanal, múltiplos ambientes de treino, policy sets aninhados, anexo a grupos/roles, condições ABAC, extensão do console a rumaer/sucont. Justificativas em `proposal.md` → Não-objetivos.

## Decisions

### D1 — Marcação `is_training` na própria tabela, não tabela paralela

**Escolha:** coluna booleana `is_training` em `core.units`, `core.kitchen`, `core.mess_halls`, com índice único parcial `WHERE is_training = true`.

**Por quê:** o escopo de treino precisa ser um escopo de primeira classe — o mesmo `unit_id`/`kitchen_id` que já circula em 24 tabelas, nos grants de PBAC e nos server functions. Qualquer modelagem paralela (tabela `training_entity`, prefixo de ID, schema separado) exigiria bifurcar toda query escopada e todo guard, e a permissão de treino não poderia ser expressa com o mesmo `(module, level, scope)` que o resto do sistema usa.

**Alternativas consideradas:**

- *Schema `training` espelhando `core`/`kitchen`*: isolamento perfeito, mas duplica ~30 tabelas e todo o código de acesso. Custo desproporcional.
- *Banco/projeto Supabase separado para treino*: isolamento máximo, mas exige segunda instância, segundo deploy, sincronização de catálogo global e login duplicado. Rejeitado por custo operacional.
- *Convenção por `code`/`display_name` sem coluna*: frágil — renomear a unidade quebraria o isolamento silenciosamente.

**Consequência:** o isolamento passa a ser responsabilidade de cada query de listagem (`WHERE is_training = false` por padrão). Isso é um risco de omissão, mitigado em R1.

### D2 — Índice único parcial + `code = 'TREINO'` como trava de segurança

**Escolha:** `CREATE UNIQUE INDEX ... ON core.units (is_training) WHERE is_training = true` (idem para as outras duas), e as entidades de treino identificadas por `code = 'TREINO'` onde a coluna existe.

**Por quê:** o reset é destrutivo por FK cascade em ~20 tabelas. A pior falha imaginável é `is_training` marcado por engano numa unidade real. O índice parcial torna isso impossível de acontecer por acidente de UPDATE em massa, e o `code` dá uma segunda âncora verificável.

**Consequência:** trocar qual entidade é a de treino exige duas operações (desmarcar, marcar) na mesma transação. Aceitável — não é um fluxo previsto.

### D3 — Reset por operação de domínio transacional, não por função SQL

**Escolha:** `resetTrainingScope(db, { actorId })` em `packages/sisub-domain/src/operations/training.ts`, usando transação Drizzle e advisory lock, com o seed do baseline em TypeScript.

**Por quê:** o repo já concentra regra de negócio nas operações de domínio (`packages/sisub-domain/src/operations/*`), testáveis pela suíte de integração (`SISUB_RUN_INTEGRATION=true bun run test:integration`). Uma função PL/pgSQL seria menos testável, duplicaria as regras de composição do baseline (efetivo base, escalonamento de ingrediente) que já existem em TS, e o padrão de lock de concorrência por advisory lock já é usado no domínio.

**Alternativas consideradas:**

- *Função SQL `reset_training_scope()` chamada por RPC*: seria pré-requisito de um agendamento por `pg_cron`. Como o agendamento está fora de escopo, o custo não se paga agora. Se pg_cron entrar depois, o caminho é um job que chama a operação de domínio via endpoint, não reimplementar em SQL.
- *`TRUNCATE ... CASCADE`*: apagaria dados reais — as tabelas são compartilhadas entre escopos. Inviável.

**Consequência:** o reset roda no processo do app, sujeito ao timeout do request. Mitigado em R3.

### D4 — Ordem de exclusão explícita, não confiança em `ON DELETE CASCADE`

**Escolha:** o reset apaga em ordem topológica explícita (filhos antes de pais), com a lista de tabelas declarada em um único array no módulo de treino.

**Por quê:** os FKs do schema têm `onDelete` heterogêneo — parte `cascade`, parte `restrict`, parte sem cláusula. Confiar no cascade produziria falha em `restrict` ou, pior, deixaria órfãos onde não há cascade. Uma lista explícita também é o que permite o log de contagem por tabela exigido pela spec de auditoria.

**Consequência:** a lista precisa ser mantida quando uma tabela escopada nova é criada. Mitigado em R2.

### D5 — Modelo AWS: managed policy + inline policy, dois níveis, não três

**Escolha:** `access_control.policy` (política nomeada) → `access_control.policy_statement` (N statements) → `access_control.user_policy_attachment` (anexo a usuário). `user_permissions` permanece como inline policy.

**Por quê:** é literalmente o modelo do IAM. Uma *managed policy* da AWS **já é** o conjunto de permissões — não existe "policy set" agrupando policies; o agrupamento se dá anexando N políticas ao principal. O pedido do usuário ("uma política que seja um conjunto de políticas") é satisfeito por uma política com N statements: o "Conjunto Treino" é uma política, os "conjuntos" que ela agrega são seus statements. Um terceiro nível de indireção adicionaria complexidade de resolução sem novo poder expressivo.

**Alternativas consideradas:**

- *`policy` + `policy_set` agrupando policies*: mais fiel à leitura literal do pedido, mas 3 níveis para resolver e nenhum caso de uso que 2 níveis não cubra.
- *Grupos de usuários (`group` + `group_permission` + `user_group`)*: mais simples, mas amarra o conjunto de permissões a um conjunto de pessoas. Uma política é reusável entre contextos; um grupo não. Grupos podem ser adicionados depois **por cima** deste modelo (anexo grupo→política) sem migração de dados.

**Consequência:** duas origens de permissão a resolver e a exibir. É o que motiva D6 e a exigência de origem rastreável.

### D6 — Deny vira precedência de primeira classe na resolução

**Escolha:** a resolução deixa de filtrar `level > 0` e passa a duas fases: coleta os denies (de qualquer origem), depois emite os allows que nenhum deny cobre. Um deny sem escopo cobre todos os escopos do módulo; um deny escopado cobre só aquele escopo. O `diner:1` implícito só é injetado se não houver deny de `diner` em nenhuma origem.

**Correção após revisão:** duas fases não bastam. Um allow SEM escopo não é recortável numa lista plana — "vale em todo lugar menos na cozinha 7" não tem representação —, então o allow global sobrevivia à fase 2 e, valendo para qualquer contexto, reautorizava justamente o escopo negado. Os denies passam a permanecer no conjunto efetivo e `hasPermission` os aplica ANTES de procurar allow. Com `level 0` eles nunca satisfazem `level >= minLevel`, então não viram concessão; mas quem percorre o array em vez de consultar o guard precisa filtrar `level > 0` — daí o helper `resolveModuleScopes`, que substituiu as seis cópias do padrão `some()/filter()` nas telas de seleção.

**Por quê:** com duas origens, "descartar o deny" deixa de ser equivalente a negar (ver Context → limitação 1). Precedência de deny é também o comportamento do IAM, o que mantém o modelo mental consistente com a analogia que a UI vai usar.

**Retrocompatibilidade:** para um usuário sem políticas anexadas o resultado é idêntico ao do filtro atual, **com uma exceção** que o teste de equivalência exaustivo revelou e que é a própria correção: quando allow e deny coexistem para o mesmo módulo em `user_permissions` (nada impede as duas linhas hoje — não há unique em `(user_id, module, escopo)`), o filtro antigo deixava o **allow** vencer. Agora vence o deny. Com uma origem só o par era raro; com políticas anexadas ele vira o caso normal, e manter o comportamento antigo significaria que anexar uma política revoga um deny explícito do administrador. Afirmado por teste, não por argumento: `packages/pbac/src/effective-permissions.test.ts` compara as duas implementações em ~90 mil pares (permissões, consulta) fora do conflito, e fixa a divergência dentro dele.

**Consequência:** `resolve-permissions.ts` (Supabase, usado por rumaer/sucont) e `listEffectiveUserPermissions` (Drizzle, sisub) hoje duplicam a lógica. A resolução pura sai para um módulo compartilhado em `packages/pbac` consumido pelos dois, para que não divirjam.

### D7 — Statements reusam a forma do grant, sem generalização

**Escolha:** `policy_statement` tem exatamente as colunas de um grant: `module`, `level`, `unit_id`, `kitchen_id`, `mess_hall_id`, com check garantindo no máximo um escopo preenchido.

**Por quê:** mantém `hasPermission` inalterado — statements resolvidos e grants inline colapsam na mesma estrutura `UserPermission[]` antes de qualquer checagem. Nenhum guard, nenhuma rota e nenhum componente precisa saber que políticas existem.

**Alternativas consideradas:** documento JSON estilo IAM (`{Effect, Action, Resource}`). Expressivo, mas exigiria um avaliador novo, perderia a validação do banco por check constraint e não tem caso de uso hoje (não há wildcards nem condições no escopo).

### D8 — "Conjunto Treino" como política gerenciada seeded, com escopos resolvidos em runtime de migration

**Escolha:** seed por migration com `managed = true`; os `unit_id`/`kitchen_id`/`mess_hall_id` dos statements vêm de `SELECT id FROM ... WHERE is_training = true`, na própria migration.

**Por quê:** IDs de treino são `bigserial`/`identity` — diferem entre ambientes (local, staging, prod). Hard-code quebraria fora do ambiente onde foi escrito, e apontaria para uma unidade **real** no pior caso.

**`managed = true`** impede que alguém edite a política que define o próprio ambiente de treino e produza um Conjunto Treino que escreve em produção.

### D9 — Gate global: `requirePermission(ctx, "global", 2)` para exclusivo, `requireAnyPermission` para compartilhado

**Escolha:** classificar cada mutação global em exclusiva-da-SDAB ou compartilhada-com-módulo, aplicando `requirePermission(ctx, "global", 2)` na primeira e `requireAnyPermission(ctx, ["global", "kitchen"], 2)` na segunda.

**Por quê:** `requireAnyPermission` já existe exatamente para isso e o próprio JSDoc dele cita o caso: *"o catálogo de insumos, gerido por `global` (SDAB) mas lido/editado por `kitchen` (montagem de receitas)"*. Aplicar `global:2` cego no catálogo de insumos quebraria a montagem de receita pela cozinha — é o erro mais provável desta parte do trabalho.

**Consequência:** a classificação é um julgamento por operação, não mecânica. Cada uma precisa ser decidida lendo quem chama.

### D10 — Guard no domínio, contrato no teste

**Escolha:** o gate vive na operação de domínio (`packages/sisub-domain`), não no server function; o server function autentica e repassa o `ctx`. Um teste de contrato enumera as mutações e o guard exigido.

**Por quê:** é a arquitetura de duas camadas já estabelecida — `security-contracts.test.ts` documenta: *"o server fn autentica (requireAuth) e repassa o ctx; a operação do domínio impõe global level 2"*. O teste de contrato é o mecanismo que já existe no repo para impedir regressão silenciosa, e já trata alvo movido com mensagem legível em vez de ENOENT opaco.

### D11 — Guard de ownership único, com o dono lido do banco

**Escolha:** um guard `authorizeAssetMutation(db, ctx, table, id)` que resolve `kitchen_id` da linha persistida e decide: nulo → `global:2`; preenchido → `kitchen:2` escopado naquela cozinha. Substitui as 12 ocorrências do padrão de fallback.

**Por quê:** o bug existe porque a decisão está replicada por operação e a entrada da requisição é usada como fonte de verdade do escopo. Ler o dono do banco elimina a classe inteira — não há como o cliente mentir o escopo. Centralizar é o que permite o teste de contrato afirmar ausência do anti-padrão.

**Alternativas consideradas:**

- *Corrigir os 12 sítios in loco mantendo o padrão*: mais rápido, mas o 13º sítio nasce errado. O teste de contrato não teria um alvo único para verificar.
- *RLS no Postgres por `kitchen_id`*: defesa em profundidade real, mas as operações rodam com service role (que bypassa RLS) por decisão anterior do repo. Não resolveria.

### D12 — Fork por copy-on-write, decidido pelo contexto explícito

**Escolha:** a operação de edição recebe o contexto (`{ scope: "global" }` ou `{ scope: "kitchen", kitchenId }`) como parâmetro obrigatório. Ativo global + contexto de cozinha → fork local. Ativo global + contexto global → nova versão global, exigindo `global:2`.

**Por quê:** a alternativa natural — inferir do que o usuário pode fazer — produz comportamento dependente de quem você é: alguém com `global:2` **e** `kitchen:2` editando pela tela da cozinha alteraria o global sem querer. O contexto vem da rota, que é inequívoca (`/kitchen/$kitchenId/...` vs `/global/...`).

**Consequência:** `RecipeForm.tsx` não pode mais derivar o destino de `initialData.kitchen_id`. O ramo `mode === "edit"` passa a declarar o contexto — é exatamente a linha que hoje causa o bug.

### D13 — Fork sombreia o global por propriedade, não por número de versão

**Escolha:** na listagem de uma cozinha, dentro de uma família (`base_recipe_id ?? id` como raiz), a linha **local** vence a global incondicionalmente. Entre linhas locais da mesma cozinha, vence a de maior versão.

**Por quê:** a dedup atual compara só `version` com `>` estrito (recipes.ts:115). Se a SDAB publica a versão 2 do global depois de a cozinha ter forkado com versão 2, há empate e o vencedor depende da ordem de retorno das linhas — não-determinístico. Semanticamente, o certo é o que o git faz: seu branch sombreia o upstream no seu workspace, independente de quantos commits cada lado tem.

**Consequência:** a linhagem do fork deixa de compartilhar o contador de versão com o global. A UI passa a poder sinalizar "existe versão mais nova no upstream" sem que isso mude o que a cozinha vê.

### D14 — Um fork por cozinha por linhagem

**Escolha:** antes de criar um fork, a operação procura fork vivo daquela cozinha na mesma linhagem; se existe, versiona o fork em vez de bifurcar de novo.

**Por quê:** sem isso, cada save de uma cozinha sobre a receita global geraria um fork novo, e a dedup por família teria N locais concorrendo. Também é o que o usuário espera: editar duas vezes não cria duas cópias.

**Consequência:** a busca de fork existente entra no caminho de escrita. Precisa de índice por `(kitchen_id, base_recipe_id)`.

## Risks / Trade-offs

**R1 — Listagem esquecida vaza a entidade de treino para produção (D1).** Um seletor ou relatório que não filtre `is_training` mostra a unidade de treino a todo mundo, e pior, deixa dados de treino entrarem em indicador. → Centralizar o filtro nas operações de domínio de listagem de unidade/cozinha/refeitório (um único ponto por entidade), com o parâmetro de inclusão sendo opt-in explícito. Teste de integração afirmando que as listagens padrão não retornam treino.

**R2 — Tabela escopada nova não entra na lista de reset (D4).** O reset passa a deixar resíduo silencioso, e o ambiente de treino nunca fica realmente limpo. → Teste de integração que consulta o catálogo do banco por colunas `kitchen_id`/`unit_id`/`mess_hall_id` e falha se alguma tabela não estiver na lista de reset nem numa allowlist explícita de exclusões justificadas.

**R3 — Reset excede o timeout do request (D3).** ~20 DELETEs mais o seed, dentro de uma transação, num request SSR. O app já teve incidente de 502 por timeout de upstream em SSR. → O reset roda contra um volume pequeno por construção (um ambiente de treino, uma semana de dados). Medir a duração e gravá-la no log de auditoria desde a primeira versão; se passar de alguns segundos, mover para execução assíncrona com status por polling, como o painel de syncs já faz.

**R4 — `is_training` marcado em unidade real (D2).** Destrutivo e irreversível. → Índice único parcial, exigência de `code = 'TREINO'` na verificação da operação de reset (não apenas `is_training`), confirmação por digitação na UI, e nenhum caminho de UI que marque `is_training` — a marcação existe só por migration.

**R5 — Regressão de autorização em rumaer/sucont (D6).** Os dois apps consomem `resolve-permissions.ts`. Uma mudança na resolução que altere o resultado quebra autorização em apps fora deste change. → Resolução pura extraída para `packages/pbac` e coberta por teste de equivalência exaustivo. O teste encontrou uma divergência real (allow + deny no mesmo módulo — ver D6), que é a correção pretendida e não um acidente: qualquer usuário de rumaer/sucont com esse par de linhas perde o acesso que hoje tem indevidamente. Levantar se existe algum antes do deploy.

**R6 — Gate `global:2` cego quebra escrita legítima de cozinha (D9).** O catálogo de insumos é o caso conhecido; podem haver outros. → Classificação operação por operação lendo os chamadores; `requireAnyPermission` onde compartilhado. Rodar a suíte de regressão de operações de domínio, que cobre os fluxos de cozinha.

**R7 — BREAKING silencioso para quem hoje tem `global:1` e escreve.** Depois do deploy, essas pessoas perdem a escrita sem aviso. → Antes do merge, levantar quem possui `global:1` em `user_permissions`; para quem legitimamente precisa escrever, subir para `global:2` na mesma janela do deploy. Documentar no runbook.

**R8 — UI de duas origens confunde mais do que a de hoje.** Três seções (políticas anexadas, grants inline, efetivas) podem deixar o administrador sem saber onde mexer. → A seção de permissões efetivas é a resposta canônica à pergunta "o que essa pessoa pode fazer", sempre visível, com origem por linha; as outras duas são as de edição. Deny anulando allow é sinalizado explicitamente, não apenas omitido.

**R10 — Dados já criados pelo caminho errado (D11).** Existem, potencialmente, versões de receitas e templates **globais** criadas por usuários sem `global:2` — isto é, adaptações locais que hoje valem para toda a FAB. Corrigir o guard não desfaz isso. → Antes do deploy, levantar as linhas globais cuja versão foi criada por quem não tem `global:2` e decidir caso a caso: promover a global (a SDAB endossa a mudança) ou converter em fork da cozinha de origem. Sem esse levantamento, o hardening congela dados errados como se fossem oficiais.

**R11 — Fork silencioso surpreende quem tinha `global:2` (D12).** Alguém da SDAB que hoje edita receita global pela tela da cozinha vai passar a criar fork local sem perceber que o global não mudou. → Aviso explícito antes de salvar (exigido pela spec), e a tela da cozinha identifica o ativo como global antes da edição.

**R12 — Empate de versão fork/global já é não-determinístico hoje (D13).** Não é risco introduzido — é bug latente existente. → A troca da precedência para "local vence" o elimina; teste cobrindo o caso de versões iguais.

**R9 — Alias de 63 caracteres em query relacional profunda.** Já mordeu o repo: `NAMEDATALEN` do Postgres estoura em query relacional aninhada do Drizzle. A resolução de permissões com origem (usuário → anexo → política → statement) tem profundidade suficiente para chegar perto. → Montar a resolução com selects explícitos e merge em TS, não com query relacional aninhada.

## Migration Plan

### Ordem das migrations (timestamps de 14 dígitos, todas aditivas)

1. `is_training` + índice único parcial em `core.units`, `core.kitchen`, `core.mess_halls`.
2. Seed das três entidades de treino, idempotente (`WHERE NOT EXISTS`), resolvendo FKs por consulta.
3. `access_control.policy`, `policy_statement`, `user_policy_attachment` + RLS deny-all + índices de lookup por `user_id` e `policy_id`.
4. Seed da política gerenciada "Conjunto Treino", com escopos resolvidos por `is_training = true`.
5. `core.training_reset_log`.

Depois: regenerar `packages/database/src/generated.ts` pelos scripts do package. **Não** rodar `drizzle pull` fresco — há drift conhecido de nomes contra os hand-patches.

### Ordem de implementação

As duas capabilities de correção de autorização vão **primeiro, em PRs próprios**, antes de qualquer coisa de treino ou de políticas:

1. `local-asset-ownership` — é bug de autorização em produção. PR isolado, o menor possível, para revisão de segurança concentrada.
2. `global-asset-fork` — logo depois, porque é o que dá caminho de saída à cozinha que hoje depende do bug para adaptar receita global.
3. `global-write-hardening` — quebra comportamento existente (`global:1` perde escrita); revisão isolada pelo mesmo motivo.

Só então: resolução compartilhada → tabelas e políticas → escopo treino → reset → console. O escopo treino depende de (1) e (2) estarem prontos: sem eles, um treinando com `kitchen:2` na cozinha de treino altera receita global de toda a FAB — o ambiente de treino seria um vetor, não um sandbox.

### Rollback

- Migrations são aditivas: reverter o código deixa `is_training`, as tabelas de política e o log órfãos mas inertes — a resolução antiga ignora tudo.
- O hardening de guard não é reversível por dado: reverter exige revert de código. É o argumento para ele ir em commit isolado.
- O reset não é reversível. Não há undo — é a razão da confirmação por digitação e do escopo travado por índice único.

### Verificação antes do merge

- `bun run check` verde.
- `bun run test` (turbo, todos os apps) verde — não `bunx vitest run` da raiz, onde o alias `@/` não resolve.
- `SISUB_RUN_INTEGRATION=true bun run test:integration` contra o banco real, incluindo o teste de completude da lista de reset (R2) e o de equivalência de resolução (R5).
- Suítes de rumaer e sucont verdes.

## Decisões tomadas fora do documento

Duas questões abertas na primeira versão deste design foram resolvidas:

- **Receitas do baseline de treino.** O baseline **reusa as receitas globais**. O que tornava isso um problema — o treinando alterar uma receita global de verdade — deixa de existir com `local-asset-ownership` e `global-asset-fork`: o treinando edita, o global fica intacto, a cozinha de treino ganha um fork, e o reset apaga o fork junto com o resto dos dados de treino. A regra é geral e não específica de treino: *nenhum local altera ativo global, nunca*.
- **`global:1` no Conjunto Treino lê todas as telas da SDAB.** Sem restrição de leitura. Isso torna `global-write-hardening` a única barreira entre o treinando e os dados reais de contratação — e é o argumento para o teste de contrato ser exaustivo, não amostral.

## Open Questions

- **Quem é o público do Conjunto Treino?** Se treinandos precisam de `analytics:1` global (visão sistêmica) ou só `local-analytics` da unidade de treino. O seed proposto inclui `analytics:1`.
- **Duração aceitável do reset** antes de virar operação assíncrona (R3). Precisa de medição real após a primeira implementação.
- **Destino dos ativos globais criados pelo caminho errado** (R10): promover a global ou converter em fork. Depende do levantamento, que só pode ser feito contra o banco real.
