## Why

Não existe hoje nenhum lugar seguro para treinar operadores no sisub: qualquer exercício de capacitação suja dados reais de unidades, cozinhas e refeitórios em produção, e desfazer exige intervenção manual no banco. Ao mesmo tempo, conceder o perfil necessário para um treinando exige criar 6-8 permissões avulsas à mão em `access_control.user_permissions`, uma por módulo/escopo, sem nome, sem reuso e sem forma de revogar o conjunto de uma vez.

Este change cria um **escopo treino** descartável (uma unidade, uma cozinha, um refeitório sentinela) resetável por botão na SDAB, e substitui a concessão avulsa por um modelo de **políticas nomeadas e anexáveis** no estilo AWS IAM — com o "Conjunto Treino" como primeira política gerenciada: escrita em todos os escopos de treino, leitura na SDAB.

App afetado: **sisub** (único). `packages/pbac` e `packages/sisub-domain` mudam por serem a camada compartilhada de PBAC; `packages/database` recebe migrations.

## What Changes

### Escopo treino

- Nova coluna `is_training boolean not null default false` em `core.units`, `core.kitchen` e `core.mess_halls`, com **índice único parcial** garantindo no máximo uma linha de treino por tabela (a "unidade treino", a "cozinha treino", o "refeitório treino").
- Seed determinístico das três entidades sentinela (código `TREINO`), criadas por migration com IDs resolvidos por `code`, nunca hard-coded.
- Toda listagem de unidade/cozinha/refeitório em produção **exclui** as entidades de treino por padrão; elas aparecem apenas para quem tem permissão em escopo de treino, marcadas visualmente como ambiente de treinamento.
- Banner persistente de "ambiente de treino" em qualquer tela cujo escopo ativo seja de treino.

### Reset

- Operação de domínio `resetTrainingScope()`: apaga, em transação única, todos os dados operacionais pendurados nos três escopos de treino (cardápios, templates, receitas locais, produção, presenças, previsões, listas de compra/ATA, utensílios, step templates) e re-semeia o baseline de demonstração.
- Botão **"Resetar ambiente de treino"** no painel da SDAB (`/global/training`), exigindo `global:2` e confirmação por digitação.
- Tabela de auditoria `core.training_reset_log` (quem, quando, contagem de linhas removidas por tabela, duração).
- A operação é idempotente e chamável por scheduler — mas **nenhum agendamento é criado neste change** (ver Não-objetivos).

### Policy sets (estilo AWS IAM)

- Novas tabelas em `access_control`:
  - `policy` — política nomeada (`name`, `description`, `managed boolean`, soft-delete).
  - `policy_statement` — N statements por política, cada um `(module, level, unit_id | kitchen_id | mess_hall_id)` — mesma forma de um grant atual.
  - `user_policy_attachment` — anexo de política a usuário.
- `user_permissions` **permanece** e continua funcionando: passa a ser a *inline policy* (grant direto), exatamente como na AWS.
- Resolução efetiva = união de (statements das políticas anexadas) ∪ (grants inline), com **deny (level 0) tendo precedência absoluta** sobre qualquer allow de qualquer origem.
- Política gerenciada seeded **"Conjunto Treino"**: `level 2` nos módulos `unit`, `kitchen`, `kitchen-production`, `messhall`, `local-analytics` escopados nas entidades de treino, + `global:1` e `analytics:1` sem escopo. Políticas `managed` não são editáveis nem deletáveis pela UI.

### Console de permissões

- `PermissionsManager` reorganizado em abas no vocabulário AWS: **Usuários** (busca, políticas anexadas, grants inline, permissões efetivas), **Políticas** (CRUD de políticas e statements).
- Anexar/desanexar política a usuário; a origem de cada permissão efetiva é rastreável (qual política a concedeu, ou "inline").

### Ownership de ativo global vs. local — **BREAKING**, corrige falha de autorização

Auditoria feita durante o desenho deste change encontrou um bug de autorização sistêmico. Tabelas que admitem linhas globais (`kitchen_id IS NULL`, propriedade da SDAB) e locais na mesma estrutura usam o padrão `if (kitchenId != null) requireKitchen(ctx, 2, kitchenId) else requirePermission(ctx, "kitchen", 2)`. O ramo `else` autoriza **mutação de ativo global com apenas `kitchen:2`**. Doze ocorrências em `recipes.ts` (2), `templates.ts` (6) e `meal-types.ts` (4).

