## Context

### Inventário (2026-09-27, `origin/main` em `f0c7ce24`)

Banco lido pelo catálogo (`pg_class`, `information_schema.columns`, `pg_constraint`, `pg_proc`, `pg_views`), só SELECT. Código contado com `git grep -o -P` sobre `apps/sisub`, `apps/sisub-mcp`, `apps/api`, `packages/sisub-domain`, `packages/database/{src,scripts}`, **sem** `generated.ts`, `drizzle/`, `routeTree.gen.ts` e `*.sql` ("escrito à mão"); a coluna "gerado" conta só esses três. As contagens incluem comentário e texto de tela: são teto, não número exato de renomeações.

| Termo atual | Camadas onde aparece | à mão (ocorr. / arq.) | gerado |
|---|---|---|---|
| `ata`, `ataId`, `ataItemId`, `Ata*` (= anexo quantitativo) | TS (tipos `AtaWithDetails`, `AtaWizardState`, `AtaSnapshotComponent`; funções `createAta`, `fetchAtaDetails`, `updateAtaStatus`, `calculateAtaNeeds`; arquivos `ata.ts`, `ata.fn.ts`, `useAta.ts`, `ata-annex.ts`, `ata-utils.ts`, `types/domain/ata.ts`, `components/features/local/ata/`), rota `unit/$unitId/procurement/$ataId` (+ `print.quantities.$ataId`, `print.price-research.$ataId`), query keys, tools do chat, API | 1.871 / 117 | 74 |
| `numero_ata`, `ano_ata`, `status_ata`, `numeroAtaRegistroPreco` (= ARP, espelho do Compras.gov.br) | banco, TS | 133 / 25 | 16 |
| `procurement_list*` | banco (6 tabelas), TS | 497 / 52 | 243 |
| `list_id`, `listId`, `list_kitchen_id` | banco (7 colunas), TS | 177 / 23 | 68 |
| `max_margin_percent`, `margin_justification` | banco (4 colunas), TS | 156 / 19 | — |
| `published` (status do anexo) | CHECK `procurement_list_status_check`, TS | 96 / 25 | — |
| `AtaDraft`, `draftId`, `kitchen-draft`, `suprimentos` (= previsão de demanda) | TS, rota `kitchen/$kitchenId/suprimentos/$draftId` | 530 / 41 | 13 |
| `procurement_arp*` | banco (2 tabelas), TS | 143 / 29 | 63 |
| `procurement_segment*` | banco (2 tabelas), TS | 164 / 19 | 59 |
| `pesquisa_preco`, `PesquisaPreco`, `pesquisa-preco` | banco (3 tabelas), TS, worker da API | 82 / 7 | 73 |
| `price_research`, `priceResearch` | banco (`price_research_emission`), TS, rota | 245 / 32 | 44 |
| `compras_amostra`, `amostra_id` | banco (tabela, RPC `upsert_compras_amostras`, `sisub.compras_amostra_fingerprint`), TS | 172 / 36 | 24 |
| `liquidation`, `Liquidation` | TS (`liquidation.fn.ts`, `liquidation-math.ts`), rota `liquidations` | 156 / 23 | 24 |
| `liquidacao` | banco (`finance.liquidacao`, `liquidacao_deduction`), TS | 249 / 24 | 137 |
| `payment`, `Payment` | TS, rota `payments` | 41 / 12 | 24 |
| `pagamento` | banco (`finance.pagamento`), TS | 103 / 27 | 32 |
| `empenho` | banco, TS, rota `empenhos`, tool `list_empenhos` | 2.681 / 137 | 348 |
| `dotacao` | banco (`finance.budget_credit.dotacao`), TS | 36 / 8 | 4 |
| `ug_emitente` × `issuer_ug` | banco (`empenho.ug_emitente`; `credit_note.issuer_ug`) | 30 / 7 | — |
| `purchase_item` | banco (3 tabelas), TS | 1.160 / 83 | 313 |
| `supply_order` | banco, TS, rota | 251 / 29 | 124 |
| `goods_receipt` | banco (3 tabelas), TS | 253 / 29 | 274 |
| `contract_designation`, `designation` | banco, TS, rota | 337 / 22 | 115 |
| `stock_issue_request` | banco, TS | 92 / 11 | 85 |
| `inventory_count` | banco (3 tabelas), TS | 133 / 12 | 168 |
| `monthly_closing` | banco, TS | 10 / 7 | 17 |
| `rancho` | banco (`kitchen.rancho`, view `core.rancho`), tela ("Rancho" = refeitório no Comensal; "Efetivo dos Ranchos") | 655 / 117 | 60 |
| `mess_hall(s)` | banco, TS, rota `messhall/$messHallId` | 1.387 / 154 | 254 |
| `meal_forecast(s)` (= arranchamento) | banco (43 mil linhas), TS, rota `diner/forecast` | 151 / 30 | 19 |
| `meal_presence(s)`, `other_presences` | banco (42 mil + 17 mil linhas), TS | 108 / 16 | 45 |
| `recipe(s)` (= preparação) | banco (`kitchen.recipes`, na publicação Realtime), TS, tools | 5.745 / 257 | 1.055 |
| `preparation` (= preparação congelada, preparação legada do SISUBWEB, grupo de preparo) | banco, TS, tool `list_preparations` | 873 / 87 | 324 |
| `ingredient` (= insumo) | banco, TS, API pública `/ingredients` | 6.504 / 291 | 867 |
| `product` (nome antigo de insumo) | CHECK `policy_rule.target`, TS | 105 / 33 | 52 |
| `ceafa` | banco (`kitchen.ceafa`, 19 linhas), TS | 174 / 25 | 41 |
| `nrOrdem`, `nr_ordem` (= SARAM) | banco (`core.user_data."nrOrdem"`, `core.person.nr_ordem`, espelho `core.user_military_data`), TS, também `sucont`/`rumaer` | 262 / 41 (só sisub) | 27 |

