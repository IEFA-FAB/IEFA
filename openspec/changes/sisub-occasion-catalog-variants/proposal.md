## Why

A SDAB mandou como quer ver o catálogo global: **Eventos Modelo** em Padrão (A Especial/Solene,
B Institucional/Intermediário, C Simples/Operacional) → formato de serviço (Café da Manhã, Brunch,
Almoço, Coquetel, Jantar), e **Cardápios de Apoio** em família (Apoio de Reuniões e Palestras, Apoio
Sala VIP, Kit Repousar, Lanche de Apoio, Lanche de Bordo, Lanche Terrestre) → classe (A, B, C). Hoje
a tela é uma lista plana, e a organização foi parar no nome do modelo.

A leitura do banco em 2026-10-05 mostra também um problema de modelagem, não só de tela. O change
`sisub-menu-composition-relative-quantities` (#533) tratou o padrão de evento como **conjunto**: um
modelo "Padrão B" com café, brunch, almoço, coquetel e jantar, do qual a cozinha adapta escolhendo as
refeições (CG-PAD-01). As nutricionistas cadastraram exatamente isso:

| Modelo global (evento) | Refeições | Itens |
|---|---|---|
| Evento Café da manhã Padrão B - Institucional/Intermediário | Café da Manhã Padrão B (13), Brunch Padrão B (13), Almoço Padrão B (7), Coquetel (0, no horário "café"), Jantar Padrão B (6) | 39 |
| Café da Manhã -- Padrão A - Especial/Solene | Café da Manhã Padrão A | 24 |
| Evento Brunch Padrão B | Brunch | 15 |
| Brunch -- Padrão A; Evento Almoço/Coquetel/Jantar Padrão B; Eventos Padrão C | nenhuma | 0 |

Mas o café Padrão B e o almoço Padrão B **não são servidos juntos** no mesmo evento: são variantes
que se excluem, não partes de um todo. O próprio banco mostra que elas já caminhavam para isso: há
modelos vazios "Evento Almoço/Coquetel/Jantar Padrão B" criados ao lado do modelo de cinco
refeições, que guarda o conteúdo deles. Tratar variante como conjunto custa caro:

- **Aplicar o modelo ao dia põe as cinco refeições.** `applyEventTemplate` aplica todas; o evento de
  café da manhã gera também almoço, jantar e dois cafés.
- **Adaptar sem desmarcar leva as cinco**, e a estimativa do anexo quantitativo multiplica as cinco
  pelas ocorrências do mês.
- **A cozinha herda e poda** (escolhe o que tirar do pai) em vez de **compor** o evento que vai
  servir: um evento real com café Padrão A e almoço Padrão B não tem caminho, porque cada padrão é um
  modelo fechado.
- **Grupo renomeado mantém a chave.** Para caber o café da manhã, as nutricionistas renomearam os
  grupos padrão de evento: a chave `sobremesa` virou "Frios e ovos" (Mussarela, Presunto, Ovos
  Mexidos), `entrada` virou "Pães" ou "Bebidas Quentes", `prato_principal` virou "Frios e ovos".
  Itens de dois modelos no mesmo dia se juntam pela chave: a Mussarela cai na coluna de sobremesa do
  outro, e "Frios e ovos" aparece duas vezes com chaves diferentes.

Os 14 cardápios de apoio globais estão vazios (0 itens, nenhum classificado como padrão de lanche),
com a pasta escrita no nome ("LANCHE DE BORDO - CLASSE A"). Nada foi aplicado ao calendário nem
adaptado por cozinha (0 `menu_items` de origem evento/apoio; 0 cópias locais desses modelos).

## What Changes

- **Modelo global de evento é uma variante: uma refeição.** O servidor recusa um segundo horário de
  serviço no modelo global de evento. Outra opção do mesmo formato é outro modelo na mesma pasta
  ("Duplicar como variante"). O evento LOCAL continua com várias refeições: ele é o evento real, que
  pode ter coquetel e jantar.
- **A cozinha compõe em vez de herdar.** "Novo evento a partir de modelos" escolhe um ou mais modelos
  (de pastas diferentes, inclusive: café Padrão A + almoço Padrão B); cada um entra como uma refeição
  do evento local, copiada com grupos e proporções, e a refeição guarda de qual modelo veio
  (`source_template_id`). No editor do evento local, "Adicionar refeição de um modelo" faz o mesmo.
  O "Adaptar → marcar refeições" sai do evento.
- **Pastas do catálogo, organizadas pela SDAB.** Tabela nova `kitchen.menu_template_folder` (dois
  níveis, nome, descrição, ordem, por tipo de modelo), editável com `global:2`. A tela global vira a
  árvore das imagens; a da cozinha mostra a mesma árvore em "Modelos da SDAB" e agrupa os apoios
  adaptados pela pasta do modelo de origem. O seletor de "Aplicar evento ou apoio" mostra o caminho
  ("Padrão B › Coquetel").
- **Chave do grupo segue o rótulo.** Renomear um grupo para um rótulo de outra identidade troca a
  chave e leva as preparações junto. Mesmo rótulo → mesma chave em todos os modelos.
- **Variantes da mesma pasta têm nomes diferentes.** Índice único (pasta, nome) nos modelos ativos.
- **Formato não é horário.** Coquetel e brunch são formatos de serviço; o horário do modelo global é
  sugestão, e a cozinha escolhe o horário de cada refeição ao compor e ao aplicar.
- **Lanche de Apoio C = Lanche de Bordo C.** A pasta entra como pedida; um modelo dela que vire
  padrão pedível é classificado como Bordo C. Classificação e calculadora do Módulo 7 não mudam.
- **Reorganização dos dados atuais** (migration, por id): cria as pastas das imagens; move as
  refeições do modelo de cinco refeições para os modelos vazios que já existem para elas; manda para
  a lixeira o brunch embutido, que o modelo próprio substituiu; põe cada modelo na pasta; troca as
  chaves dos grupos pela do rótulo. Nada é recriado: ids de modelo, refeição e item ficam.

## Capabilities

### New Capabilities
- `menu-occasion-catalog`: pastas do catálogo global; modelo de evento como variante de uma
  refeição; composição do evento local a partir de modelos; procedência da refeição; chave de grupo
  pelo rótulo.

### Modified Capabilities
- `menu-occasion-composition` (do change #533, ainda não arquivado): "Adaptar escolhe as refeições"
  deixa de valer para modelo global de evento, que tem uma refeição só; continua valendo para copiar
  evento local e para o kit de apoio com mais de uma parte.

## Impact

**Apps**: `sisub` (telas globais de Eventos Modelo e Cardápios de Apoio; listas da cozinha; editor de
evento/apoio; diálogos de criar, adaptar e aplicar); `sisub-mcp` (descrições das tools de template).

**Packages**: `@iefa/sisub-domain` (schemas e operações de template e de pasta, `forkTemplate`,
tools de agente), `@iefa/database` (migrations + tipos).

**Banco** (espera o mantenedor): tabela `kitchen.menu_template_folder`; colunas
`menu_template.folder_id` (com índice único de nome por pasta) e
`menu_template_event_meal.source_template_id`; migration de dados da reorganização. A tabela nova não tem `kitchen_id`/`unit_id`/`mess_hall_id`: o guard do reset de
treino não a cobra. Sem função SQL nova, sem grant de cliente.

**LGPD**: nenhum dado pessoal novo.

## Não-objetivos

- **Não** pôr pastas no cardápio semanal. Ninguém pediu, e são 4 modelos.
- **Não** dar à pasta significado de regra. Pasta é organização da SDAB: o sistema não deriva padrão,
  classe nem "eventos indicados" dela. A classificação do padrão de lanche (família/classe do Módulo
  7, que o pedido usa) continua no modelo.
- **Não** referenciar o modelo vivo no evento da cozinha. A composição copia; editar o modelo global
  não muda a compra já planejada de nenhuma cozinha (`EDIT-SAFETY.md`). A procedência guardada abre o
  caminho para o selo "modelo atualizado" (CG-EVT-03), que segue lacuna.
- **Não** criar horário de serviço "brunch" ou "coquetel" em `meal_type`. O formato fica na pasta e no
  nome da refeição; o horário do calendário continua café/almoço/jantar/ceia.
- **Não** limitar o kit de apoio a uma parte: o Bordo C é refeição **e** lanche, consumidos juntos.
  Isso é conjunto de verdade.
- **Não** mudar a classificação do padrão de lanche nem a calculadora do Módulo 7 para aceitar
  "Apoio C": é sinônimo de Bordo C (design D9).
- **Não** limpar nomes de modelo nem trocar o horário sugerido do Coquetel Padrão B: é conteúdo da
  SDAB, editável na tela.