Consequência concreta e verificada: a rota `/kitchen/$kitchenId/recipes/$recipeId/` aceita qualquer `recipeId`, inclusive de receita global (globais aparecem na listagem da cozinha por desenho). Ela renderiza o formulário em `mode="edit"`, que chama `createRecipeVersion` com `kitchen_id` herdado da receita — nulo. O guard cai no `else` e passa com `kitchen:2`. Como `listRecipes` deduplica por família mantendo a **maior versão**, a nova versão passa a ser a receita canônica **para todas as unidades da FAB**.

Em `meal-types.ts` é pior: `updateMealType`, `deleteMealType` e `restoreMealType` exigem `kitchen:2` **sem escopo algum** e mutam por ID sem resolver o dono da linha — IDOR direto entre cozinhas.

- Mutação de linha global passa a exigir `global:2` em receitas, templates, tipos de refeição, step templates e utensílios.
- Mutação de linha local passa a exigir `kitchen:2` **escopado na cozinha proprietária**, com o dono resolvido do banco, não da entrada.
- Base de versão passa a ser validada como pertencente ao mesmo escopo da versão criada.
- Guard de ownership centralizado — o padrão correto já existe em `authorizeRecipeMutation` (recipes.ts) e no guard de `saveRecipeFlow`; está aplicado de forma inconsistente.

### Fork de ativo global em edição local (copy-on-write)

Fechar o furo acima com um erro deixaria a cozinha sem caminho: hoje ela consegue (indevidamente) adaptar uma receita global à realidade local. O comportamento correto é o de um branch de git — o global fica intacto e a cozinha ganha uma cópia própria.

- Editar ativo global a partir de contexto de cozinha cria **fork local** referenciando o global como base; o global não é tocado.
- Ingredientes e fluxo de produção são copiados para o fork com referências remapeadas.
- Um fork por cozinha por linhagem — edições seguintes versionam o fork existente.
- Na visão da cozinha, o fork **sombreia** o global, sem depender de comparação de número de versão (a comparação atual empata de forma não-determinística quando fork e global têm a mesma versão).
- Fork vs. versão global é decidido pelo **contexto explícito** da edição, nunca inferido das permissões do usuário.

A infraestrutura já existe: `base_recipe_id` em `recipes`, `base_template_id` em `menu_template`, a rota `/kitchen/$kitchenId/recipes/$recipeId/fork` com `mode="fork"` e `copyRecipeFlow`. Falta acionar como copy-on-write no caminho de edição.

### Hardening de escrita global — **BREAKING**

- Toda mutação de dado global da SDAB (catálogo de insumos, receitas globais, `policy_rule`, places, disparo de syncs, administração de permissões) passa a exigir `global:2`. Hoje várias exigem apenas `requireAuth()`, o que torna `global:1` indistinguível de `global:2` na prática.
- **BREAKING**: usuários que hoje possuem `global:1` e escrevem em caminhos globais perdem essa capacidade. É exatamente o comportamento pedido ("pode clicar em tudo na SDAB mas não pode alterar nada"), mas é uma quebra de comportamento observável para grants existentes.
- Teste de contrato exaustivo enumerando todo write global e o guard exigido, no padrão já usado em `apps/sisub/src/server/security-contracts.test.ts`.

## Capabilities

### New Capabilities

- `local-asset-ownership`: mutação de ativo global exige `global:2`; mutação de ativo local exige `kitchen:2` escopado no dono resolvido do banco; base de versão validada; guard centralizado.
- `global-asset-fork`: fork copy-on-write de ativo global em edição a partir de contexto local, com linhagem rastreável, um fork por cozinha por linhagem e precedência do fork sobre o global na visão da cozinha.
- `training-scope`: entidades sentinela de treino (unidade, cozinha, refeitório), marcação `is_training`, unicidade, isolamento das listagens de produção e sinalização visual.
- `training-scope-reset`: reset manual transacional e idempotente do ambiente de treino, seed do baseline de demonstração, auditoria e gate `global:2`.
- `access-policy-sets`: políticas nomeadas com statements, anexo a usuários, políticas gerenciadas e resolução de permissão efetiva com precedência de deny.
- `permissions-console`: console de gestão de acesso da SDAB com abas de usuários e políticas, anexo/desanexo e rastreabilidade da origem de cada permissão efetiva.
- `global-write-hardening`: `global:1` como leitura estrita — todo write global exige `global:2`, verificado por teste de contrato.

### Modified Capabilities