Outras evidências:

- **Tools de IA.** No chat: `list_atas` e `get_ata_details`/`update_ata_status` (`module-chat/tools/unit.ts`), `get_atas` (`local-analytics.ts`), que consultam `procurement_list` por `untypedFrom` em vez de operação do domínio (contra `.claude/rules/ai-tools.md`). `kitchen.module_chat_message` tem **zero** chamadas registradas dessas quatro tools. No MCP (`apps/sisub-mcp`) nenhuma tool usa termo do inventário.
- **Analytics.** `analytics_reader` lê `procurement.procurement_list`, `procurement_list_item`, `procurement_arp_item`, `kitchen.meal_forecasts`, `finance.empenho`, `empenho_item`. O prompt (`analytics-prompt.ts`) e a allowlist (`analytics-sql.ts`) citam as tabelas pelo nome: o modelo escreve SQL com eles.
- **Funções que citam tabela pelo nome** (plpgsql resolve por nome, não por OID): `procurement_arp` em `finance.empenho_item_check_unit`, `inventory.designations_covering`, `procurement.supply_order_empenho_usage`; `compras_amostra` em `procurement.upsert_compras_amostras`. Nenhuma função cita `procurement_list` ou `pesquisa_preco`. Views seguem a tabela pelo OID.
- **Rótulos de tela** (`NavItems.tsx`, `breadcrumbs.ts`) já seguem a spec `procurement-terminology` ("Anexos Quantitativos", "Previsão de demanda", "Concluído"). Os conflitos que restam na tela: "Fiscal" (módulo de presença) × fiscal do contrato (art. 117), já na tela de designações; "Previsão" (arranchamento do comensal) × "Previsão de demanda"; "Planos Semanais Modelo" (global) × "Cardápios Semanais" (cozinha) para a mesma `menu_template`; "Contagem Física" para o que a norma chama inventário; "Pesquisa de preço" × "Pesquisa de preços".
- **API.** `apps/api` expõe `/api/admin/price-research/ata/:ataId` e `/ata/:ataId/history` (Hono simples, fora do OpenAPI, protegido por chave); `git grep` não acha chamador no repo. A API pública (`/ingredients`, `/folders`) não usa termo a renomear.
- **Reset de treino.** O guard de `training.operations.test.ts` casa tabela pelo nome; renomear tabela com `unit_id`/`kitchen_id` exige declarar o nome novo antes, como foi feito com `kitchen_demand_forecast`.

### O que as migrations `20260927010000`/`20260927020000` ensinaram

