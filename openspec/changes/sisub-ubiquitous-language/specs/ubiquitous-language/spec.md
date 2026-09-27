## ADDED Requirements

### Requirement: Um conceito, um nome, em todas as camadas

Cada conceito do glossário abaixo SHALL ter um único identificador, usado igual em tabela, coluna, view, função SQL, tipo, função, arquivo, query key, rota, nome e parâmetro de tool de IA/MCP, e um único rótulo de tela. Identificador novo MUST seguir o glossário. Identificador em inglês, salvo quando o termo da norma não tem equivalente fiel pelo teste da NSCA (AGENTS.md); sigla legal consagrada pode ser identificador. Valor de domínio que é categoria da norma MUST estar na língua da norma; estado de fluxo do sistema fica em inglês.

Legenda: **fonte** "a confirmar" = dispositivo não conferido, não usar como citação até o lote que o usa conferir. **Substituir** lista os nomes atuais que saem; "—" = nada a trocar.

#### 1. Planejamento da contratação

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| Plano de contratações anual (PCA) | Lei 14.133, art. 12, VII; Decreto 10.947/2022 | `pca` | `compras_gov_integration.pncp_pca_*` (espelho), `procurement.segment.pca_identifier` | Plano de Contratações | — |
| Documento de formalização da demanda (DFD) | Lei 14.133, art. 12, VII; Decreto 10.947/2022 (dispositivo a confirmar) | `dfd` | — | DFD | — |
| Previsão de demanda (da cozinha, insumo do DFD) | Decreto 10.947/2022 (a confirmar) | `demand_forecast` / `DemandForecast` | `procurement.kitchen_demand_forecast{,_selection,_import}`, `forecast_id` | Previsão de demanda | `KitchenAtaDraft`, `kitchenDraft*`, `kitchen-draft.ts`, `kitchen-draft.fn.ts`, `useKitchenDraft`, `components/features/local/kitchen-draft/`, `draftId`, `draft_id`, `ata_draft`, rota `kitchen/$kitchenId/suprimentos/$draftId`, "Suprimentos" |
| Contratação planejada (segmento) | spec `procurement-terminology` ("grupo" e "lote" reservados à lei) | `segment` | `procurement.segment`, `procurement.segment_rule` | Contratação planejada; Segmentação das contratações | `procurement_segment`, `procurement_segment_rule`, `ProcurementSegment*`, `procurementSegment*` |
| Estudo técnico preliminar (ETP) | Lei 14.133, art. 6º, XX (a confirmar inciso), art. 18, § 1º; IN SEGES/ME 58/2022 | `etp` | — | ETP | — |
| Termo de referência (TR) | Lei 14.133, art. 6º, XXIII; IN SEGES/ME 81/2022 | `tr` | — | TR | — |
| Estimativa das quantidades (anexo quantitativo do TR) | Lei 14.133, art. 18, § 1º, IV; art. 6º, XXIII | `quantity_estimate` / `QuantityEstimate` | `procurement.quantity_estimate` | Anexo quantitativo | `procurement.procurement_list`, `ProcurementList*`, `ata`, `ataId`, `Ata*` (`AtaWithDetails`, `AtaWizardState`, `AtaMeta`, `AtaStep`...), `createAta`, `fetchAtaDetails`, `fetchAtaList`, `updateAtaStatus`, `deleteAta`, `calculateAtaNeeds`, `ata.ts`, `ata.fn.ts`, `useAta.ts`, `ata-annex.ts`, `ata-utils.ts`, `types/domain/ata.ts`, `components/features/local/ata/`, rota `unit/$unitId/procurement/$ataId`, tools `list_atas`, `get_atas`, `get_ata_details`, `update_ata_status`, API `/api/admin/price-research/ata/:ataId` |
| Item do anexo | idem | `quantity_estimate_item` | `procurement.quantity_estimate_item`, `quantity_estimate_id` | Item do anexo | `procurement_list_item`, `list_id`, `ataItem*`, `ataItemId`, `ata_item_id`, `procurement_list_item_id` |
| Cozinha do anexo | modelo interno | `quantity_estimate_kitchen` | `procurement.quantity_estimate_kitchen` | — | `procurement_list_kitchen`, `list_kitchen_id`, `ataKitchen` |
| Cardápios considerados no anexo | modelo interno | `quantity_estimate_selection` | `procurement.quantity_estimate_selection`, `quantity_estimate_kitchen_id` | — | `procurement_list_selection` |
| Retrato do anexo concluído | archive `freeze-ata-snapshot-on-publish` | `quantity_estimate_snapshot_{component,selection}` | idem, `quantity_estimate_id` | — | `procurement_list_snapshot_*`, `AtaSnapshot*` |
| Memória de cálculo | Lei 14.133, art. 18, § 1º, IV | `calculation_memory` | — | Memória de cálculo | rota `print/quantities/$ataId` |
| Quantidade estimada | Lei 14.133, art. 18, § 1º, IV; art. 40, III | `estimated_quantity` | `quantity_estimate_item.estimated_quantity`, idem no snapshot | Quantidade estimada | `total_quantity`, `totalQuantity` |
| Quantidade máxima | Lei 14.133, art. 82, I | `max_quantity` | fica | Quantidade máxima | — |
| Acréscimo sobre a estimada | spec `procurement-terminology` (margem é a de preferência, art. 26) | `max_increase_percent` | `quantity_estimate{,_item,_snapshot_component}.max_increase_percent` | Acréscimo sobre a estimada (%) | `max_margin_percent`, `maxMarginPercent` |
| Justificativa da quantidade máxima | idem | `max_quantity_justification` | `quantity_estimate.max_quantity_justification` | Justificativa da quantidade máxima | `margin_justification`, `marginJustification` |
| Quantidade mínima a ser cotada | Lei 14.133, art. 82, II | `min_quote_percent`, `min_quote_quantity` | fica | Mínima a ser cotada (% da máxima) | — |
| Anexo concluído | spec `procurement-terminology` ("publicar" é divulgar no PNCP, art. 54) | status `completed` | `quantity_estimate.status` ∈ `draft` · `completed` · `archived` | Concluído | `published`, `publishedAtaIds` |
| Orçamento sigiloso | Lei 14.133, art. 24 | `is_budget_confidential` | fica | Orçamento sigiloso | — |

