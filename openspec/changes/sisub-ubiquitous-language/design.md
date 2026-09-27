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
| `rancho` (ambíguo: refeitório, cozinha ou unidade conforme a frase; classificação em D10) | banco (`kitchen.rancho`, `workforce_submission.rancho_id`, views `core.rancho` e `core.workforce_submission`, 8 comentários, 3 registros de dado), TS, tela, prompts, API (`/api/rancho_previsoes`), docs | 675 / 118; mais 119 / 51 em `apps/docs`, `sucont`, `alpha`, `forms`, `contrate`, e2e e `openspec` | 50 |
| `mess_hall(s)` | banco, TS, rota `messhall/$messHallId` | 1.387 / 154 | 254 |
| `meal_forecast(s)`, `forecast` do comensal, `rancho_previsoes` (= arranchamento) | banco (43 mil linhas), TS (`useMealForecast`, `forecast.fn.ts`, `operations/forecast.ts`, `UpsertForecast`...), rota `diner/forecast`, API `/api/rancho_previsoes` (OpenAPI, restrita) | 540 / 67 (15 de teste; sem a previsão de demanda nem `forecasted_headcount`) | 19 |
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
2. **Teste da NSCA** (AGENTS.md). Inglês quando o leitor da norma reconheceria o termo; português quando não há equivalente fiel ou o inglês é falso cognato (`liquidation`). Exceção registrada: `pagamento` (D2).
3. **Siglas consagradas** podem ser identificador (`arp`, `nd`, `ptres`, `uasg`, `saram`...).
4. **Sem prefixo redundante.** O schema já diz o domínio: `procurement.procurement_arp` → `procurement.arp`.
5. **Valor de domínio na língua da norma** quando o valor é uma categoria da norma ou do ofício (tipo de contratação, papel na ata, tipo de empenho, papel do agente, tipo de inventário, tipo de cardápio). Estado de fluxo do próprio sistema (`draft`, `sent`, `open`, `provisional`) fica em inglês.
6. **Termo ambíguo sai.** Palavra que nomeia conceitos diferentes conforme a frase não é linguagem ubíqua, mesmo sendo corrente no ofício. É o caso de "rancho" (D10): usa-se sempre **cozinha** (`kitchen`), **refeitório** (`mess_hall`) ou **unidade** (`unit`, a OM). Única exceção: o nome próprio da função **Fiscal de rancho**.
7. **Prioridade** para decidir o que entra num lote:
   - P1, termo da norma para outro conceito (erro jurídico): `ata` para o anexo, `published`, `margin`, `dotacao`, `liquidation`, "Fiscal" sozinho;
   - P2, um conceito com vários nomes, ou um nome com vários conceitos: `pesquisa_preco` × `price_research`, `draft` × `forecast` × `suprimentos`, `product` × `ingredient`, `list_id` × `procurement_list_id` × `ata_id`, "rancho";
   - P3, prefixo redundante;
   - P4, coluna legada em português sem conflito: fora (Não-objetivos).

### D2. Decisões caso a caso

Decisões do usuário de 2026-09-27 marcadas **(usuário)**; as demais seguem o padrão defensável, com o motivo. "A confirmar" agora só marca fonte não conferida.