- Tabela renomeada: o nome antigo vira view `security_invoker` de uma tabela só, com as colunas antigas por alias (`forecast_id as draft_id`). É auto-updatable: INSERT/UPDATE/DELETE e `on conflict` pela PK do código antigo passam direto.
- Coluna renomeada em tabela que fica: coluna nova ao lado, backfill, FK e índice próprios, trigger `BEFORE INSERT OR UPDATE` que espelha nos dois sentidos e recusa valores divergentes. A antiga mantém a FK até o contract porque o PostgREST da `main` embute por ela.
- Constraint e índice: rename direto.
- O contract confere que as colunas não divergem antes de derrubar, e só roda depois do deploy do código que usa os nomes novos.

## Goals / Non-Goals

**Goals**
- Cada conceito do sisub com um nome só, do banco à tela, e esse nome sendo o da norma quando não há equivalente inglês fiel.
- Nenhum termo da norma usado para outro conceito.
- Renomear sem derrubar a `main` em nenhum instante e sem PR de banco que não se desfaça.
- Um gate que impeça o nome descartado de voltar.

**Non-Goals:** ver "Não-objetivos" na proposta.

## Decisions

### D1. Critérios

1. **Um conceito, um nome.** O identificador do glossário vale para tabela, coluna, tipo, função, arquivo, query key, rota, tool e parâmetro de tool. O rótulo de tela é a tradução do mesmo nome, nunca outro conceito.
2. **Teste da NSCA** (AGENTS.md). Inglês quando o leitor da norma reconheceria o termo; português quando não há equivalente fiel ou o inglês é falso cognato (`liquidation`).
3. **Siglas consagradas** podem ser identificador (`arp`, `nd`, `ptres`, `uasg`, `saram`...).
4. **Sem prefixo redundante.** O schema já diz o domínio: `procurement.procurement_arp` → `procurement.arp`.
5. **Valor de domínio na língua da norma** quando o valor é uma categoria da norma (tipo de contratação, papel na ata, tipo de empenho, papel do agente). Estado de fluxo do próprio sistema (`draft`, `sent`, `open`, `provisional`) fica em inglês: não é categoria da norma.
6. **Prioridade** para decidir o que entra num lote:
   - P1, termo da norma para outro conceito (erro jurídico): `ata` para o anexo, `published`, `margin`, `dotacao`, `liquidation`, "Fiscal";
   - P2, um conceito com vários nomes: `pesquisa_preco` × `price_research`, `draft` × `forecast` × `suprimentos`, `product` × `ingredient`, `list_id` × `procurement_list_id` × `ata_id`;
   - P3, prefixo redundante;
   - P4, coluna legada em português sem conflito: fora (Não-objetivos).

### D2. Decisões caso a caso

