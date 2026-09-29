## Contexto

Revisão dos três regimes de `kitchen.menu_template` feita em 2026-09-29, com a fonte normativa do
Módulo 7 (Lanches de Bordo e de Apoio, SDAB) e os padrões de evento A/B/C da SDAB.

### Como está hoje

| | Semanal (`weekly`) | Evento (`event`) | Apoio (`apoio`) |
|---|---|---|---|
| Estrutura | Grade 7 dias × tipo de refeição da cozinha | Refeições próprias (`menu_template_event_meal`: nome, horário, `groups` jsonb, `base_headcount`) | Lista plana por tipo de refeição, `day_of_week = 1` fixo (`OCCASION_DAY`) |
| Grupos | Do conjunto do tipo de refeição (`meal_type.group_set_id`) | Da própria refeição (jsonb `{key,label}`) | Não gravados (o editor não envia `item_group`) |
| Efetivo | `menu_template_meal.base_headcount` por (dia, refeição) | `event_meal.base_headcount` | Não existe; só pax por item |
| Quantidade por item | pax (`headcount_override`) ou % | pax ou % | pax; no padrão de lanche, `headcount_override` = porções por kit |
| Ocorrências | — | — | `expected_monthly_occurrences` (kits/mês no padrão) |
| Chega ao calendário | `applyTemplate` (substitui ou pula) | `applyEventTemplate` (aditivo) | idem evento; padrão só por pedido aceito |

### O que a revisão achou

**Estrutura**
- E1. O apoio não tem como separar refeição e lanche no mesmo kit (Bordo C, Apoio > 8 h) nem
  marcar componentes, que é como a norma descreve o kit.
- E2. `snack_variant` (`lanche | refeicao`) é um valor só por padrão; o Bordo C tem os dois.
- E3. Nenhum regime guarda "quantas preparações por grupo". Os padrões de evento A/B/C são
  descritos assim.
- E4. `day_of_week = 1` em evento e apoio entra na média de dias úteis de `summarizeTemplateDemand`
  (`templates.ts:150`), que conta dias 1–4.
- E5. A spec `menu-exception-flow` diz que não existe apoio global; a produção tem 11 e as rotas
  `global/support-menus/*` existem.

**Quantidade (global × local)**
- Q1. Só o editor global do semanal esconde pax (`allowHeadcount={false}`). Os editores globais de
  evento e apoio mostram pax, efetivo da refeição e ocorrências (`OccasionMenuEditor`,
  `EventMealDialog`, `OccasionMenuForm.tsx:208`).
- Q2. Servidor e banco aceitam qualquer absoluto em linha global. O MCP também
  (`apps/sisub-mcp/src/tools/templates.ts`).
- Q3. O save do semanal global manda os itens sem `headcount_override` e sem `meals`: apaga pax
  gravado por outro caminho (MCP) e deixa um `base_headcount` invisível que a cópia leva.
- Q4. `applyTemplate` com semanal global: `forecasted_headcount` nulo e todas as porções nulas;
  `fetchProcurementNeeds` conta `planned ?? 0`.
- Q5. Informar o efetivo do dia depois não recalcula: `updateHeadcount` só reescala quando
  `oldHeadcount != null` (`planning.ts:401`).
- Q6. `applyEventTemplate` e `applyTemplate` não recebem efetivo (`ApplyTemplateSchema`,
  `ApplyEventTemplateSchema`).
- Q7. `forkTemplate` copia pax, efetivo e ocorrências do global (`templates.ts:645-685`), e a tela
  anuncia isso ("A cópia leva … o efetivo de cada uma").
- Q8. `resolveItemDemand`: o pax herdado ganha do efetivo local e do %, sem aviso.
- Q9. A estimativa descarta em silêncio a preparação sem efetivo (`quantity-estimate.ts:337`,
  `if (!headcount) continue`).
- Q10. A estimativa e a previsão aceitam modelo global no servidor (a tela filtra).
- Q11. No apoio, % não tem base e vira nulo, ou seja, é ignorado.
- Q12. `agentGetTemplateItems` não devolve o efetivo da refeição: o modelo não vê a demanda real.
- Q13. A conferência de desatualização da estimativa olha `created_at` de itens e refeições;
  mudar só o efetivo da refeição de evento (update in-place) não é detectado.

Q13 fica fora desta entrega (tarefa própria, registrada em GU-ANX-01). O resto entra.

## Decisões

### D1 — Apoio usa as refeições próprias do evento