| Caso | Decisão | Motivo |
|---|---|---|
| Anexo quantitativo | `quantity_estimate` **(usuário)** | Lei 14.133, art. 18, § 1º, IV; art. 6º, XXIII. Só a ARP é ata (art. 6º, XLVI) |
| `empenho` / `liquidacao` / `pagamento` | **Ficam em português (usuário)**, nas tabelas e no TS (`liquidation*` → `liquidacao*`, `payment*` → `pagamento*`; rotas `liquidacoes`, `pagamentos`). `pagamento` é **exceção registrada** à regra do inglês | são as fases da despesa da Lei 4.320, arts. 58-65. `empenho` não tem equivalente fiel; `liquidation` é falso cognato; `payment` seria fiel, mas quebraria a tríade, e as colunas das três já são portuguesas (`numero_ob`, `liquidacao_id`) |
| `pesquisa_preco` × `price_research` | `price_research` | "Price research" é reconhecível como pesquisa de preços (IN SEGES/ME 65/2021); `price_research_emission` já nasceu assim |
| `compras_amostra` | `procurement.price_sample`; as colunas espelham a API do Compras.gov.br e ficam (`id_compra`, `descricao_item`, `ni_fornecedor`...) | o nome da tabela é nosso; o das colunas é do terceiro |
| `budget_credit.dotacao` | `received_credit`; `saldo_siafi` → `available_credit_siafi` | Numa UG executora, dotação é da LOA no órgão; o que chega por NC é crédito recebido, e o saldo é o crédito disponível (MCASP). A tela já rotula assim (D11 de `sisub-flexible-expense-execution`), que deixou a coluna por medo de quebrar a `main`; o espelho por trigger resolve isso |
| `purchase_item` | Fica | "Purchase item" = item de compra; a descrição dele é a especificação do produto (Lei 14.133, art. 40, § 1º, I, inciso a confirmar) |
| `supply_order` | Fica; rótulo "Ordem de fornecimento" | "Supply order" é fiel. Fonte a confirmar: prática; a Lei 14.133, art. 95, fala em "autorização de compra" como substitutivo do contrato; o D9 do planejamento citou art. 6º, X |
| `goods_receipt` | Fica; `status` `provisional`/`definitive` fica (estado de fluxo) | Lei 14.133, art. 140, II, a e b |
| `contract_designation` | Tabela fica; `role` passa a `gestor` · `fiscal_tecnico` · `fiscal_administrativo` · `fiscal_setorial` · `membro_comissao` | categorias do Decreto 11.246/2022 (dispositivos a confirmar) e da comissão do art. 140, II, b; hoje em inglês (`technical_inspector`...) |
| `kitchen_demand_forecast` | Fica (já renomeada); o TS sai de `KitchenAtaDraft`/`draftId`/`kitchen-draft` para `DemandForecast`/`forecastId`/`demand-forecast`; rota `kitchen/$kitchenId/demand-forecasts/$forecastId` | concluir o rename que parou no banco |
| `stock_issue_request` | Fica; rótulo da entidade "Requisição" | "Issue request" = requisição de material (IN SEDAP 205/1988, item a confirmar) |
| `inventory_count` | Fica; `type` passa a `anual` · `transferencia_responsabilidade` · `eventual` · `rotativo`; rótulo "Inventário físico" em vez de "Contagem Física" | tipos de inventário da IN SEDAP 205/1988 (item e lista a confirmar; "rotativo" pode vir de outra norma) |
| `monthly_closing` | Fica | fechamento mensal (MCASP, capítulo a confirmar) |
| "Rancho" | **Sai da linguagem ubíqua (usuário)**: cozinha (`kitchen`), refeitório (`mess_hall`), unidade (`unit`). Classificação de cada ocorrência e destino de `kitchen.rancho` em D10 | ambíguo: "rancho dos oficiais" é um refeitório; "rancho da DIRAD" é uma cozinha com os seus refeitórios |
| Módulo de presença | Rótulo **"Fiscal de rancho" (usuário)**; o ID `messhall` fica | é o nome da função na escala de serviço e a única ocorrência permitida de "rancho", como nome próprio. Distinto do fiscal do contrato (Lei 14.133, art. 117), que é designação (`contract_designation`) |
| `meal_forecasts` | `kitchen.arranchamento` **(usuário)**; identificador `arranchamento`, tela "Arranchamento"; derivados em D11 | o militar se arrancha (declara que vai comer); presença é o comparecimento. "Meal forecast" é a estimativa agregada (`daily_menu.forecasted_headcount`, que fica), não o ato individual |
| `meal_presences` / `other_presences` | Ficam | "presence" é fiel; `analytics.v_meal_presences_with_user` e `kitchen.v_meal_presences_with_user` não citam o arranchamento e ficam |
| `recipes` | Fica (`recipe` = preparação; "Ficha técnica" é o documento impresso dela) | reconhecível; `kitchen.recipes` está na publicação Realtime e tem 5,7 mil ocorrências |
| `preparation` no código | Nunca sozinho: `frozen_preparation` fica (preparação congelada); a preparação legada do SISUBWEB (em `kitchen.ingredient`, tool `list_preparations`) vira `legacy_preparation` / `list_legacy_preparations`; `kitchen.preparation_group` fica (é o grupo dessas preparações legadas; renomear sem mudar o modelo não tira a ambiguidade) | a tela chama `recipe` de "Preparação" |
| `ingredient` / `insumo` | `ingredient` fica (rótulo "Insumo"); `core.item.kind = 'insumo'` fica; `product` sai (`policy_rule.target = 'product'` → `'ingredient'`) | custo de 6,5 mil ocorrências e API pública; o nome antigo `product` é só dívida |
| `ceafa` | Fica (sigla) | termo do COMAER sem equivalente; expansão da sigla e norma a confirmar |
| `credit_note` | **Fica**; o rótulo usa a sigla "NC" | "credit note" é tradução fiel de "nota de crédito"; a sigla consagrada fica na tela, onde o usuário a reconhece |
| `ug_emitente` × `issuer_ug` | `issuer_ug` nas duas | um conceito, dois nomes na mesma schema |
| SARAM | `saram` em objeto nosso (`core.person.nr_ordem`, `core.user_data."nrOrdem"` e a coluna da view `core.military_identity`, já alinhada na proposta `lgpd-military-roster-key`); `core.user_military_data."nrOrdem"` fica (espelho da carga externa) | sigla consagrada |
| Contratação planejada × contratação de origem | **Dois conceitos, dois nomes.** Contratação planejada = `segment` (`procurement.segment`): o recorte do que a OM compra num mesmo processo, no calendário do PCA, antes da seleção do fornecedor. Contratação de origem = `acquisition` (`procurement.acquisition`): a contratação já feita (licitação, SRP, dispensa, inexigibilidade...) que sustenta o empenho. Rótulos "Contratação planejada" e "Contratação de origem", nunca "contratação" sozinho | o segmento é planejamento (Decreto 10.947/2022); a origem é o direito de gastar. Ligar um ao outro (o segmento que virou licitação) é mudança de modelo, fora desta change |
| Status do anexo | `published` → `completed` | spec `procurement-terminology`: "publicar" é divulgar no PNCP (art. 54) |
| Acréscimo de quantidade | `max_margin_percent` → `max_increase_percent`; `margin_justification` → `max_quantity_justification`; `total_quantity` → `estimated_quantity` | margem é a de preferência (art. 26); quantidade estimada (art. 18, § 1º, IV) e máxima (art. 82, I) |
| `cost_source = 'ata'` (saldo inicial) e `instrument = 'ata'` (contratação) | Ficam | são a ARP de fato (art. 6º, XLVI); só o rótulo "ATA (preço homologado)" passa a "ARP (preço registrado)" |
| "Planos Semanais" × "Cardápios Semanais" | **"Cardápio semanal"** (o global com "modelo"); rota `global/weekly-plans` → `global/weekly-menus` | termo da nutrição; mesma tabela `menu_template` (`template_type = 'weekly'`) |
| "Apoios" × `template_type = 'exception'` | Valor **`apoio`** em `menu_template.template_type` e `menu_items.origin_template_type`; rótulo "Cardápio de apoio" | a tela descreve "refeições previsíveis fora da rotina semanal (lanches de bordo e de apoio, coffee breaks)": não é exceção. Homônimo registrado: `menu_template.snack_family = 'apoio'` é o **lanche** de apoio, rotulado sempre "Lanche de apoio". `weekly` e `event` ficam (fiéis) |
| Rota admin `/api/admin/price-research/ata/:ataId` | Renomear para `/quantity-estimates/:quantityEstimateId`; o caminho antigo fica **um ciclo** como alias com aviso de depreciação | sem chamador no repo; o alias cobre um chamador externo desconhecido |