| Caso | Decisão | Motivo |
|---|---|---|
| Anexo quantitativo | `quantity_estimate` (decisão do usuário) | Lei 14.133, art. 18, § 1º, IV; art. 6º, XXIII. Só a ARP é ata (art. 6º, XLVI) |
| `empenho` / `liquidacao` / `pagamento` (finance) | **Manter as três tabelas**; o TS se alinha a elas (`liquidation*` → `liquidacao*`, `payment*` → `pagamento*`; rotas `liquidacoes`, `pagamentos`) | `empenho` não tem equivalente fiel ("commitment" não carrega a nota nem o ato do art. 58); `liquidation` é falso cognato. `payment` passaria no teste, mas as três são as fases da despesa da Lei 4.320 (arts. 58-64) e as colunas das três são portuguesas (`numero_ob`, `liquidacao_id`): quebrar a tríade por uma tabela custaria um rename sem ganho de conceito. **A confirmar** (é exceção à regra do inglês) |
| `pesquisa_preco` × `price_research` | `price_research` | "Price research" é reconhecível como pesquisa de preços (IN SEGES/ME 65/2021); `price_research_emission` já nasceu assim |
| `compras_amostra` | `procurement.price_sample`; as colunas espelham a API do Compras.gov.br e ficam (`id_compra`, `descricao_item`, `ni_fornecedor`...) | o nome da tabela é nosso; o das colunas é do terceiro |
| `budget_credit.dotacao` | `received_credit`; `saldo_siafi` → `available_credit_siafi` | Numa UG executora, dotação é da LOA no órgão; o que chega por NC é crédito recebido, e o saldo é o crédito disponível (MCASP). A tela já rotula assim (D11 de `sisub-flexible-expense-execution`), que deixou a coluna por medo de quebrar a `main`; o espelho por trigger resolve isso |
| `purchase_item` | Fica | "Purchase item" = item de compra; a descrição dele é a especificação do produto (Lei 14.133, art. 40, § 1º, I, a confirmar inciso) |
| `supply_order` | Fica; rótulo "Ordem de fornecimento" | "Supply order" é fiel. Fonte: prática; a Lei 14.133, art. 95, fala em "autorização de compra" como substitutivo do contrato; o D9 do planejamento citou art. 6º, X. **A confirmar** a fonte |
| `goods_receipt` | Fica; `status` `provisional`/`definitive` fica (estado de fluxo) | Lei 14.133, art. 140, II, a e b |
| `contract_designation` | Tabela fica; `role` passa a `gestor` · `fiscal_tecnico` · `fiscal_administrativo` · `fiscal_setorial` · `membro_comissao` | são as categorias do Decreto 11.246/2022 (dispositivos **a confirmar**); hoje em inglês (`technical_inspector`...) |
| `kitchen_demand_forecast` | Fica (já renomeada); o TS sai de `KitchenAtaDraft`/`draftId`/`kitchen-draft` para `DemandForecast`/`forecastId`/`demand-forecast`; rota `kitchen/$kitchenId/demand-forecasts/$forecastId` | concluir o rename que parou no banco |
| `stock_issue_request` | Fica; rótulo da entidade "Requisição" | "Issue request" = requisição de material (IN SEDAP 205/1988, item a confirmar) |
| `inventory_count` | Fica; `type` passa a `anual` · `transferencia_responsabilidade` · `eventual` · `rotativo`; rótulo "Inventário físico" em vez de "Contagem Física" | tipos de inventário da IN SEDAP 205/1988 (item e lista **a confirmar**; "rotativo" pode não estar nela) |
| `monthly_closing` | Fica | fechamento mensal (MCASP, a confirmar capítulo) |
| `rancho` / `mess_halls` / `kitchen` | `kitchen` fica (cozinha). `mess_hall` = rancho onde o comensal come. `kitchen.rancho` (roster do efetivo: 66 linhas, com `mess_hall_id` e `kitchen_id`) **a confirmar**: se é o mesmo conceito de `mess_halls` (69 linhas), fundir fora desta change; se não, renomear para o que ele é e rotular diferente | hoje "Rancho" na tela nomeia as duas tabelas |
| `meal_forecasts` / `meal_presences` | `meal_forecasts` → `kitchen.arranchamento` (pt), rótulo "Arranchamento"; `meal_presences`/`other_presences` ficam | "meal forecast" é a estimativa agregada do rancho (`daily_menu.forecasted_headcount`), não a declaração individual do comensal: falha no teste da NSCA. "Presence" é fiel. **A confirmar** (43 mil linhas; lote próprio, depois das decisões) |
| `recipes` | Fica (`recipe` = preparação; "Ficha técnica" é o documento impresso dela) | reconhecível; `kitchen.recipes` está na publicação Realtime e tem 5,7 mil ocorrências |
| `preparation` no código | Nunca sozinho: `frozen_preparation` fica (preparação congelada); a preparação legada do SISUBWEB (em `kitchen.ingredient`, tool `list_preparations`) vira `legacy_preparation`; `kitchen.preparation_group` **a confirmar** | a tela chama `recipe` de "Preparação" |
| `ingredient` / `insumo` | `ingredient` fica (rótulo "Insumo"); `core.item.kind = 'insumo'` fica; `product` sai (`policy_rule.target = 'product'` → `'ingredient'`) | custo de 6,5 mil ocorrências e API pública; o nome antigo `product` é só dívida |
| `ceafa` | Fica (sigla) | termo do COMAER sem equivalente; expansão da sigla e norma **a confirmar** |
| `credit_note` | Fica | acabou de nascer; **a confirmar** trocar por `nc` (em inglês comercial, "credit note" é nota de devolução) |
| `ug_emitente` × `issuer_ug` | `issuer_ug` nas duas | um conceito, dois nomes na mesma schema |
| SARAM | `saram` em objeto nosso (`core.person.nr_ordem`, `core.user_data."nrOrdem"`, a view nova `core.military_identity`); `core.user_military_data."nrOrdem"` fica (espelho da carga externa) | sigla consagrada; **a confirmar** junto com `lgpd-military-roster-key`, que hoje propõe `nr_ordem` na view |
| `segment` × `acquisition` | `procurement_segment` → `procurement.segment`; rótulos "Contratação planejada" (segmento) e "Contratação de origem" | a tela chama os dois de "contratação". Que o segmento vire a contratação de origem depois da licitação é hipótese **a confirmar**; o vínculo seria outra change |
| Status do anexo | `published` → `completed` | spec `procurement-terminology`: "publicar" é divulgar no PNCP (art. 54) |
| Acréscimo de quantidade | `max_margin_percent` → `max_increase_percent`; `margin_justification` → `max_quantity_justification`; `total_quantity` → `estimated_quantity` | margem é a de preferência (art. 26); quantidade estimada (art. 18, § 1º, IV) e máxima (art. 82, I) |
| `cost_source = 'ata'` (saldo inicial) e `instrument = 'ata'` (contratação) | Ficam | são a ARP de fato (art. 6º, XLVI); só o rótulo "ATA (preço homologado)" passa a "ARP (preço registrado)" |
| Módulo "Fiscal" | Rótulo "Fiscal do rancho"; o ID `messhall` fica | "Fiscal" na tela colide com o fiscal do contrato (art. 117). Termo **a confirmar** |
| "Planos Semanais" × "Cardápios Semanais" | Um rótulo, "Cardápio semanal" (o global com "modelo"); rota `global/weekly-plans` → `global/weekly-menus` | mesma tabela `menu_template` (`template_type = 'weekly'`). **A confirmar** |
| "Apoios" × `template_type = 'exception'` | **A confirmar** qual é o termo da norma | a tela e o valor divergem |