#### 2. Pesquisa de preços

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| Pesquisa de preços | Lei 14.133, art. 23; IN SEGES/ME 65/2021 | `price_research` / `PriceResearch` | `procurement.price_research` | Pesquisa de preços | `procurement_pesquisa_preco`, `pesquisaPreco`, `PesquisaPreco`, `savePrecoAuditFn`, worker `workers/pesquisa-preco`, `analisarPrecos`, rótulo "Pesquisa de preço" |
| Item pesquisado | IN 65/2021, art. 3º | `price_research_item` | `procurement.price_research_item`, `quantity_estimate_item_id` | — | `procurement_pesquisa_preco_item`, `procurement_list_item_id` |
| Preço coletado (amostra) | IN 65/2021, arts. 5º e 6º | `price_sample` / `PriceSample` | `procurement.price_sample` (colunas da API ficam); RPC `upsert_price_samples`; `sisub.price_sample_fingerprint` | Amostra | `compras_amostra`, `ComprasAmostra`, `AmostraPreco`, `upsert_compras_amostras`, `compras_amostra_fingerprint` |
| Amostra usada no item | IN 65/2021, art. 6º | `price_research_sample` | `procurement.price_research_sample`, `price_sample_id` | — | `procurement_pesquisa_preco_amostra`, `amostra_id` |
| Parâmetro de pesquisa (I a V) | IN 65/2021, art. 5º | `art5_parameter` | fica | Parâmetro | — |
| Emissão do relatório | spec `price-research-audit` | `price_research_emission` | fica; `quantity_estimate_id` | Emissão | `list_id` |
| Preço de catálogo (não é pesquisa) | D9 de `sisub-procurement-planning-flows` | `purchase_item.unit_price` | fica | Preço de catálogo | — |