### D3. O que não se renomeia

| O quê | Por quê |
|---|---|
| `compras_gov_integration.compras_material_*`, `compras_servico_*`, `pncp_pca_*`; colunas de `price_sample`; `numero_ata`, `ano_ata`, `status_ata`, `quantidade_homologada`, `quantidade_empenhada`, `saldo_empenho` da ARP; `nfe_item` (layout da NF-e); `siafi_integration.import_row.raw` | espelham API ou layout de terceiro; o nome é o do terceiro, e casar pelo nome é o que torna a sincronização conferível |
| Nome de terceiro com "rancho": UG `120279` "RANCHO-DIRAD" / "RANCHO CONCEITO DA DIRETORIA DE ADM.DA AERON." (`sucont`, título do SIAFI), PI como `PIRANCHO` (fixture de teste com valor do SIAFI) | é o nome no sistema de origem |
| Texto livre de usuário com "rancho": 127 respostas em `kitchen.opinions`, 3 observações em `kitchen.workforce_note` | é o que a pessoa escreveu; linguagem ubíqua é do sistema, não do usuário |
| `core.user_military_data` | carga externa (ver `lgpd-military-roster-key`) |
| IDs de módulo do PBAC | dado de permissão; renomear é mudança de acesso |
| `kitchen.recipes`, `kitchen.daily_menu`, `kitchen.menu_items` | publicação Realtime (renomear derruba a assinatura dos clientes abertos) e nome reconhecível |
| `unit`/`unit_id` (= OM), `kitchen.kitchen` | FK em quase toda tabela escopada; o comentário da tabela já registra a escolha |
| `finance.empenho`, `liquidacao`, `pagamento` e suas colunas | D2 |
| valores de estado de fluxo em inglês | D1, critério 5 |
| migrations aplicadas | são o histórico |
| views de compatibilidade `core.kitchen`, `core.mess_halls` | pertencem ao contract da promoção do núcleo (`20260901120400`). `core.rancho` e `core.workforce_submission` saem com o lote 8 (D10) |

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
- `list_preparations` → `list_legacy_preparations` (lote 1). `list_empenhos` e `search_arp` ficam. Nenhuma tool lê o arranchamento.
- Prompts com "rancho": `module-chat/prompts/kitchen.ts` ("linguagem técnica militar (rancho, comensal, efetivo)") passa a "refeitório, comensal, efetivo"; `analytics-prompt.ts` ("mess_halls (ranchos)") passa a "refeitórios"; o glossário publicado aos agentes em `agent-discovery.ts` ("**rancho** — refeitório/cozinha da organização militar", a própria ambiguidade) troca por três entradas: cozinha, refeitório, unidade.
- O MCP não tem tool renomeada. Se algum lote vier a renomear uma, ela é contrato com cliente externo: exige alias por um ciclo e aviso no `SKILL.md` publicado em `.well-known`.
- O prompt do analytics e a allowlist `analytics-sql.ts` trocam no PR de código (anexo no lote 2; `meal_forecasts` → `arranchamento` no lote 7). Enquanto a view de compatibilidade existir, SQL gerado com o nome antigo continua respondendo.

### D6. Rotas