### D3. O que não se renomeia

| O quê | Por quê |
|---|---|
| `compras_gov_integration.compras_material_*`, `compras_servico_*`, `pncp_pca_*`; colunas de `price_sample`; `numero_ata`, `ano_ata`, `status_ata`, `quantidade_homologada`, `quantidade_empenhada`, `saldo_empenho` da ARP; `nfe_item` (layout da NF-e); `siafi_integration.import_row.raw` | espelham API ou layout de terceiro; o nome é o do terceiro, e casar pelo nome é o que torna a sincronização conferível |
| `core.user_military_data` | carga externa (ver `lgpd-military-roster-key`) |
| IDs de módulo do PBAC | dado de permissão; renomear é mudança de acesso |
| `kitchen.recipes`, `kitchen.daily_menu`, `kitchen.menu_items` | publicação Realtime (renomear derruba a assinatura dos clientes abertos) e nome reconhecível |
| `unit`/`unit_id` (= OM), `kitchen.kitchen` | FK em quase toda tabela escopada; o comentário da tabela já registra a escolha |
| `finance.empenho`, `liquidacao`, `pagamento` e suas colunas | D2 |
| valores de estado de fluxo em inglês | D1, critério 5 |
| migrations aplicadas | são o histórico |
| views de compatibilidade `core.kitchen`, `core.mess_halls`, `core.rancho` | pertencem ao contract da promoção do núcleo (`20260901120400`), não a esta change |

### D4. Técnica de rename no banco compartilhado

Cada lote de banco tem três PRs, na ordem **declara → expand → código → contract**:

1. **Declaração** (se houver tabela renomeada com `unit_id`/`kitchen_id`/`mess_hall_id`): o nome novo entra em `RESET_EXCLUSIONS` antes do expand. O nome antigo sai da lista de tabelas vivas; o guard só cobra que toda tabela viva esteja coberta.
2. **Expand** (migration nova; espera o mantenedor):
   - tabela renomeada + view com o nome antigo, `security_invoker`, colunas antigas por alias, os mesmos grants (inclusive `analytics_reader`, onde houver);
   - coluna renomeada em tabela que fica: coluna nova + backfill + FK/índice + trigger de espelho nos dois sentidos, como `procurement.mirror_procurement_list_id()`;
   - coluna renomeada em tabela renomeada: basta o alias da view;
   - valor de CHECK renomeado: o CHECK aceita os dois; leitores aceitam os dois (como `cancelamento`/`anulacao_total`);
   - função renomeada: a nova nasce com `set search_path = ''`, executável só por `service_role`; a antiga vira wrapper que chama a nova;
   - função plpgsql que cita tabela renomeada pelo nome é recriada com o nome novo no mesmo expand. Sem isso ela passaria pela view, que não dispara os triggers da tabela como o código espera;
   - constraint e índice: rename direto;
   - `db:push --dry-run` antes; `db:types` e `db:drizzle:pull` no mesmo PR, depois de aplicada.
