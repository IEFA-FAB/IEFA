## Context

- Projeto 001/IEFA/2025, frente Provisões. Responsável técnico: Cap Hoffmann. A documentação de planejamento (detalhamento, análise do legado, requisitos, cronograma, folha de decisão) fica fora do repositório, por regra do projeto: só documentação de sistema entra aqui.
- O legado fab-provisao (repositório privado `IEFA-FAB/SIA`, pasta `Provisao/`) nunca entrou em produção e não está no ar. Ele serve de fonte de requisitos (78 entidades, regras das OS 14 a 16, matriz de perfis, modelos de relatório), não de decisão: onde o desenho dele contraria o que este change decide, vale este change.
- **Decisão de 13/10/2026 (mantenedor): o SISPROV é o dono de todo e qualquer estoque.** O sisub tem estoque; esse estoque passa a ser uma classe (alimentação) do estoque do SISPROV. No fundo é um sistema só; para o usuário, cada um vê o recorte do seu domínio (quem é da cozinha só vê alimentação). O estoque vive no schema `inventory`.
- Estado do estoque em 13/10/2026, conferido no banco compartilhado:
  - O ledger só conhece alimentação: todo item é `ingredient_id` XOR `frozen_preparation_id` (`kitchen.*`), todo local é `kitchen_id`, e `procurement.supply_order` é por cozinha.
  - `core.item` existe (4,6 mil itens, `alimentacao` e `auxiliar`). `kitchen.ingredient` já é subtipo dele com a mesma PK, mas o ledger não o referencia.
  - O ledger está **vazio em produção**: nenhum movimento, lote, recebimento, fechamento ou OF, porque o piloto está travado. Há 30 cozinhas, todas com OM, e 9 grants `storage` (8 globais, 1 por cozinha).
  - Generalizar agora custa só DDL e código. Depois do piloto, custaria migração de dados contábeis com fechamento mensal travado.
- Trilho de app novo percorrido por rumaer, sucont e contrate: app → tipos → `AppModule` → wrapper PBAC → manifesto → Terraform. `apps/rumaer` é o template estrutural; `apps/sucont` é o precedente de design do sisub com contrato próprio.

## Goals / Non-Goals

**Goals:**
- registrar como código e spec que o SISPROV é dono do estoque de toda classe;
- generalizar o ledger para qualquer item (`core.item`) em qualquer local de estoque (`inventory.stock_location`), com a alimentação do sisub como a primeira classe, sem mudar a tela da cozinha;
- criar a fundação do app (login, hub, módulos, concessão auditada, deploy, cobertura legal);
- fixar o lugar do item de fardamento e o glossário antes da primeira tabela de catálogo.

**Non-Goals:** ver `proposal.md`.

## Decisions

### D1. O SISPROV é o sistema de provisões, dono de toda classe de estoque

O SISPROV não é "o sistema do fardamento". É o dono do estoque, de qualquer classe, e da cadeia necessidade líquida → ordem de fornecimento → recebimento → saldo. As regras e os dados do estoque são dele; cada app mostra uma lente:

| Camada | Dono | Onde |
| --- | --- | --- |
| Estoque (local, lote, movimento, saldo, custo médio, contagem, ajuste, fechamento mensal) | SISPROV | schema `inventory`; código em `@iefa/sisprov-domain/inventory` |
| Identidade do item | núcleo | `core.item` |
| Classe de suprimento do item | núcleo | `core.item.catalog_scope` (D4) |
| Perfil de cada classe (o que só faz sentido nela) | domínio da classe | alimentação: `kitchen.ingredient`, `kitchen.frozen_preparation`; fardamento: schema próprio, no change do catálogo (D13) |
| Necessidade bruta | domínio da classe | alimentação: cardápio → MRP do sisub; fardamento: previsão de incorporação × enxoval × curva |
| Ordem de fornecimento | SISPROV | `procurement.supply_order`, por local de estoque (D16) |

O fardamento é a primeira classe NOVA; a alimentação é a classe que já existe e continua operada pela tela do sisub.