- Rota renomeada mantém o arquivo antigo por um ciclo de deploy, só com `beforeLoad: () => { throw redirect({ to: <nova>, params }) }`, e sai no PR do contract (ou no PR seguinte, para lote sem banco). `routeTree.gen.ts` se regera pelo dev server.
- Novas: `unit/$unitId/quantity-estimates/$quantityEstimateId` (+ `print/calculation-memory/…`, `print/price-research/…`), `kitchen/$kitchenId/demand-forecasts/$forecastId`, `unit/$unitId/liquidacoes`, `unit/$unitId/pagamentos`, `global/weekly-menus`, `diner/arranchamento`, `global/support-menus` e `kitchen/$kitchenId/support-menus` (no lugar de `*/exceptions`).
- `breadcrumbs.ts`, `nav-paths.test.ts` e `command-palette.nav.test.ts` mudam no mesmo PR.

### D7. API (`apps/api`)

- `/api/admin/price-research/ata/:ataId` e `/history` → `/quantity-estimates/:quantityEstimateId`. A rota é admin, com chave, fora do OpenAPI, e sem chamador no repo. O caminho antigo fica um ciclo como alias, com cabeçalho `Deprecation`, `Link` para o novo e log de uso, e sai no contract do lote 2.
- `/api/rancho_previsoes` (OpenAPI, tag "Previsões de Refeições", em `RESTRICTED_PATHS`) → `/api/arranchamentos`, tag "Arranchamento". O alias antigo fica um ciclo com o mesmo aviso de depreciação e **continua em `RESTRICTED_PATHS`**: alias fora da lista seria rota anônima para o rastro de quem come onde (lote 7).
- Worker `workers/pesquisa-preco` → `workers/price-research`; `analisarPrecos` → `analyzePrices`; `AmostraPreco` → `PriceSample`. O cliente que chama o endpoint `consultarMaterial` do Compras.gov.br cita o nome do endpoint no comentário.
- A API pública de catálogo (`/ingredients`, `/folders`) não muda.

### D8. Gate

- **`.opengrep/rules/ubiquitous-language.yaml`**, uma regra por camada, com mensagem que aponta o nome do glossário:
  - TS (`apps/sisub/src`, `packages/sisub-domain/src`, `apps/sisub-mcp/src`, `apps/api/src`; exclui `generated.ts`, `drizzle/`, `routeTree.gen.ts`): regex de identificador (`\bata(Id|ItemId)?\b`, `[a-z]Ata[A-Z]`, `procurementList`, `pesquisaPreco`, `comprasAmostra`, `KitchenAtaDraft`, `[lL]iquidation`, `mealForecast`...), com `pattern-not-regex` para os espelhos de API (`numeroAta`, `numeroAtaRegistroPreco`, `anoAta`, `statusAta`) e para os literais de valor da ARP (`"ata"` em `ACQUISITION_INSTRUMENTS` e `OPENING_COST_SOURCES`);
  - **"rancho"**: `(?i)rancho` proibido em identificador e em literal de texto de tela (JSX, `title`, `label`, `description`, `placeholder`, mensagens de erro e de toast, prompts), com duas exceções: `pattern-not-regex: (?i)fiscal de rancho` (nome da função) e as palavras-chave de busca do menu (`keywords: [...]` em `NavItems.tsx`), onde "rancho" fica para quem procura pelo termo antigo e não é rótulo. A mensagem diz: "use cozinha (`kitchen`), refeitório (`mess_hall`) ou unidade (`unit`); 'rancho' é ambíguo". Comentário de código não é acusado; a limpeza dos comentários fica no lote 8;
  - nomes de tool (`name: "…"` em `module-chat/tools` e `sisub-mcp/src/tools`);
  - rotas (arquivos em `apps/sisub/src/routes` com segmento descartado, fora os de redirect);
  - migrations novas: `create table`, `add column`, `rename to` e `comment on` com nome descartado (inclui "rancho", salvo "Fiscal de rancho"), excluindo por glob as migrations anteriores, como faz `function-search-path.yaml`. `drop` não é acusado (o contract precisa citar o nome antigo);
  - rótulos: as proibições da spec `procurement-terminology` ("Publicar" no anexo, "Margem", "Suprimentos") em `components/features/local/**` e nas rotas do anexo.
- **Banco vivo:** teste de contrato de integração (no molde de `db-types-drift.contract.test.ts`) que reprova relação, coluna, função ou comentário com nome descartado, com allowlist datada para as views e colunas de compatibilidade do lote em expand. Roda no job `gate`. Dado de cadastro e texto livre não entram (D3).
- **A lista cresce por lote.** Cada PR de código acrescenta os termos que acabou de eliminar. Termo ainda em uso não entra, senão o gate nasce vermelho. "Rancho" entra com o lote 8a para texto e identificador fora do efetivo, e com o 8b para o resto.
- Arquivos de gate (`.opengrep/rules/`) esperam o mantenedor.

### D9. Lotes

Tamanho: ocorrências e arquivos escritos à mão, teto (inclui comentário e texto). "Banco": objetos da migration de expand.