3. **Código** (PR do recurso): TS, rotas, tools, prompt e allowlist do analytics, `RESET_STEPS` com o nome novo (sai de `RESET_EXCLUSIONS`), só nomes novos. Os termos descartados entram no gate (D8).
4. **Contract** (migration; espera o mantenedor): só depois do deploy do PR 3 (conferido em `gh run list --branch main --workflow "CI/CD"`). Confere divergência, derruba views, triggers, wrappers e colunas antigas; normaliza os valores (`update … set status = 'completed' where status = 'published'`) e aperta o CHECK.

Um lote só começa o expand de uma tabela depois do contract do lote anterior na mesma tabela: expand sobre expand espelharia um espelho.

### D5. Tools de IA e MCP

- O nome da tool é contrato com o modelo. As quatro do anexo têm **zero chamadas** em `kitchen.module_chat_message`: renomeia-se sem alias. Nomes novos: `list_quantity_estimates` (no lugar de `list_atas` e `get_atas`), `get_quantity_estimate`, `update_quantity_estimate_status`; parâmetro `quantityEstimateId`.
- O rename é a hora de tirar o `untypedFrom(ctx, "procurement_list")` delas: a listagem vai para `@iefa/sisub-domain/agent` (schema, `clampLimit`, `total`), como manda `.claude/rules/ai-tools.md`.
- Os prompts (`module-chat/prompts/unit.ts`, `local-analytics.ts`) perdem a linha "nas tools ele aparece como 'ata' por nome legado". `ToolCallDisplay.tsx` troca o mapa de rótulos.
- `list_preparations` → `list_legacy_preparations` (lote 7). `list_empenhos` e `search_arp` ficam.
- O MCP não tem tool renomeada. Se algum lote vier a renomear uma, ela é contrato com cliente externo: exige alias por um ciclo e aviso no `SKILL.md` publicado em `.well-known`.
- O prompt do analytics e a allowlist `analytics-sql.ts` trocam no PR de código. Enquanto a view de compatibilidade existir, SQL gerado com o nome antigo continua respondendo.

### D6. Rotas

- Rota renomeada mantém o arquivo antigo por um ciclo de deploy, só com `beforeLoad: () => { throw redirect({ to: <nova>, params }) }`, e sai no PR do contract. `routeTree.gen.ts` se regera pelo dev server.
- Novas: `unit/$unitId/quantity-estimates/$quantityEstimateId` (+ `print/calculation-memory/…`, `print/price-research/…`), `kitchen/$kitchenId/demand-forecasts/$forecastId`, `unit/$unitId/liquidacoes`, `unit/$unitId/pagamentos`; `global/weekly-menus` a confirmar.
- `breadcrumbs.ts`, `nav-paths.test.ts` e `command-palette.nav.test.ts` mudam no mesmo PR.

### D7. API (`apps/api`)

- `/api/admin/price-research/ata/:ataId` e `/history` → `/quantity-estimates/:quantityEstimateId`. A rota é admin, com chave, fora do OpenAPI, e sem chamador no repo; o caminho antigo fica como alias um ciclo, com log de uso, e sai se ninguém o chamar. **A confirmar** se há chamador fora do repo.
- Worker `workers/pesquisa-preco` → `workers/price-research`; `analisarPrecos` → `analyzePrices`; `AmostraPreco` → `PriceSample`. O cliente que chama o endpoint `consultarMaterial` do Compras.gov.br cita o nome do endpoint no comentário.
- A API pública (`/ingredients`, `/folders`) não muda.

### D8. Gate