Descartado: estoque próprio do SISPROV ao lado do do sisub (dois ledgers, dois custos médios, dois fechamentos para a mesma OM) e estoque do sisub como dono com o fardamento "pendurado" nele (o ledger continuaria com chave de cozinha e ingrediente, e o fardamento não tem nenhum dos dois).

Também descartado, do legado: reconstruir o depósito, o almoxarifado e a distribuição como módulos à parte do estoque. No ledger único, depósito e almoxarifado são locais (D11) e distribuir é saída do ledger (D6).

### D2. Design system do sisub com contrato próprio

O SISPROV é operação de almoxarifado e gestão, a mesma natureza do sisub. Adota tokens, tipografia de sete níveis, primitivos (`field.tsx`, `item.tsx`, `button`, `card`) e as regras do `STYLE_CONTRACT.md` do sisub, copiados para o app (o monorepo não tem package de UI compartilhado). Copia só os primitivos que as telas usam; o resto vem com a tela que precisar (o gate de arquivo morto do `pr-check` reprova componente sem import). O contrato próprio (`apps/sisprov/STYLE_CONTRACT.md`) registra só as diferenças: sem módulos por cozinha, sem ambiente de cozinha, casca por sidebar.

### D3. Permissão: `storage` é o módulo de estoque do SISPROV

O estoque tem UM módulo, `storage`, para toda classe. Ele já existe (sisub, 9 grants) e muda de dono, não de nome: renomear exigiria migrar grants por função auditada sem ganho para quem usa.

| Módulo | Papel | Níveis | Escopo |
| --- | --- | --- | --- |
| `storage` | Estoque: receber, armazenar, distribuir, contar, ajustar | 1 consulta, 2 operação, 3 gestão (aprova ajuste e contagem, configura o local) | `kitchen` (o local da cozinha), `unit` (todos os locais da OM e das apoiadas), global |
| `sisprov-planning` | Elo na OM: previsão de incorporação e adesão da coleta de tamanhos | 1 consulta, 2 informar e ajustar | `unit`, com cobertura pela hierarquia de apoio; global para a SDAB |
| `sisprov-admin` | SDAB: enxovais, curvas, períodos, aprovação de OF, locais de estoque, grants do SISPROV | 2 gestão sistêmica, 3 gerenciar grants | global; escopável por OM quando a gestão for delegada |

Um grant `storage` vale para um local quando é global, quando é da cozinha do local (`stock_location.kitchen_id`), ou quando é de uma OM que cobre a OM do local pela hierarquia de apoio. O deny (nível 0) na cadeia vence, como em `resolveModuleUnitCoverage`. A classe que o usuário vê não é eixo da permissão: sai do que o local guarda (D14). Quem opera a cozinha tem `storage` na cozinha e vê alimentação; quem opera o almoxarifado da OM tem `storage` na OM e vê o que esse almoxarifado guarda.

O `sisprov-supply` do primeiro desenho sai: seria um segundo módulo de estoque para a mesma tabela, com um almoxarife da OM e um da cozinha governados por regras diferentes sobre o mesmo saldo.

A tela de acessos do SISPROV concede `storage` por OM (ou global), além de `sisprov-planning` e `sisprov-admin`. A do sisub continua concedendo `storage` por cozinha. As duas usam `changeModulePermission`, com o log na mesma transação.

O militar que preenche a própria ficha de tamanhos ou confirma o próprio recebimento não tem módulo: é sessão autenticada, como o `diner` do sisub.

### D4. Item estocável é `core.item`; a classe é `catalog_scope`

Todo item estocável é uma linha de `core.item`, e o ledger o referencia por `item_id`. O perfil da classe usa a MESMA PK (subtipo com PK compartilhada, técnica de `20260901120000_core_item_nucleus.sql`):