#### 3. Contratação de origem e seleção do fornecedor

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| Contratação de origem | change `sisub-flexible-expense-execution` | `acquisition` | `procurement.acquisition` | Contratação de origem | — |
| Tipo: registro de preços, licitação, dispensa, inexigibilidade, Contrata+Brasil, suprimento de fundos | Lei 14.133, arts. 74, 75, 82; Lei 4.320, art. 68 (suprimento); Contrata+Brasil: ato a confirmar | valores `registro_precos` · `licitacao` · `dispensa` · `inexigibilidade` · `contrata_mais_brasil` · `suprimento_fundos` · `outra` | `acquisition.kind` | — | — |
| Contratação direta | Lei 14.133, art. 72 | (`kind` `dispensa`/`inexigibilidade`) | — | Contratação direta | — |
| Limite e somatório da dispensa por valor | Lei 14.133, art. 75, I, II e § 1º; IN SEGES/ME 67/2021, art. 4º | `direct_contract_limit`, `clause`, `activity_line` | fica | Limite de dispensa; Ramo de atividade | — |
| Instrumento (contrato ou substitutivo) | Lei 14.133, art. 95 | `instrument` ∈ `ata` · `contrato` · `nota_empenho` · `outro` | fica | Instrumento | — |
| Processo (NUP) | norma do NUP a confirmar | `process_nup` | fica | NUP | — |
| Catálogo (CATMAT, CATSER, PDM) | Lei 14.133, art. 19, II; Compras.gov.br | `catmat_*`, `pdm` | `compras_gov_integration.compras_material_*` (espelho) | CATMAT | — |
| Especificação do produto (item de compra) | Lei 14.133, art. 40, § 1º, I (a confirmar inciso) | `purchase_item` | fica | Item de compra | — |
| UASG | Compras.gov.br (SIASG) | `uasg` | `core.units.uasg` | UASG | — |
| Favorecido (credor da NE) | Manual SIAFI (a confirmar) | `favorecido_*` em `finance`; `supplier_*` no resto | fica | Favorecido / Fornecedor | — |

#### 4. Ata de registro de preços

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| Sistema de registro de preços (SRP) | Lei 14.133, art. 6º, XLV (a confirmar inciso); Decreto 11.462/2023 | `srp` | `acquisition.srp_role` | SRP | — |
| Ata de registro de preços (ARP) | Lei 14.133, art. 6º, XLVI | `arp` | `procurement.arp` | ARP | `procurement_arp`, `ProcurementArp*`, `procurementArp*` |
| Item da ARP | idem | `arp_item` | `procurement.arp_item`, `quantity_estimate_item_id` | Item da ata | `procurement_arp_item`, `procurement_list_item_id` |
| Número, ano e situação da ata | espelho do Compras.gov.br | `numero_ata`, `ano_ata`, `status_ata`, `numeroAtaRegistroPreco` | ficam | Nº da ata | — |
| Gerenciador, participante, não participante (adesão) | Decreto 11.462/2023 (a confirmar artigo); Lei 14.133, art. 86, § 2º (a confirmar) | `srp_role` ∈ `gerenciador` · `participante` · `nao_participante` | fica | Papel da unidade na ata | — |
| Quantidade homologada, empenhada, saldo (retrato do Compras) | espelho | `quantidade_homologada`, `quantidade_empenhada`, `saldo_empenho` | ficam | — | — |

#### 5. Execução orçamentária

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| Dotação | MCASP (a confirmar capítulo) | não usar na UG executora | — | — | `budget_credit.dotacao` |
| Crédito recebido (descentralizado) | MCASP (a confirmar) | `received_credit` | `finance.budget_credit.received_credit` | Crédito recebido | `dotacao` |
| Crédito disponível | MCASP (a confirmar) | `available_credit_siafi` | `finance.budget_credit.available_credit_siafi` | Disponível (SIAFI) | `saldo_siafi` |
| Crédito por classificação | — | `budget_credit` | fica | Crédito disponível | — |
| Nota de crédito (NC) | Manual SIAFI (a confirmar) | `credit_note` (a confirmar × `nc`) | `finance.credit_note`, `kind` ∈ `descentralizacao` · `anulacao` | NC | — |
| UG, UG emitente, UGR | Manual SIAFI (a confirmar) | `ug`, `issuer_ug`, `ugr` | `finance.empenho.issuer_ug` | UG emitente | `ug_emitente`, `ugEmitente` |
| Natureza de despesa (ND) | Portaria Interministerial STN/SOF 163/2001 | `nd` | fica | ND | — |
| PTRES, PI, fonte | Manual Técnico de Orçamento (a confirmar) | `ptres`, `pi`, `fonte` | ficam | PTRES, PI, Fonte | — |
| Empenho / nota de empenho (NE) | Lei 4.320, arts. 58, 60 e 61 | `empenho` (pt: sem equivalente fiel) | `finance.empenho`, `finance.empenho_item` | Empenho; NE | — |
| Empenho ordinário, estimativo, global | Decreto 93.872/1986 (a confirmar artigo) | `tipo` ∈ `ordinario` · `estimativo` · `global` | fica | — | — |
| Reforço, anulação, anulação total | Decreto 93.872/1986 (a confirmar) | `empenho_event.tipo` | fica | — | `cancelamento` (contract previsto em D11 de `sisub-flexible-expense-execution`) |
| Liquidação (NS) | Lei 4.320, art. 63 | `liquidacao` (pt: `liquidation` é falso cognato) | `finance.liquidacao`, `numero_ns` | Liquidação; NS | `liquidation`, `Liquidation*`, `liquidation.fn.ts`, `liquidation-math.ts`, rota `unit/$unitId/liquidations` |
| Retenção (dedução na NS) | IN RFB 1.234/2012 (IR, CSLL, COFINS, PIS); INSS e ISS: norma a confirmar | `liquidacao_deduction`, `kind` ∈ `ir` · `csll` · `cofins` · `pis` · `inss` · `iss` · `outra` | fica | Retenções | — |
| Pagamento (OB) | Lei 4.320, arts. 62 e 64 | `pagamento` (a confirmar: exceção à regra do inglês pela tríade da despesa) | `finance.pagamento`, `numero_ob` | Pagamento; OB | `payment`, `Payment*`, rota `unit/$unitId/payments` |
| Restos a pagar (RP) processados e não processados | Lei 4.320, art. 36; Decreto 93.872/1986 (a confirmar artigos) | `rp`, `kind` ∈ `processado` · `nao_processado` | `finance.empenho_rp_inscription` | Restos a pagar | colunas-espelho `empenho.rp_*` (contract previsto) |
| Conciliação com o SIAFI | — | `reconciliation` | fica | Conciliação | — |

