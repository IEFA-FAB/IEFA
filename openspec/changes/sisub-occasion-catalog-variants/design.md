## Contexto

Leitura do banco compartilhado em 2026-10-05 (só `select`), depois das duas imagens de organização
mandadas pela SDAB. Estrutura atual, do change #533:

- `kitchen.menu_template` (`template_type` `event` | `apoio`, `kitchen_id` nulo = catálogo global,
  `base_template_id` = de qual modelo a cópia local saiu).
- `kitchen.menu_template_event_meal`: refeições próprias do modelo (nome, horário `meal_type_id`,
  `groups` jsonb `{key,label,minItems?,maxItems?}`, `base_headcount` só no local).
- `kitchen.menu_template_items.event_meal_id`: a refeição de cada preparação.
- `forkTemplate` com `occasionMealIds`: a cozinha adapta escolhendo as refeições
  (`templates.ts:678`, `OccasionMenuForm.tsx:129`).
- `applyEventTemplate` põe TODAS as refeições do modelo no dia (`templates.ts:1411`).

### Estado dos dados

**Eventos globais (ativos)**

| id | Nome | Refeições (itens) |
|---|---|---|
| `a6189831` | Café da Manhã -- Padrão A - Especial/Solene | Café da Manhã Padrão A (24) |
| `728bad9d` | Brunch -- Padrão A - Especial/Solene | — |
| `9be7dd33` | Evento Café da manhã Padrão B - Institucional/Intermediário | Café da Manhã Padrão B (13) · Brunch Padrão B (13) · Almoço Padrão B (7) · Coquetel (0, horário café) · Jantar Padrão B (6) |
| `68936539` | Evento Brunch Padrão B - Institucional/Intermediário | Brunch (15) |
| `fab3640b` | Evento Almoço Padrão B - Institucional/Intermediário | — |
| `869095c8` | Evento Coquetel Padrão B - Institucional/Intermediário | — |
| `cd5c9629` | Evento Jantar Padrão B - Institucional/Intermediário | — |
| `aa466501` | Eventos Padrão C - Simples/Operacional | — |

A descrição de cada um é a lista de eventos indicados do padrão ("Passagem de Comando, Comemoração
Decênio…", "Seminários, Aniversário da OM…", "Reuniões, Marchas, Treinamentos").

**Apoios globais**: 14 modelos, todos com 0 itens e sem classificação de lanche; um só tem refeição
("Kit"). O nome carrega família e classe: "LANCHE DE BORDO - CLASSE A", "KIT REPOUSAR CLASSE B"…

**Uso**: 0 cópias locais desses modelos; 0 `menu_items` com `origin_template_id` de evento ou apoio.
O único evento local é "Dia da Intendência" (cozinha 1, 2 itens, sem modelo de origem).

**Grupos com chave de outra identidade** (a chave ficou do grupo padrão renomeado):

| Refeição | Chave → rótulo |
|---|---|
| Brunch (`68936539`) | `entrada` → Bebidas Quentes · `bebida` → Bebidas Frias · `volante` → Pães · `prato_principal` → Frios e ovos · `sobremesa` → Bolos |
| Brunch Padrão B (`9be7dd33`) | `entrada` → Pães · `sobremesa` → Frios e ovos |
| Café da Manhã Padrão B | `proteina` → Frios e ovos · `complemento` → Bolos |
| Café da Manhã Padrão A | `bolos_e_complementos` → Bolos |

## Decisões

### D1. Modelo global de evento = uma variante = uma refeição

Regra no domínio (`saveTemplateEdit`, `createTemplate`, `createBlankTemplate`, fork PARA o global):
modelo de evento com `kitchen_id` nulo tem no máximo uma refeição
(`DomainError("GLOBAL_EVENT_SINGLE_MEAL")`). Zero é aceito: a pasta pode ter um modelo ainda vazio.

- O evento local continua com N refeições. Ele é o evento real e pode ter coquetel e jantar; é ali
  que o conjunto existe.
- O apoio não ganha a regra. O kit Bordo C é refeição **e** lanche consumidos juntos (Módulo 7), e
  isso é conjunto.
- Sem CHECK no banco: contar refeições por modelo exige trigger em `menu_template_event_meal` olhando
  `menu_template`. Pelo mesmo motivo do #412 (validar no domínio para as tools de MCP terem a mesma
  mensagem), fica no domínio. O MCP passa pelas mesmas operações.

Alternativa descartada: manter o conjunto e corrigir só a aplicação (escolher refeições ao aplicar).
Resolve o sintoma do dia, mas deixa a variante sem identidade própria. Não dá para por "Café Padrão B
opção 2" numa pasta, nem contar quantas cozinhas usam o coquetel B, nem compor café A com almoço B.

### D2. Pastas: tabela editável pela SDAB, não colunas de classificação