- `kitchen.ingredient` já é subtipo: `ingredient_id` vira `item_id` sem mudar valor nenhum.
- `kitchen.frozen_preparation` vira subtipo nesta migration (`frozen_preparation_is_item`, trigger de sincronia como o do ingrediente, `kind = 'insumo'`, `catalog_scope = 'alimentacao'`). Assim o XOR ingrediente/preparação some do ledger: o que distingue os dois é o perfil, não a coluna.
- O item de fardamento é `core.item` com `kind = 'material'` e `catalog_scope = 'fardamento'`, valor novo do CHECK nesta migration. O primeiro desenho deixava o `catalog_scope` em aberto; ele é o eixo da classe, então se decide agora. Fardamento é consumo distribuído, não `permanente`.

`catalog_scope` mantém o nome (já é usado por catálogo e compras) e passa a ser documentado como classe de suprimento. Classe nova entra no CHECK com a migration que a cria.

### D5. Reset de treino segue o local

As tabelas do `inventory` deixam de ter `kitchen_id`; passam a ter `location_id`. O guard default-deny de `training.operations.test.ts` passa a varrer também `location_id`, e o reset de treino apaga o estoque pelos locais da cozinha e da OM de treino (`stock_location.kitchen_id`/`unit_id`). `inventory.stock_location` entra em `RESET_EXCLUSIONS`: é estrutura, como a própria cozinha, não dado de treino.

Toda tabela nova de classe com `unit_id` ou `location_id` entra no guard no PR que a cria.

### D6. Glossário antes da tabela

O lote `sisprov-glossary` fixa identificador, nome no banco e rótulo de cada conceito antes da primeira migration de negócio. Mudanças em relação ao primeiro desenho, por causa de D1:

- Depósito central e almoxarifado são `stock_location` (`level` e a árvore de abastecimento, D17), não rótulo nem configuração.
- A distribuição ao militar é movimento de saída do ledger (tipo novo no CHECK, com o SARAM de quem recebe), e não tabela `clothing_issue` própria: uma segunda tabela de saída seria um segundo saldo. Entra com o change de distribuição.
- O saldo do depósito central é o do ledger quando o depósito operar no SISPROV. Até lá, a carga periódica (`depot_balance_snapshot`) é a única exceção, marcada como provisória.

### D7. App inteiro autenticado, sem agent-web

O SISPROV não tem conteúdo público: `/` redireciona para o hub ou para `/auth`. Rotas legais e `/health` são as únicas públicas. `robots.txt` nega tudo.

### D8. Shell: sidebar por módulo, hub por permissão

A casca do SISPROV é `SidebarProvider` + `Sidebar` do primitivo do sisub, com um item por módulo acessível: Planejamento, Estoque e Administração. O hub lista os módulos e explica a negativa quando o guard redireciona (`?denied=`). Sem módulo nenhum, a tela diz que o acesso ainda não foi concedido e a quem pedir.

A tela de Estoque do SISPROV nasce como casca: lista os locais que o usuário alcança e as classes de cada um. As operações (receber, distribuir, contar) da classe fardamento vêm com o catálogo. A alimentação continua nas telas `/storage/$kitchenId` do sisub (D14).

### D9. Documentos legais: versão nova com o SISPROV

O app grava `theme` (cookie), `auth_rate_limit` e `fab_remember_email` (auth-kit) no navegador. O guard `cookie-inventory.test.ts` exige que a linha de cada chave nomeie o app; o `LGPD.md` exige o app na lista dos Termos e da Privacidade. A migration `legal_documents_sisprov` traz Termos 2.4.0, Privacidade 2.4.0 e Cookies 1.7.0 reinserindo o conjunto completo. O texto é proposta; o mantenedor decide e aplica.

Dado antropométrico (tamanhos por SARAM) e gênero NÃO entram nesta versão: chegam com o change do cadastro, que leva RIPD e versão própria da Privacidade.

### D10. Entrega: um PR, com a migration do estoque à espera do mantenedor

Este change é um PR com três partes: a fundação do app, a migration que generaliza o estoque e o código do sisub ajustado a ela. Ordem:

1. O PR traz a migration, o código do sisub e do domínio já escritos para as colunas novas, e o guard de treino que aceita `location_id`.
2. O mantenedor aplica a migration (`db:push --dry-run` antes) no momento do merge, e `db:types` + `db:drizzle:pull` regeneram os tipos no PR.
3. O que o `bun check` acusar com os tipos novos se corrige no mesmo PR, que então mergeia e faz deploy.