#### 6. Ordem de fornecimento

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| Ordem de fornecimento (OF) | prática; Lei 14.133, art. 95 ("autorização de compra"); art. 6º, X citado no planejamento (a confirmar) | `supply_order` | fica | Ordem de fornecimento | — |
| Quantidade mínima por ordem de fornecimento | D9 de `sisub-procurement-planning-flows` | `min_order_quantity` | fica | Quantidade mínima por ordem de fornecimento | — |
| Regularidade no SICAF | norma a confirmar | `sicaf_status` | fica | SICAF | — |

#### 7. Recebimento e fiscalização

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| Recebimento provisório e definitivo | Lei 14.133, art. 140, II, a e b | `goods_receipt`, `status` `provisional` · `definitive` (estado de fluxo) | fica | Recebimento | — |
| Guia de remessa | — | `source = 'delivery_note'` | fica | Guia de remessa | — |
| NF-e | Ajuste SINIEF 07/2005 | `nfe_*` | fica | NF-e | — |
| Glosa | — | `fiscal_resolution = 'glosa'` | fica | Glosa | — |
| Designação de gestor, fiscais e comissão | Lei 14.133, arts. 7º, 117 e 140, II, b; Decreto 11.246/2022 (dispositivos a confirmar) | `contract_designation`, `role` ∈ `gestor` · `fiscal_tecnico` · `fiscal_administrativo` · `fiscal_setorial` · `membro_comissao` | fica; valores trocam | Designações | `manager`, `technical_inspector`, `administrative_inspector`, `sectoral_inspector`, `committee_member` |
| Ato de designação | Lei 14.133, art. 117 | `source = 'ato'` | fica | Ato | — |

#### 8. Almoxarifado e estoque

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| Lote (de fabricação) | RDC ANVISA 727/2022 (a confirmar); homônimo do lote da Lei 14.133 | `stock_lot` (nunca `lot` sozinho fora do estoque) | fica | Lote | — |
| Movimentação (entrada, saída por produção, devolução, perda, transferência, ajuste) | IN SEDAP 205/1988 (item a confirmar) | `stock_movement.type` | fica | — | — |
| Requisição de material | IN SEDAP 205/1988 (item a confirmar) | `stock_issue_request` | fica | Requisição (tela "Saída do dia") | — |
| Ajuste | IN SEDAP 205/1988 (a confirmar); MCASP | `stock_adjustment` | fica | Ajustes | — |
| Inventário físico | IN SEDAP 205/1988 (item e tipos a confirmar) | `inventory_count`, `type` ∈ `anual` · `transferencia_responsabilidade` · `eventual` · `rotativo` | fica; valores trocam | Inventário físico | `annual`, `responsibility_transfer`, `rotating`; rótulo "Contagem Física" |
| Fechamento mensal (RMA) | MCASP (a confirmar) | `monthly_closing` | fica | Fechamento mensal | — |
| Competência | MCASP | `competencia` | fica | Competência | — |
| Carga inicial (saldo de abertura) | — | `opening_balance`, `cost_source` ∈ `ata` · `price_research` · `manual` | fica | Carga inicial; "ARP (preço registrado)" | rótulo "ATA (preço homologado)" |
| Reposição | — | `replenishment` | fica | Sugestões de reposição | — |