Nenhuma. `openspec/specs/` ainda não existe no repo — não há spec publicada cujos requisitos mudem.

## Impact

### Banco (`packages/database`)

- Migrations aditivas (timestamps de 14 dígitos, conforme convenção):
  - `is_training` + índice único parcial em `core.units`, `core.kitchen`, `core.mess_halls`.
  - Seed das três entidades de treino.
  - `access_control.policy`, `access_control.policy_statement`, `access_control.user_policy_attachment` + RLS deny-all (acesso só via service role).
  - Seed da política gerenciada "Conjunto Treino".
  - `core.training_reset_log`.
- `packages/database/src/generated.ts` regenerado.

### PBAC compartilhado (`packages/pbac`)

- `resolve-permissions.ts` passa a unir políticas anexadas + grants inline. **Consumido também por rumaer e sucont** — a mudança precisa ser retrocompatível: sem políticas anexadas, o resultado é byte-a-byte o de hoje.
- `has-permission.ts` ganha precedência de deny (hoje o deny é apenas removido da lista pelo resolver, o que não permite deny sobrepor allow de outra origem).

### Domínio (`packages/sisub-domain`)

- Novo `operations/policies.ts` (CRUD de política/statement/anexo) e `operations/training.ts` (reset + seed).
- `operations/permissions.ts` estendido para expor permissões efetivas com origem.
- Guards `global:2` adicionados nas ops de escrita global.

### App (`apps/sisub`)

- `src/server/policies.fn.ts`, `src/server/training.fn.ts`.
- `RecipeForm.tsx`: o ramo `mode === "edit"` passa a declarar o contexto da edição em vez de herdar `kitchen_id` do dado carregado; rota de edição de cozinha passa a forkar ao abrir ativo global.
- `src/routes/_protected/_modules/global/training.tsx`, reorganização de `global/permissions.tsx`.
- `PermissionsManager.tsx` reescrito em abas + novos componentes de política.
- Guards adicionados em `ingredients.fn.ts`, `recipes.fn.ts`, `policy.fn.ts`, `places.fn.ts`, `compras-sync.fn.ts`, `nutrition-sync.fn.ts`.

### Riscos

- O ownership de ativo global corrige uma falha em produção — mas há dados já criados pelo caminho errado. Antes do deploy é preciso levantar quais receitas e templates globais têm versões criadas por usuários sem `global:2`, porque essas linhas são edições locais que hoje valem para toda a FAB. Decidir caso a caso: promover a global (a SDAB endossa) ou converter em fork da cozinha que criou.
- O hardening de guard é a parte mais arriscada: um guard a mais no caminho errado quebra escrita legítima de cozinha (o catálogo de insumos é lido/editado por `kitchen` também — daí existir `requireAnyPermission`). Cada guard adicionado precisa checar se o caminho é exclusivo da SDAB ou compartilhado.
- O reset apaga dados por FK cascade em ~20 tabelas. Um `is_training` marcado por engano em unidade real seria destrutivo — daí o índice único parcial, a exigência de `code = 'TREINO'` e a confirmação por digitação.

## Não-objetivos

- **Estoque treino.** O módulo `storage` não está na `main`: tabelas e telas vivem nos PRs empilhados #117–#123 (fases 1-7 do ciclo de estoque). O escopo treino de estoque entra em change posterior, depois do merge do trem. `is_training` na cozinha já é o gancho suficiente para isso.
- **Reset automático semanal.** Não há infra de cron no repo (nenhum `pg_cron` nas migrations; os syncs são disparados por botão). `resetTrainingScope()` é escrita idempotente e sem dependência de request justamente para que um agendamento futuro seja plugável, mas nenhum scheduler é criado aqui.
- **Múltiplos ambientes de treino.** Um de cada, garantido por índice único parcial. Turmas simultâneas compartilham o mesmo ambiente.
- **Policy sets aninhados** (política que agrupa políticas). Uma política já é o conjunto de statements — mesmo modelo da AWS. Anexar N políticas a um usuário cobre o caso de uso sem um terceiro nível de indireção.
- **Políticas anexadas a grupos/roles.** Anexo é usuário→política apenas. Grupos podem vir depois sem migração de dados.
- **Condições/ABAC** (`Condition` da AWS, negação por tag, janela de horário). Statements são `(module, level, escopo)`, nada mais.
- **Estender o modelo a rumaer/sucont.** Eles compartilham `user_permissions` e continuam funcionando por grants inline. O console de políticas é do sisub.