Entre o apply e o deploy, o sisub em produção lê colunas que não existem mais: as telas de estoque falham e a suíte de integração da `main` fica vermelha. Com o ledger vazio e o piloto travado, o custo é uma janela curta e sem perda de dado. Por isso o código vem pronto ANTES do apply, e não depois.

### D11. `inventory.stock_location`: o local de estoque

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `id` | `bigint` identity | |
| `unit_id` | `bigint not null` → `core.units` | OM dona do local; é ela que o escopo `unit` e o reset de treino leem |
| `kitchen_id` | `bigint null unique` → `kitchen.kitchen` | preenchido só no local da cozinha |
| `level` | `smallint` ∈ 1 · 2 · 3 | nível de estoque (D17); local de cozinha é nível 3 |
| `supplied_by_location_id` | `bigint null` → `inventory.stock_location` | quem abastece este local (a "distribuidora" do legado); nível estritamente menor |
| `receives_direct` | `boolean` | o fornecedor entrega aqui sem passar pelo nível de cima |
| `gln` | `text null unique`, 13 dígitos com dígito verificador GS1 | identificação do local para EDI e etiqueta |
| `uses_positions` | `boolean` | o local é endereçado (D18); a cozinha não é |
| `name` | `text not null` | |
| `supply_classes` | `text[] not null`, não vazio | classes (`catalog_scope`) que o local guarda |
| `created_at`, `updated_at`, `deleted_at` | | soft delete; local com saldo não se apaga |

- Backfill: um local de nível 3 por cozinha, com a OM da cozinha, `supply_classes = {alimentacao, auxiliar}` (o que as cozinhas recebem hoje), `receives_direct = true` (a cozinha recebe a NF-e do fornecedor hoje) e sem endereçamento.
- Trigger em `kitchen.kitchen`: cozinha nova ganha o seu local, e troca de OM da cozinha atualiza o local. Assim o cadastro de cozinha do sisub não muda. Cozinha sem OM (`unit_id` é anulável) fica sem local até ganhar uma; o trigger não recusa o cadastro.
- O id do local NÃO é o id da cozinha: os dois têm sequências próprias, e conflar identidade foi o erro que o ledger por `kitchen_id` cometeu. O sisub resolve cozinha → local por `stock_location.kitchen_id`.

### D12. O ledger por (local, item)

Em toda tabela do `inventory`:

- `kitchen_id` → `location_id bigint` → `inventory.stock_location`, mesma nulidade de antes;
- `ingredient_id` e `frozen_preparation_id` → `item_id uuid` → `core.item`. Onde havia XOR, `item_id` é `not null`; onde o alvo era "lote OU item" (`inventory_count_entry`, `stock_adjustment_item`), a regra fica "lote OU item";
- `kitchen_stock_settings` vira `stock_location_settings`, com PK `location_id`;
- as unicidades seguem o novo eixo: `monthly_closing (location_id, competencia)`, `stock_policy (location_id, item_id)`, `stock_issue_request_item (request_id, item_id)`.

Ficam como estão, por serem da classe alimentação e opcionais: `production_task_id`, `meal_type_id` e `ingredient_item_id` (embalagem GTIN de `kitchen.ingredient_item`). Embalagem de outras classes é lacuna registrada para o change do catálogo.

Trigger `stock_movement_class_guard` (e o mesmo em `stock_lot`): o `catalog_scope` do item tem de estar em `supply_classes` do local. É a trava que impede, por exemplo, coturno no estoque da cozinha, e a base da lente por classe.

As 62 funções do `inventory` são recriadas com as colunas novas, assinatura com `p_location_id`/`p_item_id` no lugar de `p_kitchen_id`/`p_ingredient_id`/`p_frozen_preparation_id`, e `set search_path = ''`. As views `v_stock_balance` e `v_lot_expiry` passam a agregar por (local, item).

### D13. Sem schema `sisprov`