#### 9. Subsistência

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| Rancho (onde o comensal come) | uso do COMAER (norma a confirmar) | `mess_hall` | `kitchen.mess_halls` | Rancho (a confirmar × "Refeitório") | — |
| Roster de ranchos do efetivo | modelo interno | a confirmar (mesmo conceito que `mess_hall`?) | `kitchen.rancho` | Efetivo dos ranchos | a decidir |
| Cozinha | — | `kitchen` | `kitchen.kitchen` | Cozinha | — |
| Comensal | uso do COMAER (a confirmar) | `diner` | — (módulo PBAC) | Comensal | — |
| Arranchamento (declaração do comensal para a refeição) | norma de subsistência do COMAER (a confirmar) | `arranchamento` (pt: "meal forecast" é a estimativa agregada) | `kitchen.arranchamento` (a confirmar) | Arranchamento | `kitchen.meal_forecasts`, `mealForecast*`, `useMealForecast`, `forecast.ts`, `forecast.fn.ts`, rota `diner/forecast`, rótulo "Previsão" |
| Previsão de comensais | — | `forecasted_headcount` | `kitchen.daily_menu` | Previsão | — |
| Presença | — | `meal_presence`, `other_presence` | `kitchen.meal_presences`, `kitchen.other_presences` | Presenças | — |
| Quem registra a presença | termo a confirmar | módulo `messhall` (ID fica) | — | Fiscal do rancho (a confirmar) | rótulo "Fiscal" |
| Cardápio do dia | — | `daily_menu`, `menu_item` | `kitchen.daily_menu`, `kitchen.menu_items` | Cardápio | — |
| Cardápio semanal (modelo) | — | `menu_template` (`template_type = 'weekly'`) | fica | Cardápio semanal (a confirmar) | rótulos "Planos Semanais", "Planos Semanais Modelo"; rota `global/weekly-plans` |
| Apoio (cardápio de exceção) | a confirmar | `template_type = 'exception'` | fica | Apoios | a decidir |
| Tipo de refeição | — | `meal_type`; `meal` ∈ `cafe` · `almoco` · `janta` · `ceia` | fica | Refeição | — |
| Preparação (ficha técnica de preparação) | manual de subsistência (a confirmar) | `recipe` | `kitchen.recipes` | Preparação; Ficha técnica (impressão) | — |
| Preparação congelada | — | `frozen_preparation` | fica | Preparação congelada | — |
| Preparação legada do SISUBWEB | migração do SISUBWEB | `legacy_preparation` | (linhas de `kitchen.ingredient` com `preparation_group_id`) | Preparação legada | tool `list_preparations`, `AgentListPreparations*`; `preparation_group` a confirmar |
| Insumo (gênero) | uso do COMAER | `ingredient`; `core.item.kind = 'insumo'` | `kitchen.ingredient` | Insumo | `product`, `Product*`, `policy_rule.target = 'product'` |
| CEAFA | norma do COMAER (expansão da sigla a confirmar) | `ceafa` | `kitchen.ceafa` | CEAFA | — |

#### 10. Pessoal e organização

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| SARAM (número do militar) | sistema de pessoal do COMAER (a confirmar) | `saram` | `core.person.saram`, `core.user_data.saram`, `core.military_identity.saram`; `core.user_military_data."nrOrdem"` fica (carga externa) | SARAM | `nr_ordem`, `nrOrdem` fora do espelho |
| Organização militar (OM) | uso do COMAER | `unit` | `core.units`, `unit_id` | Unidade; OM | — |
| OM apoiadora | — | `supporting_unit_id` | fica | OM apoiadora | — |
| Posto / graduação | uso do COMAER | `posto` | espelho `sgPosto` | Posto | — |

#### Scenario: Tabela nova do anexo

- **WHEN** uma migration nova cria uma tabela filha do anexo quantitativo
- **THEN** ela se chama `procurement.quantity_estimate_<parte>` e aponta para `quantity_estimate_id`
- **AND** nenhum identificador dela contém `ata`, `procurement_list` ou `list_id`

#### Scenario: Mesmo conceito na tela e no código

- **WHEN** o usuário abre "Anexos Quantitativos" e o desenvolvedor lê a rota, o server fn e a tool que respondem a essa tela
- **THEN** os três usam `quantity_estimate` / `quantityEstimateId`