Em vez de uma estrutura nova para o apoio, `menu_template_event_meal` passa a valer também para
`template_type = 'apoio'`. A validação que hoje é só de evento (`resolveEventContent`,
`template-event-meals.ts:118`) vale para os dois: todo item de evento ou apoio pertence a uma
refeição. O banco não restringe a tabela a evento, então não há DDL para isso.

- **Apoio simples:** nasce com uma refeição "Kit", horário escolhido pela cozinha, sem grupos
  obrigatórios. Hoje `TemplateEventMealSchema.groups` exige no mínimo 1; passa a aceitar 0 no apoio
  (refeição sem coluna mostra a lista de preparações direto). No evento o mínimo continua 1.
- **Padrão de lanche:** o horário de toda refeição é o tipo de sistema "Lanches de Bordo/Apoio"
  (`system_key = 'snack_request'`), fixado pelo servidor. A produção do pedido aceito continua indo
  para esse horário, uma linha por (padrão × preparação), agora somando as refeições do kit.
- **Grupos sugeridos para padrão** (editáveis, não regra): refeição "Lanche" com Sanduíche, Bebida,
  Complemento; refeição "Refeição" com Carboidrato, Proteína, Legume, Leguminosa, Sobremesa, Bebida.
- **`snack_variant`** continua como está. Ele não descreve a estrutura; diz qual equipamento o
  padrão exige (R-V1/R-V2) e é por ele que a calculadora casa sugestão com padrão. Um Bordo C com
  refeição e lanche é `refeicao` (exige copa).
- **Semanal fora:** a rotina é uniforme e os grupos por tipo de refeição já são configuráveis por
  cozinha. Trocar a grade seria custo sem ganho.

### D2 — O nome da tabela fica

`menu_template_event_meal` passa a guardar refeições de apoio. Renomear exige expand/contract com
view de compatibilidade (como o lote 5 da linguagem ubíqua) e toca todo o domínio. No código, o tipo
e as funções ganham o nome neutro (`OccasionMeal`, `resolveOccasionContent`) com o antigo como alias
deprecado; o comentário da tabela é atualizado. A renomeação física fica para um lote da linguagem
ubíqua.

### D3 — Quantidade de preparações por grupo

`groups` (jsonb) aceita `minItems` e `maxItems` opcionais por grupo: `{key, label, minItems?,
maxItems?}`, inteiros de 0 a 50, `minItems ≤ maxItems`. "Dois sucos" = 2/2; "seis a oito salgados"
= 6/8; "um ou dois" = 1/2; sem número = nada. A validação é do domínio (Zod); o banco só guarda.

- O editor mostra "2 de 2" no cabeçalho do grupo e um aviso quando a contagem fica fora. Salvar e
  aplicar **nunca** são bloqueados: a cozinha pode ter faltado um item, e execução não trava.
- Contagem é quantidade relativa (composição), então vale em modelo global. É o que faz um padrão
  A/B/C da SDAB ser um modelo global de evento só com refeições e grupos, sem preparação nenhuma, que
  a cozinha adapta e preenche.
- O semanal não ganha contagem nesta entrega: os grupos dele vêm de `menu_group`, compartilhado
  entre modelos.

### D4 — Global relativo, local absoluto: o que é cada campo

| Campo | Tipo | Global | Local |
|---|---|---|---|
| `menu_template_items.recommended_proportion` | Relativo | sim | sim |
| `groups[].minItems/maxItems` | Relativo | sim | sim |
| `menu_template_items.headcount_override` (pax) | Absoluto | **não** | sim |
| `menu_template_meal` (efetivo por dia e refeição) | Absoluto | **não** (nenhuma linha) | sim |
| `menu_template_event_meal.base_headcount` | Absoluto | **não** | sim |
| `menu_template.expected_monthly_occurrences` | Absoluto | **não** | sim |
| `recipes.portion_yield`, ficha técnica | Atributo da preparação | fora desta regra | — |

A regra vale em três camadas, porque cada uma tem um caminho de escrita próprio:

1. **Banco:** CHECK em `menu_template` (`kitchen_id is not null or expected_monthly_occurrences is
   null`) e gatilhos `before insert or update` em `menu_template_items`, `menu_template_meal` e
   `menu_template_event_meal` que leem o `kitchen_id` do modelo e recusam absoluto com
   `23514` e mensagem `GLOBAL_TEMPLATE_ABSOLUTE_QUANTITY`. Função com `set search_path = ''`,
   executável só pelo dono (é gatilho).