- **`.opengrep/rules/ubiquitous-language.yaml`**, uma regra por camada, com mensagem que aponta o nome do glossário:
  - TS (`apps/sisub/src`, `packages/sisub-domain/src`, `apps/sisub-mcp/src`, `apps/api/src`; exclui `generated.ts`, `drizzle/`, `routeTree.gen.ts`): regex de identificador (`\bata(Id|ItemId)?\b`, `[a-z]Ata[A-Z]`, `procurementList`, `pesquisaPreco`, `comprasAmostra`, `KitchenAtaDraft`, `[lL]iquidation`...), com `pattern-not-regex` para os espelhos de API (`numeroAta`, `numeroAtaRegistroPreco`, `anoAta`, `statusAta`) e para os literais de valor da ARP (`"ata"` em `ACQUISITION_INSTRUMENTS` e `OPENING_COST_SOURCES`);
  - nomes de tool (`name: "…"` em `module-chat/tools` e `sisub-mcp/src/tools`);
  - rotas (arquivos em `apps/sisub/src/routes` com segmento descartado, fora os de redirect, que saem no contract);
  - migrations novas: `create table`, `add column` e `rename to` com nome descartado, excluindo por glob as migrations anteriores, como faz `function-search-path.yaml`. `drop` não é acusado (o contract precisa citar o nome antigo);
  - rótulos: as proibições da spec `procurement-terminology` ("Publicar" no anexo, "Margem", "Suprimentos") em `components/features/local/**` e nas rotas do anexo.
- **Banco vivo:** teste de contrato de integração (no molde de `db-types-drift.contract.test.ts`) que reprova relação, coluna ou função com nome descartado, com allowlist datada para as views e colunas de compatibilidade do lote em expand. Roda no job `gate`.
- **A lista cresce por lote.** Cada PR de código acrescenta os termos que acabou de eliminar. Termo ainda em uso não entra, senão o gate nasce vermelho.
- Arquivos de gate (`.opengrep/rules/`) esperam o mantenedor.

### D9. Lotes

Tamanho: ocorrências e arquivos escritos à mão, teto (inclui comentário e texto). "Banco": objetos da migration de expand.

| Lote | Escopo | Código | Banco | Depende de |
|---|---|---|---|---|
| **0** | Esta proposta | — | — | — |
| **1** | Só TS: previsão de demanda (`KitchenAtaDraft`, `draftId`, `kitchen-draft`, rota `suprimentos`), `liquidation` → `liquidacao`, `payment` → `pagamento`, `product` → `ingredient` no TS; rotas com redirect; primeira versão do gate | ~830 ocorr. / 92 arq. (22 de teste) | nenhum | decisão da tríade `empenho`/`liquidacao`/`pagamento` |
| **2** | Anexo quantitativo: `procurement_list*` → `quantity_estimate*`, `list_id`/`procurement_list_id`/`ata*` → `quantity_estimate_id`, margem → acréscimo, `total_quantity` → `estimated_quantity`, `published` → `completed`, tools do chat, rota, API admin, analytics | ~2.800 ocorr. / 134 arq. (29 de teste) | 6 tabelas + views; 17 colunas (11 por alias da view nas tabelas renomeadas; 6 por espelho em `procurement_arp`, `procurement_arp_item`, `procurement_pesquisa_preco(_item)`, `price_research_emission`, `kitchen_demand_forecast_import`); ~52 constraints/índices; 1 valor de CHECK; `analytics_reader` | lote 1 fora do caminho (os dois mexem em `useAta`/`kitchen-draft`) |
| **3** | Pesquisa de preços e prefixos: `procurement_pesquisa_preco*` → `price_research*`, `compras_amostra` → `price_sample`, `procurement_arp*` → `arp*`, `procurement_segment*` → `segment*`; RPC e fingerprint; worker da API; regra `pncp-audit-isolation` atualizada | ~440 ocorr. / 59 arq. (14 de teste) | 8 tabelas + views; ~76 constraints/índices; 2 funções renomeadas (wrapper); 4 recriadas (`empenho_item_check_unit`, `designations_covering`, `supply_order_empenho_usage`, `procurement_arp_check_acquisition`); `compras_amostra` tem 122 mil linhas (rename só de metadado) | contract do lote 2 (colunas espelhadas em `pesquisa_preco`/`arp`) |
| **4** | Finanças no banco: `dotacao` → `received_credit`, `saldo_siafi` → `available_credit_siafi`, `ug_emitente` → `issuer_ug` | ~70 ocorr. / 11 arq. | 3 colunas espelhadas | nada (tabelas disjuntas; pode correr em paralelo aos lotes 2 e 3) |
| **5** | Valores de domínio: papéis da designação, tipos de inventário, `policy_rule.target` | ~45 ocorr. / 11 arq. | 3 CHECKs em expand/contract + atualização de dados | decisões D2 |
| **6** | SARAM: `nr_ordem`/`nrOrdem` → `saram` fora do espelho | ~260 ocorr. / 41 arq. no sisub, mais `sucont` e `rumaer` | 2 colunas espelhadas + a view do LGPD | `lgpd-military-roster-key` e decisão |
| **7** | Subsistência: arranchamento, `kitchen.rancho`, preparação legada, rótulos "Fiscal do rancho" e "Cardápio semanal" | ~170 ocorr. / 37 arq. (sem os rótulos) | 1 tabela de 43 mil linhas + view (se aprovado) | decisões D2 |