### Requirement: Termo da norma só para o conceito da norma

Um termo que a norma define SHALL nomear só o conceito que ela define. Em particular: "ata"/`ata` só para a Ata de Registro de Preços (Lei 14.133, art. 6º, XLVI); "publicar" só para a divulgação no PNCP; "margem" só para a margem de preferência; "dotação" nunca para o crédito recebido pela UG; "fiscal" sozinho nunca para quem registra presença no rancho; `liquidation` nunca como identificador da liquidação da despesa.

#### Scenario: Valor de domínio que é ARP

- **WHEN** a contratação de origem tem `instrument = 'ata'` ou o saldo inicial tem `cost_source = 'ata'`
- **THEN** o valor fica, porque é a ARP
- **AND** o rótulo diz "ARP", nunca "ATA (preço homologado)"

#### Scenario: Anexo concluído

- **WHEN** o chefe do rancho conclui o anexo quantitativo
- **THEN** o banco grava `status = 'completed'`, e nenhum código novo escreve `published`

### Requirement: Renomear sem quebrar a main

Renomear tabela, coluna, valor de CHECK ou função no banco compartilhado SHALL seguir expand → código → contract. No expand, o nome antigo MUST continuar funcionando para leitura e escrita (view `security_invoker` para tabela, coluna espelhada por trigger para coluna, CHECK que aceita os dois valores, função antiga como wrapper). O contract MUST ser aplicado só depois do deploy do código que usa apenas os nomes novos, e MUST parar se a coluna antiga e a nova divergirem. Tabela renomeada com coluna de escopo MUST ser declarada no guard de reset antes do expand.

#### Scenario: A main em produção durante o expand

- **WHEN** a migration de expand do anexo é aplicada e o código da `main` ainda faz `.from("procurement_list")` e grava `procurement_arp.procurement_list_id`
- **THEN** a leitura passa pela view, a escrita chega à tabela e o trigger mantém `quantity_estimate_id` igual
- **AND** a suíte da `main` continua verde

#### Scenario: Contract antes do deploy

- **WHEN** alguém tenta aplicar o contract com o deploy do código novo ainda não concluído
- **THEN** o PR do contract não é mergeado: ele espera o mantenedor e a conferência do CI/CD da `main`

### Requirement: Rotas, tools e API com o nome do glossário

Rota, nome de tool de IA e caminho de API SHALL usar o identificador do glossário. Rota renomeada MUST redirecionar do caminho antigo por um ciclo de deploy. Tool do chat sem chamada registrada MAY ser renomeada sem alias; tool do MCP renomeada MUST manter alias por um ciclo. Caminho de API renomeado MUST manter o antigo como alias por um ciclo, com registro de uso.

#### Scenario: Favorito antigo

- **WHEN** o usuário abre `/unit/12/procurement/<id>` depois do lote 2
- **THEN** o app redireciona para `/unit/12/quantity-estimates/<id>`

#### Scenario: Tool do anexo

- **WHEN** o modelo do chat da Gestão Unidade lista as tools disponíveis
- **THEN** encontra `list_quantity_estimates` e `get_quantity_estimate`, e o prompt não precisa mais explicar que "ata" é nome legado

### Requirement: Gate dos nomes descartados

O repositório SHALL reprovar, em cada camada, o nome descartado de um lote já concluído: identificador TypeScript, nome de tool, segmento de rota, `create table`/`add column`/`rename to` em migration nova, e relação, coluna ou função no banco vivo. A mensagem MUST dizer o nome do glossário. Nomes que espelham API ou layout de terceiro e valores de domínio que são o termo da norma MUST NOT ser reprovados.

#### Scenario: Código novo com o nome antigo

- **WHEN** um PR acrescenta `function loadAta(ataId: string)` em `apps/sisub/src`
- **THEN** o opengrep reprova com "anexo quantitativo é `quantity_estimate` (Lei 14.133, art. 18, § 1º, IV); ata é só a ARP"

#### Scenario: Espelho do Compras.gov.br

- **WHEN** o código lê `numeroAtaRegistroPreco` da resposta da API ou a coluna `procurement.arp.numero_ata`
- **THEN** o gate não reprova

#### Scenario: Nome descartado no banco vivo

- **WHEN** depois do contract do lote 2 uma migration recria uma coluna `list_id` em `procurement`
- **THEN** o teste de contrato do job `gate` reprova e aponta `quantity_estimate_id`