| Lote | Escopo | Código | Banco | Depende de |
|---|---|---|---|---|
| **0** | Esta proposta | — | — | — |
| **1** | Só TS e tela: previsão de demanda (`KitchenAtaDraft`, `draftId`, `kitchen-draft`, rota `suprimentos`), `liquidation` → `liquidacao`, `payment` → `pagamento`, `product` → `ingredient` no TS, `list_legacy_preparations`; rótulos "Cardápio semanal" (rota `global/weekly-menus`), "Cardápio de apoio", "Inventário físico", "Pesquisa de preços", "ARP (preço registrado)", "Contratação planejada"; rotas com redirect; primeira versão do gate | ~900 ocorr. / ~100 arq. (22+ de teste) | nenhum | nada |
| **2** | Anexo quantitativo: `procurement_list*` → `quantity_estimate*`, `list_id`/`procurement_list_id`/`ata*` → `quantity_estimate_id`, margem → acréscimo, `total_quantity` → `estimated_quantity`, `published` → `completed`, tools do chat, rota, API admin com alias depreciado, analytics | ~2.800 ocorr. / 134 arq. (29 de teste) | 6 tabelas + views; 17 colunas (11 por alias da view nas tabelas renomeadas; 6 por espelho em `procurement_arp`, `procurement_arp_item`, `procurement_pesquisa_preco(_item)`, `price_research_emission`, `kitchen_demand_forecast_import`); ~52 constraints/índices; 1 valor de CHECK; `analytics_reader` | lote 1 fora do caminho (os dois mexem em `useAta`/`kitchen-draft`) |
| **3** | Pesquisa de preços e prefixos: `procurement_pesquisa_preco*` → `price_research*`, `compras_amostra` → `price_sample`, `procurement_arp*` → `arp*`, `procurement_segment*` → `segment*`; RPC e fingerprint; worker da API; regra `pncp-audit-isolation` atualizada | ~440 ocorr. / 59 arq. (14 de teste) | 8 tabelas + views; ~76 constraints/índices; 2 funções renomeadas (wrapper); 4 recriadas (`empenho_item_check_unit`, `designations_covering`, `supply_order_empenho_usage`, `procurement_arp_check_acquisition`); `compras_amostra` tem 122 mil linhas (rename só de metadado) | contract do lote 2 (colunas espelhadas em `pesquisa_preco`/`arp`) |
| **4** | Finanças no banco: `dotacao` → `received_credit`, `saldo_siafi` → `available_credit_siafi`, `ug_emitente` → `issuer_ug` (com `siafi_integration.apply_document_row` recriada) | ~70 ocorr. / 11 arq. | 3 colunas espelhadas | nada (tabelas disjuntas; pode correr em paralelo aos lotes 2 e 3) |
| **5** | Valores de domínio: papéis da designação, tipos de inventário, `policy_rule.target`, `template_type`/`origin_template_type` `exception` → `apoio` (com as rotas `*/exceptions` → `*/support-menus`) | ~85 ocorr. / ~25 arq. | 5 CHECKs em expand/contract + atualização de dados | nada |
| **6** | SARAM: `nr_ordem`/`nrOrdem` → `saram` fora do espelho | ~260 ocorr. / 41 arq. no sisub, mais `sucont` e `rumaer` | 2 colunas espelhadas + a view do LGPD | `lgpd-military-roster-key` |
| **7** | Arranchamento: `kitchen.meal_forecasts` → `kitchen.arranchamento` e derivados (D11); rota `diner/arranchamento`; API `/api/arranchamentos` com alias restrito; analytics | ~540 ocorr. / 67 arq. (15 de teste) | 1 tabela (43 mil linhas) + view; 4 índices e 2 constraints renomeados; grant de `analytics_reader` | nada no banco; no código, depois do lote 8a (os dois mexem nas telas do Comensal) |
| **8a** | "Rancho" fora do efetivo: textos e rótulos (Comensal, analytics, presença, lanche, produção, fluxos, prompts, `agent-discovery`, docs), "Fiscal de rancho" no módulo, "chefe do rancho" → Gestão Unidade, `constants/rancho.ts` desfeito, comentários; gate do "rancho" para o que saiu | ~210 ocorr. / ~90 arq. (sisub) + ~119 / 51 fora (docs, e2e, openspec, forms, contrate, alpha) | nenhum (os 3 registros de dado vão pela tela, D10) | nada |
| **8b** | "Rancho" no efetivo: `kitchen.rancho` e `workforce_submission.rancho_id` (D10), identificadores do efetivo (`RanchoWorkforce*`, `computeRanchoMetrics`, `ranchoId`, `createRancho`...), views `core.rancho`/`core.workforce_submission`, 8 comentários do banco | ~320 ocorr. / ~25 arq. | rename (tabela + coluna + ~12 constraints/índices) ou fusão em `mess_halls` (D10) | decisão do mantenedor entre fusão e rename |