Ordem e motivo: o lote 1 não toca o banco e tira do caminho os arquivos que o lote 2 também mexeria. O 2 é o de maior valor (erro jurídico, decisão já tomada) e o que o procedimento de `20260927010000` já exercitou. O 3 precisa do contract do 2. O 4 é pequeno e independente. Os lotes 5 a 7 dependem de decisão do mantenedor e ficam por último.

## Decisões que dependem do mantenedor

1. Tríade `empenho`/`liquidacao`/`pagamento` em português, com o TS alinhado (D2), no lugar de `payment` pela regra do inglês.
2. Papéis da designação e tipos de inventário em português (lote 5), e a fonte exata de cada lista.
3. `meal_forecasts` → `kitchen.arranchamento` e o rótulo "Arranchamento".
4. `kitchen.rancho` × `kitchen.mess_halls`: mesmo conceito ou não; e o rótulo do comensal ("Rancho" ou "Refeitório").
5. Rótulo do módulo `messhall`: "Fiscal do rancho" ou o termo que a norma de subsistência usar.
6. "Planos Semanais" × "Cardápios Semanais" e a rota `global/weekly-plans`.
7. "Apoios" × `template_type = 'exception'`.
8. `credit_note` × `nc`.
9. SARAM como identificador, e a coluna da view `core.military_identity` (`saram` × `nr_ordem`).
10. Contratação planejada (segmento) × contratação de origem: rótulos e um vínculo futuro.
11. `kitchen.preparation_group` e a preparação legada do SISUBWEB.
12. Chamador externo da rota admin `/api/admin/price-research/ata/:ataId`.
13. Fontes marcadas "a confirmar" no glossário (CEAFA, SARAM, arranchamento, ordem de fornecimento, Decreto 11.246/2022, IN SEDAP 205/1988, MCASP, Manual SIAFI).
14. Toda migration (expand e contract) e todo PR de gate dos lotes.

## Risks / Trade-offs

- **Lote 2 é grande** (~134 arquivos). Mitigação: o banco aceita os dois nomes durante o expand, então o PR de código pode ser dividido por camada (domínio → server fns → componentes → rotas/tools), cada parte verde sozinha.
- **Função plpgsql esquecida** passaria pela view de compatibilidade e quebraria no contract. Mitigação: o expand confere `pg_proc.prosrc` pelo nome antigo (como fez `20260927010000`), e o teste do banco vivo (D8) reprova depois do contract.
- **SQL do analytics com nome antigo** em conversas salvas: o modelo reescreve a consulta com o prompt novo; o histórico só exibe.
- **URL antiga em favorito**: coberta pelo redirect de um ciclo.
- **Gate com falso positivo** (`ata` em "data" ou nas colunas da ARP): as regex usam fronteira de identificador e `pattern-not-regex` para os espelhos; cada termo entra com um caso de teste da própria regra.
- **Fonte citada errada** no glossário: por isso "a confirmar" em vez de dispositivo inventado; o lote que usa a fonte confere antes.

## Migration Plan

Nenhuma migration nesta change. Os lotes 2 a 7 seguem D4; cada migration nova confere colisão de timestamp (`ls packages/database/supabase/migrations | grep -oE '^[0-9]{14}' | sort | uniq -d`) e roda `db:push --dry-run` antes.