O primeiro desenho criava um schema `sisprov` vazio. Ele sai: o estoque está em `inventory`, o item em `core.item`, a OF em `procurement`. O que é só do fardamento (família, variante, grade, aplicabilidade, grupo de demanda, enxoval, ficha de tamanhos, curva) ganha schema próprio no change do catálogo, com a primeira tabela, pelo mesmo motivo de o perfil de alimentação estar em `kitchen` e não em `inventory`. O nome do schema se decide ali.

Tirar o schema vazio também tira deste PR a migration que reprovava `supabase-schemas.test.ts` sem entregar nada.

### D14. Lente por classe

- **Sisub (cozinha):** as telas `/storage/$kitchenId` continuam onde estão e operam o local da cozinha. Mostram só o que esse local guarda (alimentação e auxiliar). O gate passa a ser "`storage` neste local", que aceita o grant por cozinha de hoje.
- **SISPROV:** a tela de Estoque lista os locais que o grant `storage` alcança, com as classes de cada um. A SDAB (global) vê a rede inteira.
- A trava de D12 garante que a lente não é só filtro de tela: um local de cozinha não recebe item de outra classe.

### D15. Código do estoque no `sisprov-domain`

A lógica pura do estoque (`stock-math`, `count-math`, `issue-variance`, `receipt-lots`, `receiving-*`, `nfe-*`, `inventory-vocabulary`, `replenishment`) muda de `@iefa/sisub-domain` para `@iefa/sisprov-domain/inventory`, junto com o guard `requireStockLocation`. O `sisub-domain` passa a depender do `sisprov-domain`, e não o contrário. Fica no sisub o que é da cozinha e só consome estoque: `production-issue` (baixa por tarefa de produção) e o cardápio → MRP.

As server functions do sisub em `apps/sisub/src/server/*` continuam lá (são a lente da cozinha), lendo e escrevendo pelas funções do `inventory`.

A mudança de pacote vem no PR seguinte, sem mudança de comportamento: os arquivos dependem de utilitários que o sisub usa em toda parte (`civil-date`, `conditioning`), que precisam ir antes para um lugar comum. Este PR muda o eixo (local, item) e cria no `sisprov-domain` o guard do local (`requireStockLocation`); a mudança de pacote, sozinha, fica revisável.

### D16. Ordem de fornecimento por local

`procurement.supply_order.kitchen_id` → `location_id` (local de destino). A OF de alimentação continua indo para o local da cozinha; a de fardamento vai para o almoxarifado da OM ou para o depósito central. `kitchen_demand_forecast` e as estimativas de quantidade (`quantity_estimate_*`) são planejamento da classe alimentação e ficam por cozinha.

### D17. Níveis de estoque e a árvore de abastecimento

O legado tinha três níveis (`TipoNivelEstoque`) e, em cada local, a sua "distribuidora". Esta versão traz os dois, porque a necessidade líquida e a OF precisam saber de onde sai o material:

| Nível | O que é | Abastecido por |
| --- | --- | --- |
| 1 | Depósito central (SDAB) | fornecedor |
| 2 | Distribuidor regional: abastece outros locais | nível 1, ou fornecedor se `receives_direct` |
| 3 | Local de consumo e distribuição final: almoxarifado da OM, cozinha | nível 1 ou 2, ou fornecedor se `receives_direct` |

- `supplied_by_location_id` aponta para um local de nível ESTRITAMENTE menor, ativo. Nível decrescente na aresta já impede ciclo; o nível 1 não tem abastecedor.
- `receives_direct` é o "receber direto" do legado: o local recebe do fornecedor (a cozinha recebe a NF-e hoje). Não exclui ter abastecedor: um almoxarifado de OM pode receber direto e também por remanejamento do nível 2.
- `gln` (GS1 Global Location Number) identifica o local na etiqueta e no EDI, com o dígito verificador conferido pelo banco.
- A baixa de material (`NAO_PROV` do legado) não é nível: é tipo de movimento, e entra com o change que a usar.

Descartado: nível como rótulo livre (o primeiro desenho tinha `tier` com três nomes) — misturava "o que o local é" com "de quem ele recebe", e não dizia o abastecedor.