Ordem e motivo: o lote 1 não toca o banco e tira do caminho os arquivos que o lote 2 também mexeria. O 2 é o de maior valor (erro jurídico, decisão já tomada) e o que o procedimento de `20260927010000` já exercitou. O 3 precisa do contract do 2. O 4, o 5 e o 8a são pequenos ou sem banco e podem correr em paralelo. O 7 vem depois do 8a para não disputar as telas do Comensal. O 6 espera a change do LGPD. O 8b espera a decisão de modelo.

### D10. "Rancho": classificação das ocorrências

"Rancho" nomeia três coisas conforme a frase. Cada ocorrência foi lida e classificada; a substituição segue a classe.

**Banco**

| Objeto | O que é de fato | Classe | Destino |
|---|---|---|---|
| `kitchen.rancho` (66 linhas) | Roster da matriz de efetivo da SDAB ("PLANILHA MATRIZ - GESTORES", `20260827163000_workforce_matrix.sql`): cada linha é um ponto que responde pelo efetivo da subsistência. **62 de 66** apontam para um refeitório (`mess_hall_id`) distinto, sem repetição, com `kitchen_id` e `unit_id` **idênticos** aos do refeitório; os 4 sem refeitório são ICIA, II COMAR, NuHANT (refeitórios não cadastrados) e "EEAR (cozinha oficiais)". `produces_own_meals` e `active` são `true` nas 66; `elo_code` = código da unidade em 64, e diverge só em HFAB e BABV (a própria migration chama o BABV de bug de cadastro). 7 refeitórios não têm linha | **refeitório** (o refeitório visto pelo levantamento de efetivo) | D10.1 |
| `kitchen.workforce_submission.rancho_id` (+ FK, índice) | resposta da competência por ponto | refeitório | `mess_hall_id` (fusão) ou `mess_hall_workforce_id` (rename) |
| view `core.rancho`, `core.workforce_submission.rancho_id` | compatibilidade da promoção do núcleo | — | saem no lote 8b |
| sequência `rancho_id_seq`, constraints `rancho_*` (4), índices `rancho_*` (6), `workforce_submission_rancho_*` | nome herdado | refeitório | acompanham o destino |
| comentários: `kitchen.rancho` e colunas `elo_code`, `mess_hall_id`; `workforce_submission`, `workforce_headcount`, `workforce_note.kind` | efetivo por ponto | refeitório | reescritos no lote 8b |
| comentário de `kitchen.snack_request_material` ("material de rancho… voltam ao rancho") | material da cozinha cautelado | **cozinha** | "material da cozinha… voltam à cozinha" (lote 8a) |
| funções `rancho_presencas_view_*`, `others_presence_*` | removidas em `20260926219000` | — | nada |
| dado: `kitchen.mess_halls` código e nome "Rancho" (EEAR) | o refeitório geral da EEAR | refeitório | renomear o registro pela tela Locais (cadastro, não migration) |
| dado: `kitchen.rancho.display_name` "EEAR (cozinha central)", "EEAR (cozinha oficiais)" | pontos da EEAR que a matriz nomeia pela cozinha | refeitório (pelo vínculo) | resolvido no D10.1 |
| dado: `procurement.policy_rule` (2 regras "Sem itens impróprios para rancho militar FAB") | alimentação coletiva militar | **unidade** (a subsistência da OM) | texto "impróprios para a alimentação coletiva militar", por update de dado no lote 8a |
| dado: `iefa.apps` (descrição do sisub: "analytics do rancho") | a subsistência | unidade | "analytics da subsistência" (lote 8a) |
| texto livre (`kitchen.opinions` 127, `workforce_note` 3) | o que o usuário escreveu | — | fica (D3) |

**Código e tela** (contagem aproximada, escrito à mão)