```sql
create table kitchen.menu_template_folder (
  id uuid primary key default gen_random_uuid(),
  template_type text not null check (template_type in ('event', 'apoio')),
  parent_id uuid references kitchen.menu_template_folder(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- nome único entre irmãs ativas
create unique index menu_template_folder_sibling_name
  on kitchen.menu_template_folder (template_type, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)))
  where deleted_at is null;
alter table kitchen.menu_template add column folder_id uuid references kitchen.menu_template_folder(id);
-- duas opções na mesma pasta têm nomes diferentes
create unique index menu_template_folder_model_name
  on kitchen.menu_template (folder_id, lower(btrim(name)))
  where folder_id is not null and deleted_at is null;
```

- **Variantes da mesma pasta têm nomes diferentes** (decisão da SDAB, 2026-10-05). O índice garante
  no banco; o domínio recusa antes com mensagem (`TEMPLATE_NAME_TAKEN_IN_FOLDER`). "Duplicar como
  variante" escolhe o primeiro nome livre: "… (cópia)", "… (cópia 2)". Mover para uma pasta que já
  tem o nome também é recusado. Na lixeira não vale: restaurar com o nome tomado devolve o modelo
  como "… (restaurado)", em vez de a restauração falhar.

- Só o catálogo global tem pasta (`folder_id` em modelo local é recusado no domínio; a cópia local
  aparece agrupada pela pasta do modelo de origem, via `base_template_id`).
- Dois níveis (raiz → subpasta), conferidos no domínio: as duas árvores pedidas têm dois níveis, e
  limitar evita o explorador de arquivos. Modelo pode ficar em qualquer nível, e sem pasta aparece em
  "Sem pasta" no fim.
- `sort_order` porque a ordem delas não é alfabética: Café da Manhã, Brunch, Almoço, Coquetel,
  Jantar. A tela permite reordenar irmãs (subir/descer, como `moveEventMeal`).
- Pasta e modelo têm o mesmo `template_type`; mover modelo para pasta de outro tipo é recusado.
- Remover pasta: só vazia (sem subpasta nem modelo ativo). Soft delete, para a lixeira do catálogo.
- Grants: igual às demais tabelas de `kitchen` acessadas pelo servidor (Drizzle/service role). Sem
  SELECT para cliente, fora da publicação Realtime.