### D18. Endereçamento: posição, unidade de movimentação, separação

Depósito de grande porte não acha nada por "prateleira do fundo". O legado endereçava Depósito → Setor → Estante (corredor, tipo, ordem de separação) → Prateleira (última conferência), com volume (SSCC) e pallet (GIAI) posicionados e lista de separação numerada. Esta versão traz isso, OPCIONAL por local (`uses_positions`): o depósito e o almoxarifado grande usam; a cozinha continua com o texto livre de `stock_lot.location`.

**Posição** — `inventory.storage_position`, árvore por local:

| Tipo (`kind`) | Rótulo | Pode conter |
| --- | --- | --- |
| `building` | Depósito (prédio, galpão) | setor |
| `sector` | Setor | estante |
| `rack` | Estante (com `aisle`, o corredor, e `rack_type`) | prateleira |
| `shelf` | Prateleira | escaninho; guarda estoque |
| `bin` | Escaninho | guarda estoque |

- A posição filha é de tipo mais fundo que a mãe, no mesmo local; a raiz pode ser de qualquer tipo (almoxarifado pequeno começa na estante).
- `code` é o segmento ("E05"); `address` é o caminho inteiro ("D1-S2-E05-P3"), mantido pelo banco e único no local. É o que vai na etiqueta e na lista de separação.
- `picking_sequence` ordena a separação (o legado tinha `sequenciaSeparacao` na estante); `last_counted_at` é a última conferência da posição, gravada na aprovação da contagem para as posições ativas onde estão os lotes contados.
- Só prateleira e escaninho guardam estoque. Posição com estoque, ou com posição ativa dentro, não se desativa; local com endereço ativo não desliga o endereçamento; o local de cozinha não é endereçado (CHECK).

**Lote endereçado** — `stock_lot.position_id`: posição que guarda estoque, do mesmo local. Lote recebido num local endereçado nasce sem posição e fica **pendente de endereçamento** (o "guia pendente de localização" do legado) até alguém guardá-lo. O lote derivado (aberto, fracionado, descongelado) herda a posição do lote de origem; o lote transferido chega pendente no destino.

**Unidade de movimentação** — `inventory.handling_unit`:
- `pallet` com código GIAI; `box` (volume) com SSCC de 18 dígitos e dígito verificador GS1, ligada a um lote, com quantidade, peso e categoria da caixa;
- a caixa pode estar num pallet (aí a posição é a do pallet) ou solta numa posição;
- código único por tipo enquanto a unidade estiver aberta; a caixa não troca de lote.
- **Lote encaixotado é localizado pelas caixas:** a posição do lote acompanha as caixas abertas (a da caixa ou a do pallet dela), e com caixas em posições diferentes vale a primeira da rota de separação. Mover o lote com caixa aberta é recusado: move-se a caixa ou o pallet. Assim a separação tem uma fonte só, `stock_lot.position_id`.

**Movimentação entre posições** — `inventory.move_to_position` move lote ou unidade e grava `inventory.position_move` (append-only, como o ledger). Mover não muda saldo, custo nem lote: o ledger não registra, e o fechamento mensal não vê. Mover um pallet move as caixas dele.

**Contagem por posição** — fica para as telas de contagem do depósito. A contagem do ledger é por item no local; um escopo por subárvore compararia a quantidade da posição com o saldo do local inteiro e lançaria perda do que está em outra prateleira. Por posição, a contagem tem de ser por lote, e isso entra com aquelas telas.

**Separação** — `inventory.picking_list` (+ linhas), numerada por local e ano. `create_picking_list` recebe itens e quantidades (o mesmo item em duas linhas soma), aloca entre os lotes alocáveis (fora de quarentena e de validade) na mesma ordem da saída (`usar primeiro`, validade, entrada) e ordena as linhas pela ordem de separação da posição e pelo endereço. A lista é o roteiro de quem separa: não move estoque; a saída ou a transferência que ela sustenta é que move.