| Classe | Onde | Ocorr. / arq. | Exemplos e substituição |
|---|---|---|---|
| **refeitório** (entidade do efetivo, `kitchen.rancho`) | `operations/workforce.ts`, `utils/workforce-metrics*`, `schemas/workforce.ts`, `workforce.fn.ts`, `components/features/workforce/*`, rotas `*/workforce`, `database/src/sisub.ts` (`Rancho`, `RanchoInsert`), `training.ts`, `assurance-registry.ts`, reset guard | ~320 / ~25 | `ranchoInKitchen`, `ranchoId`, `RanchoWorkforceMetrics`, `computeRanchoMetrics`, `createRancho`, "Efetivo dos Ranchos", "Guarnição dos ranchos por ELO" → "Efetivo da subsistência", "por refeitório" (lote 8b) |
| **refeitório** (onde o comensal come e é fiscalizado) | Comensal (`DefaultMessHallSelector`, `MessHallSelector`, `DayCard`, `forecast.tsx`, `self-check-in`, `menu`, `qr-code`, `tutorial`, `auth/index`), analytics (`DashboardFilters`, `DashboardCard`, `MessHallBreakdown`), presença (`PresenceTable*`, `FiscalDialog`, `messhall.fn`, `presence.fn`, `places.ts`, `presence.ts`), tipos (`meal.ts`: "Mess Hall (Rancho)"), `NavItems` (palavras-chave), `analytics-prompt`, `searchable-select` ("Todos os ranchos"), avaliação ("experiência no Rancho"), lanche ("escala sem apoio de rancho", "refeição no rancho", `snack-entitlement`), `cardapio-print` ("prato do rancho"), `pbac/types.ts` ("messhall: Rancho"), docs `pbac/modulos.mdx` ("Operador/Gestor de rancho") | ~140 / ~50 | "Selecione um refeitório", "Refeitório padrão", "Todos os refeitórios", "escala sem refeitório", "Operador de refeitório" / "Gestor de refeitório" (níveis 1 e 3 do `messhall`); o nível 2 fica "Fiscal de rancho" |
| **cozinha** | lanche (material cautelado "volta ao rancho/à cozinha", `snack-kit`, `snack-requests.ts`, `SnackRequestDetailView`, `KitchenSnackRequestDetail`, `SnackRequestActions`), produção (`SnackRequestTag` com a chave `"rancho"` para a produção regular, `production.ts` "Nulo = rancho"), planejamento (`planning-adjustments`, `templates.ts`, `schemas/templates`, `schemas/planning`, `OccasionMenuEditor`, `SnackDayPanel`: "tipos de refeição do rancho", "planejamento do rancho"), `ata-quantity-limits` ("segura o rancho numa anormalidade"), `pncp-pca-csv` ("apoio direto ao rancho"), `kitchen.ts` (prompt), exemplos "Rancho de Manobra" (`occasion-menu.ts`, `events/$eventId.tsx`), `expense-execution.test.ts` ("Rancho A" é nome de cozinha) | ~35 / ~20 | "material da cozinha", chave `"daily_menu"` / "item do cardápio", "planejamento da cozinha", exemplo "Refeição de campanha" |
| **unidade** (a OM e sua subsistência) | "chefe do rancho" (`designations.ts`, `receiving-pending.ts`, e2e, specs), "execução da despesa do rancho" (`expense-execution*`, rota), "O rancho é rápido" (`execution.ts`, testes), "aquisição do rancho" (`AcquisitionsPanel`), "compra fora do rancho" (`SegmentationEditor`, `procurement-planning.ts`), `agent-discovery` ("analytics do rancho"; "rancho — refeitório/cozinha da organização militar"), `NavItems` ("uso diário do rancho"), docs `sisub/index.mdx` | ~20 / ~15 | "chefe do rancho" → "quem tem Gestão Unidade" ("Peça a designação à Gestão Unidade → Designações"); "despesa da unidade"; "compra fora da subsistência" |
| **arranchamento** (nome legado da tabela) | API `/api/rancho_previsoes`, `routes.ts`, testes de integração, `DashboardService`, `dashboard.ts` | ~15 / 6 | lote 7 (D7) |
| **nome de terceiro** | `sucont` (UG "RANCHO-DIRAD"), fixture `PIRANCHO` | 3 / 2 | fica (D3) |
| **fora do sisub** | `alpha` (fixtures "rancho do IAE"), `rumaer` (descrição de calçado "estoque de rancho", dado de outro app), `sucont/sacdgc/prompt.ts` ("Elos Usuários (ranchos apoiados)") | ~6 / 5 | registrado; troca no app dono, quando mexer |
| **nome próprio da função** | "Fiscal de Rancho" (`policies/labels.ts`, `qr-code.tsx`, exemplo de política) | 3 / 3 | fica, grafado "Fiscal de rancho" |

#### D10.1 Destino de `kitchen.rancho`

- **Rename** (sem mudar o modelo): `kitchen.rancho` → `kitchen.mess_hall_workforce`, `workforce_submission.rancho_id` → `mess_hall_workforce_id`, na técnica de D4 (declaração no guard, view de compatibilidade, contract). Tira a palavra, mas mantém uma segunda tabela de refeitórios que repete `kitchen_id` e `unit_id` e pode divergir de `mess_halls` sem aviso.
- **Fusão** (refatoração, change própria `sisub-workforce-by-mess-hall`): o efetivo passa a ser por refeitório. (1) Cadastrar os refeitórios que faltam (ICIA, II COMAR, NuHANT) e decidir se "EEAR (cozinha oficiais)" é o refeitório dos oficiais da EEAR; (2) `workforce_submission.mess_hall_id` com backfill por `rancho.mess_hall_id`; (3) `elo_code` vira coluna de `mess_halls` só onde diverge da unidade, ou se corrige o cadastro do BABV e do HFAB; (4) leitores do efetivo passam a `mess_halls`; (5) contract derruba `kitchen.rancho`, `core.rancho` e a coluna antiga.
- **Recomendação: fusão.** Os dados mostram um só conceito (62 de 66 em 1:1, sem divergência de cozinha ou unidade), e o rename seria um passo que a fusão desfaria. Se o mantenedor preferir não mudar o modelo agora, o rename é a saída, e a fusão fica como dívida registrada. Os identificadores do efetivo no TS esperam essa decisão, para não serem trocados duas vezes.

### D11. Arranchamento: nomes derivados