Por que tabela e não `event_standard` (A/B/C) + `service_format`: a organização é escolha da SDAB.
Os rótulos ("Padrão B — Institucional/Intermediário"), as descrições, a ordem e as famílias de apoio
(seis, das quais só duas existem no Módulo 7) mudariam por deploy. E a pasta não tem regra a calcular
(não-objetivo herdado do #533).

### D3. Compor o evento local a partir de modelos

Operação nova `composeOccasionMenu` (domínio, `kitchen:2`): `{ kitchenId, templateType: "event",
name, description?, sources: [{ templateId, occasionMealIds? }] (1..MAX_EVENT_MEALS) }`.

- Cada fonte é um modelo global ou local que a cozinha enxerga (`validateTemplateAccess`). Cada
  refeição copiada ganha id novo, os grupos (com contagem), as preparações e a proporção, e grava
  `source_template_id` (coluna nova em `menu_template_event_meal`, FK `on delete set null`).
- Absolutos seguem a regra do #533: de modelo global não vem pax nem efetivo; de cópia local vem.
- Cada fonte pode trazer o horário (`mealTypeId`) de cada refeição copiada: o formato não decide o
  horário (D8). Sem horário informado, vale o sugerido pelo modelo.
- `base_template_id` do evento montado fica nulo, com uma fonte ou várias: a procedência está em
  cada refeição. `base_template_id` continua sendo do "Adaptar" (`forkTemplate`), que é uma cópia por
  linhagem e por cozinha, e que passa a gravar `source_template_id` também.
- Editor do evento local: "Adicionar refeição de um modelo" busca o modelo e acrescenta ao rascunho as
  refeições dele (ids novos, `source_template_id` no rascunho). O autosave grava como hoje, e
  `eventMealsPayload`/`TemplateEventMealSchema` passam a levar `sourceTemplateId`. O servidor confere
  que o modelo existe e é visível para a cozinha; se não for, grava nulo em vez de recusar o
  salvamento inteiro.
- O diálogo "Adaptar" de evento global perde a escolha de refeições (o modelo tem uma). A escolha
  continua ao copiar evento local e no kit de apoio com mais de uma parte.

Copiar e não referenciar: editar o modelo global mudaria em silêncio o que a cozinha compra
(`EDIT-SAFETY.md`, CG-EVT-02). A procedência fica guardada para o selo "modelo atualizado"
(CG-EVT-03) e para contar quantas cozinhas usam cada variante.

### D4. Aplicar direto no dia e anexo quantitativo

- Com o modelo global de uma refeição, "aplicar o café Padrão B" passa a pôr só o café. Compor o
  dia = aplicar cada modelo (já é aditivo e idempotente por origem+receita).
- `ApplyEventTemplateSchema` ganha `slots: [{ occasionMealId, mealTypeId }]` (opcional, como
  `headcounts`): o horário desta aplicação vence o da refeição, sem ser gravado nela. Os diálogos de
  aplicar mostram, por refeição, o horário ao lado do efetivo, já preenchido com o da refeição (D8).
- `DayOccasionDialog` troca o `Select` por combobox (são 15+ eventos e 14 apoios, acima do corte de
  ~25 itens) com o caminho da pasta no rótulo e na busca: "Padrão B › Coquetel › Evento Coquetel…".
- Estimativa e previsão continuam recusando modelo global (#533). A cozinha seleciona os eventos
  locais compostos, cada um com as suas refeições.

### D5. A chave do grupo segue o rótulo

Hoje `resolveGroupKeys` mantém a chave de grupo gravado para não tirar as preparações dele do grupo.
Passa a ser: se a identidade do rótulo (`labelIdentity`) mudou, a chave é recalculada por
`eventGroupKeyFor` (sem colidir com as outras da refeição), e `upsertEventMeal` move as preparações
da chave velha para a nova. Renomear só caixa, acento ou espaço mantém a chave.

Assim, "Frios e ovos" tem a mesma chave (`frios_e_ovos`) em todo modelo, e dois modelos aplicados no
mesmo dia juntam a coluna certa. A migration (D6) recalcula as chaves dos dados atuais pela mesma
regra.

### D6. Reorganização dos dados atuais (migration de dados, por id)

Uma migration só de dados, depois da de estrutura, numa transação, guardada por id: se o id não
existir mais, o passo é pulado e nada falha. Nada é recriado: as refeições trocam de modelo com
`update` (refeição e itens juntos) e mantêm os ids.

1. **Pastas de evento**, nomes e descrições das imagens:
   Padrão A — Especial/Solene ("Eventos solenes e especiais, com maior nível de elaboração e
   apresentação."), Padrão B — Institucional/Intermediário ("Eventos institucionais e
   intermediários, com nível moderado de elaboração."), Padrão C — Simples/Operacional ("Eventos
   operacionais e de menor complexidade, com preparações mais simples."); em cada uma, Café da
   Manhã, Brunch, Almoço, Coquetel e Jantar, nessa ordem ("Cardápios de café da manhã – Padrão A."…).
2. **Pastas de apoio**: Apoio de Reuniões e Palestras (A, B), Apoio Sala VIP (A, B), Kit Repousar
   (A, B), Lanche de Apoio (A, B, C), Lanche de Bordo (A, B, C), Lanche Terrestre (A, B), com as
   descrições da imagem ("Opções de maior elaboração.", "Composições mais elaboradas."…).
3. **Separar o modelo de cinco refeições** (`9be7dd33`):

   | Refeição | Vai para | Pasta |
   |---|---|---|
   | Café da Manhã Padrão B (13) | fica em `9be7dd33` | Padrão B › Café da Manhã |
   | Almoço Padrão B (7) | `fab3640b` (vazio) | Padrão B › Almoço |
   | Coquetel (0) | `869095c8` (vazio) | Padrão B › Coquetel |
   | Jantar Padrão B (6) | `cd5c9629` (vazio) | Padrão B › Jantar |
   | Brunch Padrão B (13) | modelo novo "Brunch Padrão B (cadastro anterior)", **na lixeira** | Padrão B › Brunch |

   O brunch embutido foi substituído pelo modelo próprio `68936539` (15 itens): a SDAB confirmou que
   foi cadastro errado, e o banco mostra a ordem (o `68936539` foi criado em 02/10 às 12:59 e editado
   até 13:32; o brunch embutido foi salvo pela última vez às 13:01). Ele vira modelo na lixeira, não
   some: dá para restaurar como segunda opção, com outro nome.

4. **Arquivar o resto**: `a6189831` → Padrão A › Café da Manhã; `728bad9d` → Padrão A › Brunch;
   `68936539` → Padrão B › Brunch; os 14 apoios → família › classe pelo nome.
   `aa466501` (Eventos Padrão C, vazio, sem refeição) vai para a lixeira do catálogo: o papel dele,
   segurar o Padrão C, virou a pasta. Restaurável pela tela.
5. **Chaves dos grupos** recalculadas pelo rótulo (D5), com o `item_group` dos itens junto.

Nomes de modelo não mudam: limpar "Evento … Padrão B - Institucional/Intermediário", que repete a
pasta, é escolha delas e fica na tela.

### D7. Telas

- **Global (Eventos Modelo, Cardápios de Apoio Modelo)**: tabela em árvore como nas imagens (pasta
  com chevron, subpasta, modelos dentro). Colunas Nome, Descrição, Preparações e Ações. Com
  `global:2`: nova pasta/subpasta, renomear, descrição, reordenar, remover vazia; no modelo, "Mover
  para…" e "Duplicar como variante" (cópia na mesma pasta, nome "… (cópia)"). "Novo evento" dentro de
  uma pasta já nasce nela. A lixeira continua no fim.
- **Editor de evento global**: uma refeição só; o botão "Adicionar refeição" vira "Duplicar como
  variante" com a explicação de que outra opção é outro modelo na pasta.
- **Cozinha → Eventos**: "Modelos da SDAB" mostra a mesma árvore, só leitura, com seleção múltipla e
  "Montar evento" (D3). Os eventos da cozinha seguem em lista plana; a refeição mostra a origem
  ("de Padrão B › Coquetel").
- **Cozinha → Cardápios de Apoio**: "Modelos da SDAB" na mesma árvore, com "Adaptar" em cada modelo
  (um apoio = um kit). Na lista da cozinha, a origem mostra a pasta do modelo de onde a cópia saiu
  ("Lanche de Bordo › Classe A").

## Riscos

- **Migration de dados no banco compartilhado.** Mexe só em modelos globais sem cópia e sem uso. Roda
  numa transação; o guard por id torna a reexecução inofensiva. Antes de aplicar, repetir a leitura
  desta seção: se as nutricionistas mexeram nesses modelos, a tabela de D6 muda.
- **Editor aberto durante a migration.** `saveTemplateEdit` não confere a versão que a tela viu
  (`menu_template` não tem `updated_at`): quem estiver com o `9be7dd33` aberto e o autosave disparar
  depois regrava as cinco refeições por cima da separação. É dívida do `EDIT-SAFETY.md` que vale para
  todo modelo, não só aqui. Nesta entrega, a migration se aplica numa janela combinada com a SDAB, e a
  conferência de versão no save de modelo entra no catálogo de edge cases como LACUNA (CG-EVT-04).
- **Tools de MCP/chat que criam evento global com várias refeições** passam a receber
  `GLOBAL_EVENT_SINGLE_MEAL`. A mensagem diz o que fazer (um modelo por refeição, na pasta).

### D8. Formato de serviço não é horário

Coquetel é um formato (volantes e aquele tipo de comida), não um horário: pode ser servido no
almoço ou à noite (SDAB, 2026-10-05). Vale o mesmo para brunch. Por isso:

- O formato fica na pasta e no nome. Nenhum `meal_type` novo.
- O horário da refeição de um modelo global é **sugestão**. O editor global diz "Horário sugerido".
  A coluna continua obrigatória: o item herda o horário da refeição, e a regra de colocação
  (`placeStoredEventItems`) depende dele.
- Quem decide o horário é a cozinha, ao compor (D3) ou ao aplicar (D4). O campo vem preenchido com a
  sugestão e fica sempre visível ao lado do efetivo, para a escolha não passar batida.
- O Coquetel Padrão B migra com a sugestão "café" que tem hoje. Trocar a sugestão é edição da SDAB
  na tela.

### D9. Lanche de Apoio Classe C é o mesmo que Lanche de Bordo Classe C

Na classe C, a SDAB trata Lanche de Apoio e Lanche de Bordo como sinônimos (2026-10-05). A pasta
"Lanche de Apoio › Classe C" entra na árvore como pedida. Se um modelo dela virar padrão pedível, ele
é classificado como **Bordo C**. O CHECK `menu_template_snack_apoio_class_check`, o schema
(`SnackClassificationSchema`) e a calculadora da norma (apoio só A/B) **não mudam**. Como a pasta não
classifica nada (D2), não há o que reconciliar no banco. O painel de classificação de um modelo
dessa pasta explica: "Classe C de apoio é classificada como Lanche de Bordo C".

## Decisões da SDAB (2026-10-05)

- **Apoio C = Bordo C** → D9.
- **Dois Brunch Padrão B**: um substitui o outro, foi cadastro errado. Duas opções podem existir, mas
  com nomes diferentes → D2 (nome único na pasta) e D6 (o embutido vai para a lixeira).
- **Coquetel não é horário** → D8.

## Perguntas em aberto (não bloqueiam)

- **Q4.** Apoio de Reuniões e Palestras, Sala VIP, Kit Repousar e Lanche Terrestre ficam fora do
  pedido de lanche do Módulo 7 (família só `bordo`/`apoio`). Eles são pedidos pelo mesmo fluxo ou
  aplicados pela cozinha? Até a resposta, são apoios comuns, aplicados pela cozinha.
- **Q5.** A lista de eventos indicados de cada padrão (hoje na descrição dos modelos) deve ir para a
  descrição da pasta? Até a resposta, fica onde está.