**Permissão** — cadastro de posições e configuração do local: `storage` nível 3 no local, ou `sisprov-admin` 2 na cobertura da OM do local (a SDAB cria o local e o configura sem precisar de `storage`). Endereçar, mover, unidades e separação: `storage` nível 2. Leitura: nível 1. A lista de abastecedores possíveis (locais de nível menor, da rede inteira, porque o depósito central é da SDAB) é só de quem configura local.

**Reset de treino** — `handling_unit`, `position_move` e `picking_list` entram no reset pelos locais do escopo de treino; `storage_position` é estrutura e fica em `RESET_EXCLUSIONS`, como o próprio local.

Fora desta versão, de propósito: portaria e conferência física por volume na doca (o recebimento continua por linha), etiqueta impressa (o dado está aí; o layout vem com a tela de recebimento do depósito) e otimização de rota de separação além da ordem cadastrada.

## Risks / Trade-offs

- **Janela entre o apply e o deploy (D10).** O sisub em produção quebra no estoque e a suíte da `main` fica vermelha até o deploy. Mitigação: o código vem pronto antes do apply, o apply acontece no merge, e o ledger está vazio.
- **Recriar 62 funções numa migration.** Erro de digitação vira erro em tempo de execução, não de compilação. Mitigação: a migration recria a partir das definições vigentes no banco, troca só as colunas e os parâmetros, e a suíte de integração do sisub (recebimento, saída, contagem, ajuste, fechamento) roda contra o banco depois do apply, antes do merge.
- **O `storage` muda de dono sem mudar de nome.** Quem lê `storage` pensa "sisub". Mitigação: o comentário do `AppModule`, o `pbac/modulos.mdx` e o rótulo da tela passam a dizer "Estoque (SISPROV)".
- **Documento legal em versão nova faz o aviso de ciência reaparecer para todos os apps.** Custo conhecido e aceito.
- **A lacuna de embalagem.** Só a alimentação tem embalagem GTIN (`kitchen.ingredient_item`). O fardamento recebe por unidade até o change do catálogo modelar embalagem no núcleo.

## Migration Plan

1. O PR traz: a fundação do app; a migration `inventory_multiclass` (local, item, classe, OF, funções, views, guard de treino); a migration `legal_documents_sisprov`; o código do sisub e do domínio já com as colunas novas.
2. O mantenedor aplica as duas migrations (`db:push --dry-run` antes, conferindo que a lista tem só as duas) no momento do merge; `db:types`, `db:drizzle:pull` e `audit:rls` rodam no PR; o `bun check` e a suíte de integração do sisub confirmam.
3. Provisionar `infra/sisprov` (secret `/iefa/prod/sisprov`, `SISPROV_HEALTH_URL`, host `sisprov.iefa.com.br`) antes do merge: o `release-build-env.ts` reprova o build quando falta variável obrigatória.
4. Primeiro grant `sisprov-admin` nível 3 por SQL auditado, como o α fez.
5. Changes seguintes: `sisprov-catalog` (perfil de fardamento, grade, embalagem), `sisprov-demand-groups`, `sisprov-size-records`, `sisprov-size-curve`, `core-sigpes-sync`, `sisprov-engine` (necessidade líquida → OF), `sisprov-distribution` (saída ao militar).

Rollback: a migration do estoque não se reverte por migration inversa depois que houver movimento. Antes do primeiro movimento, a reversão é uma migration que recria as colunas antigas a partir das novas (`location_id` → `kitchen_id` pelo local da cozinha; `item_id` → `ingredient_id`/`frozen_preparation_id` pelo perfil). O app sem tráfego sai do manifesto e do ALB.

## Open Questions

- Locais `central_depot` e `unit_storeroom`: quem os cadastra na primeira carga (SDAB pela tela de Administração, ou seed com os almoxarifados conhecidos)? Decide o change do catálogo, com a SDAB.
- Nível 2 de `sisprov-admin` escopado por OM: há caso real de gestão sistêmica delegada a uma OM? O modelo permite; a tela só oferece global até aparecer o caso.
- Host definitivo (`sisprov.iefa.com.br`) e prioridade do listener no ALB: o mantenedor define no provisionamento.