| Hoje | Novo |
|---|---|
| `kitchen.meal_forecasts` (índices `meal_forecasts_*`, `meal_forecasts_meal_check`, `meal_forecasts_user_id_date_meal_key`) | `kitchen.arranchamento` (`arranchamento_*`) |
| `mealForecastsInKitchen` (Drizzle), `ForecastRecord`, `MealForecastHook` | `arranchamentoInKitchen`, `ArranchamentoRecord`, `ArranchamentoHook` |
| `operations/forecast.ts`: `listMealForecasts`, `upsertForecast`, `deleteForecast`, `listForecastMap` | `operations/arranchamento.ts`: `listArranchamentos`, `upsertArranchamento`, `deleteArranchamento`, `listArranchamentoMap` |
| `schemas/meal-ops.ts`: `UpsertForecast(Schema)`, `DeleteForecast(Schema)`, `ListMealForecasts(Schema)`, `ListForecastMap(Schema)`, `FetchUserMealForecast(Schema)` | `UpsertArranchamento`, `DeleteArranchamento`, `ListArranchamentos`, `ListArranchamentoMap`, `FetchUserArranchamentos` |
| `server/forecast.fn.ts` (`upsertForecastFn`, `deleteForecastFn`, `fetchUserMealForecastFn`), `hooks/data/useMealForecast.ts`, `userMealForecastQueryOptions`, `lib/forecast.ts` | `server/arranchamento.fn.ts`, `hooks/data/useArranchamento.ts`, `userArranchamentoQueryOptions`, `lib/arranchamento.ts` |
| rota `diner/forecast`, rótulo "Previsão" | `diner/arranchamento`, "Arranchamento" (palavra-chave "previsão" fica na busca) |
| contagens `forecast_count`, `forecast_users`, `total_forecast`, `pendingForecasts` (painéis) | `arranchados_count`, `arranchados_users`, `total_arranchados`, `pendingArranchamentos` |
| API `/api/rancho_previsoes` | `/api/arranchamentos` (D7) |
| `daily_menu.forecasted_headcount`, `forecastedHeadcount` (tools `create_daily_menu`, `update_menu_headcount`, MCP) | **ficam**: é a previsão de comensais (agregada), o conceito certo para "forecast" |
| `analytics.v_meal_presences_with_user`, `kitchen.v_meal_presences_with_user` | ficam: são de presença e não citam o arranchamento |
| `will_eat` | fica ("vai comer"; `false` = desarranchado) |

Plural em TS: `arranchamentos`. A tabela fica no singular, como `finance.empenho`.

## Decisões que dependem do mantenedor

As decisões de nome foram tomadas pelo usuário em 2026-09-27 (D2). Ficam com o mantenedor:

1. `kitchen.rancho`: fusão em `mess_halls` (recomendada) ou rename para `kitchen.mess_hall_workforce` (D10.1). A fusão precisa ainda do cadastro dos 4 refeitórios que faltam e da decisão sobre "EEAR (cozinha oficiais)".
2. Renomear no cadastro o refeitório de código e nome "Rancho" da EEAR.
3. Toda migration (expand e contract) e todo PR de gate dos lotes.
4. Fontes marcadas "a confirmar" no glossário (CEAFA, SARAM, arranchamento, Fiscal de rancho, ordem de fornecimento, Decreto 11.246/2022, IN SEDAP 205/1988, MCASP, Manual SIAFI). Cada lote confere as que usa antes de citá-las em código ou tela.

## Risks / Trade-offs

- **Lote 2 é grande** (~134 arquivos). Mitigação: o banco aceita os dois nomes durante o expand, então o PR de código pode ser dividido por camada (domínio → server fns → componentes → rotas/tools), cada parte verde sozinha.
- **Função plpgsql esquecida** passaria pela view de compatibilidade e quebraria no contract. Mitigação: o expand confere `pg_proc.prosrc` pelo nome antigo (como fez `20260927010000`), e o teste do banco vivo (D8) reprova depois do contract.
- **Alias de API fora de `RESTRICTED_PATHS`** abriria o arranchamento sem autenticação. Mitigação: teste em `routes.auth.test.ts` para o alias e o caminho novo.
- **SQL do analytics com nome antigo** em conversas salvas: o modelo reescreve a consulta com o prompt novo; o histórico só exibe.
- **URL antiga em favorito**: coberta pelo redirect de um ciclo.
- **Gate com falso positivo** (`ata` em "data", colunas da ARP, "Fiscal de rancho"): as regex usam fronteira de identificador e `pattern-not-regex`; cada termo entra com um caso de teste da própria regra.
- **"Refeitório" soa estranho ao usuário acostumado a "rancho"**: a busca do menu mantém "rancho" como palavra-chave (não é rótulo nem identificador), para quem procura pelo termo antigo.
- **Fonte citada errada** no glossário: por isso "a confirmar" em vez de dispositivo inventado; o lote que usa a fonte confere antes.

## Migration Plan

Nenhuma migration nesta change. Os lotes 2 a 8b seguem D4; cada migration nova confere colisão de timestamp (`ls packages/database/supabase/migrations | grep -oE '^[0-9]{14}' | sort | uniq -d`) e roda `db:push --dry-run` antes.