2. **Domínio:** `assertRelativeOnlyForGlobal` em `createTemplate`, `createBlankTemplate` e em toda
   gravação de conteúdo (`applyTemplateContent`, que serve à edição in-place e ao fork), com
   `DomainError("GLOBAL_TEMPLATE_ABSOLUTE_QUANTITY")` e mensagem que diz o que a cozinha preenche. Vem
   antes do banco para a mensagem ser legível na tela e na tool. A restauração não confere: a
   migration limpa o que havia e os gatilhos impedem gravar de novo.
3. **Tela:** os editores globais de evento e apoio escondem pax, efetivo e ocorrências, como o
   semanal global já faz.

O único dado que viola a regra hoje é um item com pax num modelo global **excluído**. A migration
limpa o pax dele (o `restoreTemplate` o traria de volta).

### D5 — Um campo relativo só: `recommended_proportion`

Porção por pessoa e "% do efetivo" são a mesma conta: 30% de 800 = 240 porções = 0,3 porção por
pessoa. Porções por kit também: 2 sanduíches por kit = 200%. Então:

- O padrão de lanche deixa de usar `headcount_override` como porções por kit. A migration move
  `headcount_override × 100` para `recommended_proportion` nos itens de padrão (0 linhas em produção
  hoje; a migration é genérica para treino e branches).
- A tela do apoio mostra o campo como "porções por kit" (valor ÷ 100, aceitando decimal: meia
  garrafa de café por kit = 0,5). Evento e semanal continuam mostrando "%".
- O teto do CHECK sobe de 300 para 1000 (10 porções por kit). O Zod mantém 300 em semanal e evento
  e aceita até 1000 no apoio.
- Os totais por preparação arredondam **para cima** (100 kits × 0,5 = 50; 3 kits × 0,5 = 2). Faltar
  porção custa mais que sobrar meia. `resolveItemDemand` ganha o parâmetro de arredondamento; o
  semanal e o evento continuam com `Math.round`, para não mudar número de anexo já montado.
- `snack-kit.ts` (`SnackStandardSnapshot.portions`) e `addToProduction` passam a ler o relativo.
  Pedidos existentes: 0, então não há snapshot a converter.

### D6 — O efetivo entra na aplicação

`ApplyTemplateSchema` e `ApplyEventTemplateSchema` ganham `headcounts` opcional:

- semanal: `[{ mealTypeId, headcount | null }]`, o mesmo número para todos os dias aplicados
  (o dia a dia fina se ajusta no "Quantitativo do dia");
- evento e apoio: `[{ occasionMealId, headcount | null }]` (kits, no apoio).

Regras:
- O diálogo vem preenchido com o efetivo do modelo local (semanal: por dia e refeição, sem precisar
  mexer; "usar o efetivo do cardápio" é o default). No global vem vazio.
- `headcount` informado vence o do modelo para aquela aplicação. Não grava de volta no modelo.
- Vazio é aceito: o dia recebe `forecasted_headcount = null` e aparece com a pendência "efetivo a
  definir" no calendário e no fluxo da cozinha. É pendência, não recusa.
- O pax do item local (absoluto) continua vencendo, como hoje.

### D7 — Efetivo informado depois recalcula

`updateHeadcount` (`planning.ts`) passa a tratar `oldHeadcount = null`: toda preparação do dia com
`planned_portion_quantity` nulo recebe `resolveItemDemand(novo efetivo, %)`. Porção já preenchida
(digitada à mão ou vinda de pax) fica como está, a mesma regra do `rescaledPortions` usado quando o
efetivo muda (GC-AGD-13).

Exceção: item que veio de evento ou apoio (`origin_template_type`) fica sem porção. Ele entra somado
ao cardápio da rotina daquele horário, mas mede pela refeição do evento ou pelos kits do apoio; o
efetivo da rotina não é a base dele. A porção dele se informa no item ou reaplicando com o efetivo.

### D8 — Adaptar um modelo global

`forkTemplate` e o fork de `saveTemplateEdit`:
- **Origem global:** copiam preparações, grupos (com contagem), %, refeições (nome, horário,
  grupos). **Não** copiam pax, efetivo nem ocorrências (ficam nulos, e o global já não os tem pela
  D4; a regra na cópia protege contra linha antiga).
- **Origem local** (copiar um cardápio da própria cozinha ou de outra): copiam tudo, como hoje.
- `ForkTemplateSchema` ganha `occasionMealIds?: uuid[]` (evento e apoio): só as refeições escolhidas
  vêm, com os itens delas. Ausente = todas. O diálogo "Adaptar" lista as refeições do modelo com
  caixa de seleção, todas marcadas.
- O texto da tela passa a dizer: "A cópia leva as preparações, os grupos e as proporções. O efetivo
  e as ocorrências por mês você define aqui."

### D9 — Sem efetivo é pendência visível

- A estimativa continua sem contar a preparação sem efetivo (zero é zero), mas isso deixa de ser
  silencioso na origem: a cozinha vê o aviso antes de enviar a previsão. Um campo
  `missingHeadcount` no retorno da estimativa mudaria o contrato de todos os consumidores de
  `ProcurementNeed[]`; o aviso no fluxo da cozinha cobre o caso sem isso.
- `procurement-flows` ganha o aviso "cardápio sem efetivo" ao lado de "apoio sem ocorrências
  mensais": semanal com refeição sem efetivo, evento ou apoio com refeição sem efetivo e sem pax nos
  itens.
- Estimativa e previsão recusam modelo global no servidor (`GLOBAL_TEMPLATE_NEEDS_ADAPTATION`), com
  a mensagem "Adapte o modelo para a cozinha e informe o efetivo". A tela já não os oferece.

### D10 — Tools de IA e MCP

Pelas regras de `.claude/rules/ai-tools.md`: o contrato das tools de template continua o mesmo
schema do domínio, então a recusa em global chega à tool sem código novo; muda a descrição
(`create_template`, `update_template`, `apply_template`, `apply_event_template`) para dizer que
global só aceita relativo e que aplicar aceita `headcounts`. `agentGetTemplateItems` passa a devolver
o efetivo da refeição (`meal_headcount`, Q12). A contagem por grupo já vem em `get_template`
(`event_meals[].groups`). A tool de chat `apply_template` aceita `headcounts`.

## Migration (espera o mantenedor)

Uma migration, `kitchen_menu_relative_quantities`:

1. Limpa pax, efetivo e ocorrências de modelos globais (hoje: 1 item de modelo excluído).
2. CHECK de ocorrências em `menu_template` e os três gatilhos da D4.
3. `recommended_proportion` com teto 1000.
4. Backfill do apoio: uma refeição por (modelo de apoio, tipo de refeição dos itens), com nome do
   tipo de refeição, grupos vazios e `event_meal_id` nos itens. Mesmo desenho do backfill do evento
   em `20260925120000`. Hoje: 0 itens de apoio.
5. Padrões de lanche: `recommended_proportion = headcount_override × 100`, `headcount_override =
   null`. Hoje: 0 padrões.
6. Comentários de `menu_template_event_meal` e de `recommended_proportion` com a semântica nova.

Nenhuma tabela nova: o guard de reset de treino não muda. Ordem de rollout: declara (nada a
declarar) → aplica → mergeia o código. O código novo aceita o banco antigo (os gatilhos só recusam o
que o domínio novo já não manda), então aplicar antes do merge não quebra a `main`.

## Riscos

- **Número de anexo mudar:** não muda para semanal e evento (mesmo arredondamento). Muda para
  padrão de lanche (arredonda para cima), e não há padrão cadastrado.
- **MCP/tool mandando pax em global:** passa a ser recusado com mensagem. É o comportamento
  desejado; a descrição das tools avisa antes.
- **Aplicar semanal global sem efetivo:** passa de "porções nulas escondidas" para "pendência
  visível". Quem aplicava assim vai ver aviso novo; é o objetivo.

## Edge cases (catálogo)

Entram ou mudam no catálogo (`.claude/skills/edge-cases/modules/`):

- `catalogo-global.md`
  - CG-EVT-01 muda: a cópia chega com refeições, grupos e %, **sem** efetivo; a cozinha escolhe as
    refeições que leva.
  - CG-QTD-01 (novo) "A SDAB pôs efetivo num modelo global": recusado, com a mensagem.
  - CG-PAD-01 (novo) "A cozinha adapta o Padrão B só para um coquetel": leva só a refeição Coquetel,
    com "Salgados 4 a 6" e o aviso quando põe 3.
- `gestao-cozinha.md`
  - GC-AGD-15 (novo) "Apliquei o semanal da SDAB e não sei o efetivo ainda": dia com pendência;
    efetivo informado depois calcula as porções.
  - GC-AGD-01 muda: o diálogo pede os kits do apoio.
  - GC-PRV-05 (novo) "Cardápio sem efetivo no envio da previsão": aviso antes do envio.
- `pedidos-de-lanche.md`
  - PL-PAD-01 (novo) "Bordo C com refeição e lanche no mesmo kit": duas refeições no padrão, uma
    linha de pedido, produção somando as duas.
