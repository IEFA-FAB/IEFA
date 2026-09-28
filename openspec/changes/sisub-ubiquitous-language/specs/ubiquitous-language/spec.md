## ADDED Requirements

### Requirement: Um conceito, um nome, em todas as camadas

Cada conceito do glossário abaixo SHALL ter um único identificador, usado igual em tabela, coluna, view, função SQL, tipo, função, arquivo, query key, rota, nome e parâmetro de tool de IA/MCP, e um único rótulo de tela. Identificador novo MUST seguir o glossário. Identificador em inglês, salvo quando o termo da norma não tem equivalente fiel pelo teste da NSCA (AGENTS.md); sigla legal consagrada pode ser identificador. Valor de domínio que é categoria da norma MUST estar na língua da norma; estado de fluxo do sistema fica em inglês.

Legenda: **fonte** "a confirmar" = dispositivo não conferido, não usar como citação até o lote que o usa conferir. As fontes públicas foram conferidas no texto oficial em 2026-09-27. As internas foram conferidas em 2026-09-28 no RADA-e, pela mesma base que o ChatRADA consulta (`alpha.document_chunk`, `document_type = 'RADA'`), e no banco (D12 do design). O RADA-e cita-se por módulo e item, sem transcrever: o texto é interno da FAB e o repositório é público. O que ainda diz "a confirmar" depende do Manual de Subsistência (MCA 145-3/Digital), que o RADA-e indica como fonte da subsistência mas que não está no acervo. **Substituir** lista os nomes atuais que saem; "—" = nada a trocar.

#### 1. Planejamento da contratação

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| Plano de contratações anual (PCA) | Lei 14.133, art. 12, VII; Decreto 10.947/2022 | `pca` | `compras_gov_integration.pncp_pca_*` (espelho), `procurement.segment.pca_identifier` | Plano de Contratações | — |
| Documento de formalização da demanda (DFD) | Lei 14.133, art. 12, VII; Decreto 10.947/2022, art. 2º, IV, e art. 8º | `dfd` | — | DFD | — |
| Previsão de demanda (da cozinha, insumo do DFD) | Decreto 10.947/2022, art. 8º, III (quantidade do DFD pela expectativa de consumo anual); "previsão de demanda" é nome do sistema | `demand_forecast` / `DemandForecast` | `procurement.kitchen_demand_forecast{,_selection,_import}`, `forecast_id` | Previsão de demanda | `KitchenAtaDraft`, `kitchenDraft*`, `kitchen-draft.ts`, `kitchen-draft.fn.ts`, `useKitchenDraft`, `components/features/local/kitchen-draft/`, `draftId`, `draft_id`, `ata_draft`, rota `kitchen/$kitchenId/suprimentos/$draftId`, "Suprimentos" |
| Contratação planejada (segmento do PCA): o recorte do que a OM compra num mesmo processo, no calendário do PCA, antes da seleção do fornecedor | Decreto 10.947/2022; spec `procurement-terminology` ("grupo" e "lote" reservados à lei) | `segment` | `procurement.segment`, `procurement.segment_rule` | Contratação planejada; Segmentação das contratações | `procurement_segment`, `procurement_segment_rule`, `ProcurementSegment*`, `procurementSegment*`; "contratação" sozinho |
| Estudo técnico preliminar (ETP) | Lei 14.133, art. 6º, XX, e art. 18, § 1º; IN SEGES/ME 58/2022 | `etp` | — | ETP | — |
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
| Contratação de origem: a contratação já feita (licitação, SRP, dispensa, inexigibilidade...) que sustenta o empenho | change `sisub-flexible-expense-execution`; Lei 14.133, art. 72 (contratação direta) | `acquisition` | `procurement.acquisition` | Contratação de origem | "contratação" sozinho |
| Tipo: registro de preços, licitação, dispensa, inexigibilidade, Contrata+Brasil, suprimento de fundos | Lei 14.133, arts. 74, 75, 82; Lei 4.320, art. 68 (suprimento); Contrata+Brasil: IN SEGES/MGI 52/2025, art. 1º | valores `registro_precos` · `licitacao` · `dispensa` · `inexigibilidade` · `contrata_mais_brasil` · `suprimento_fundos` · `outra` | `acquisition.kind` | — | — |
| Contratação direta | Lei 14.133, art. 72 | (`kind` `dispensa`/`inexigibilidade`) | — | Contratação direta | — |
| Limite e somatório da dispensa por valor | Lei 14.133, art. 75, I, II e § 1º; IN SEGES/ME 67/2021, art. 4º | `direct_contract_limit`, `clause`, `activity_line` | fica | Limite de dispensa; Ramo de atividade | — |
| Instrumento (contrato ou substitutivo) | Lei 14.133, art. 95 | `instrument` ∈ `ata` · `contrato` · `nota_empenho` · `outro` | fica | Instrumento | — |
| Processo (NUP) | Portaria Interministerial MJSP/ME 11/2019, art. 2º, II | `process_nup` | fica | NUP | — |
| Catálogo (CATMAT, CATSER, PDM) | Lei 14.133, art. 19, II; Compras.gov.br | `catmat_*`, `pdm` | `compras_gov_integration.compras_material_*` (espelho) | CATMAT | — |
| Especificação do produto (item de compra) | Lei 14.133, art. 40, § 1º, I | `purchase_item` | fica | Item de compra | — |
| UASG | Compras.gov.br (SIASG) | `uasg` | `core.units.uasg` | UASG | — |
| Favorecido (credor da NE) | Lei 4.320, art. 61 ("nome do credor" na NE); Manual SIAFI, 020305, 3.3.6.1, a (favorecido da OB: CPF, CNPJ ou UG) | `favorecido_*` em `finance`; `supplier_*` no resto | fica | Favorecido / Fornecedor | — |

#### 4. Ata de registro de preços

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| Sistema de registro de preços (SRP) | Lei 14.133, art. 6º, XLV; Decreto 11.462/2023, art. 2º, I | `srp` | `acquisition.srp_role` | SRP | — |
| Ata de registro de preços (ARP) | Lei 14.133, art. 6º, XLVI | `arp` | `procurement.arp` | ARP | `procurement_arp`, `ProcurementArp*`, `procurementArp*` |
| Item da ARP | idem | `arp_item` | `procurement.arp_item`, `quantity_estimate_item_id` | Item da ata | `procurement_arp_item`, `procurement_list_item_id` |
| Número, ano e situação da ata | espelho do Compras.gov.br | `numero_ata`, `ano_ata`, `status_ata`, `numeroAtaRegistroPreco` | ficam | Nº da ata | — |
| Gerenciador, participante, não participante (adesão) | Lei 14.133, art. 6º, XLVII a XLIX, e art. 86, § 2º (adesão do não participante); Decreto 11.462/2023, art. 2º, III a V | `srp_role` ∈ `gerenciador` · `participante` · `nao_participante` | fica | Papel da unidade na ata | — |
| Quantidade homologada, empenhada, saldo (retrato do Compras) | espelho | `quantidade_homologada`, `quantidade_empenhada`, `saldo_empenho` | ficam | — | — |

#### 5. Execução orçamentária

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| Dotação | Manual SIAFI, 010400 (glossário: "dotação orçamentária", "dotação inicial"); MCASP 11ª ed., Parte I, 4.4.1.2 (a descentralização não altera a dotação nem a unidade orçamentária) | não usar na UG executora | — | — | `budget_credit.dotacao` |
| Crédito recebido (descentralizado) | MCASP 11ª ed., Parte I, 4.4.1.2 (descentralização: provisão ou destaque); Manual SIAFI, 010400 (glossário: "descentralização interna/externa de créditos") | `received_credit` | `finance.budget_credit.received_credit` | Crédito recebido | `dotacao` |
| Crédito disponível | MCASP 11ª ed., Parte I, 4.5 (conta 6.2.2.1.1 "Crédito Disponível", debitada no empenho) | `available_credit_siafi` | `finance.budget_credit.available_credit_siafi` | Disponível (SIAFI) | `saldo_siafi` |
| Crédito por classificação | — | `budget_credit` | fica | Crédito disponível | — |
| Nota de movimentação de crédito (NC) | Manual SIAFI, 010400 (glossário: "Nota de Movimentação de Crédito (NC)") | `credit_note` (fica; o SIAFI chama o documento de "nota de movimentação de crédito", e a sigla é a mesma) | `finance.credit_note`, `kind` ∈ `descentralizacao` · `anulacao` | NC | — |
| UG, UG emitente, UGR | Manual SIAFI, 010400 (glossário: UGE, UGR) e 020301, 4.8.1.7 ("UG emitente") | `ug`, `issuer_ug`, `ugr` | `finance.empenho.issuer_ug` | UG emitente | `ug_emitente`, `ugEmitente` |
| Natureza de despesa (ND) | Portaria Interministerial STN/SOF 163/2001 | `nd` | fica | ND | — |
| PTRES, PI, fonte | Manual SIAFI, 010400 (glossário: "Programa de Trabalho Resumido (PTRES)", "Plano Interno", "Fonte de recurso") | `ptres`, `pi`, `fonte` | ficam | PTRES, PI, Fonte | — |
| Empenho / nota de empenho (NE) | Lei 4.320, arts. 58 a 61 | `empenho` (pt: sem equivalente fiel) | `finance.empenho`, `finance.empenho_item` | Empenho; NE | — |
| Empenho ordinário, estimativo, global | Lei 4.320, art. 60, §§ 2º (estimativa) e 3º (global); MCASP 11ª ed., Parte I, 4.4.2.1 (ordinário, estimativo, global) | `tipo` ∈ `ordinario` · `estimativo` · `global` | fica | — | — |
| Reforço, anulação, anulação total | MCASP 11ª ed., Parte I, 4.4.2.1; Decreto 93.872/1986, art. 28 (anulação parcial ou total); Manual SIAFI, 020301, 4.8.1.7 (reforço) | `empenho_event.tipo` | fica | — | `cancelamento` (contract previsto em D11 de `sisub-flexible-expense-execution`) |
| Liquidação (NS) | Lei 4.320, art. 63 | `liquidacao` (pt: `liquidation` é falso cognato) | `finance.liquidacao`, `numero_ns` | Liquidação; NS | `liquidation`, `Liquidation*`, `liquidation.fn.ts`, `liquidation-math.ts`, rota `unit/$unitId/liquidations` |
| Retenção (dedução na NS) | IN RFB 1.234/2012 (IR, CSLL, COFINS, PIS); INSS: Lei 8.212/1991, art. 31; ISS: LC 116/2003, art. 6º | `liquidacao_deduction`, `kind` ∈ `ir` · `csll` · `cofins` · `pis` · `inss` · `iss` · `outra` | fica | Retenções | — |
| Pagamento (OB) | Lei 4.320, arts. 62 a 65 | `pagamento` (**exceção registrada** à regra do inglês: fica com `empenho` e `liquidacao`, as fases da despesa, arts. 58-65) | `finance.pagamento`, `numero_ob` | Pagamento; OB | `payment`, `Payment*`, rota `unit/$unitId/payments` |
| Restos a pagar (RP) processados e não processados | Lei 4.320, art. 36; Decreto 93.872/1986, arts. 67 e 68 | `rp`, `kind` ∈ `processado` · `nao_processado` | `finance.empenho_rp_inscription` | Restos a pagar | colunas-espelho `empenho.rp_*` (contract previsto) |
| Conciliação com o SIAFI | — | `reconciliation` | fica | Conciliação | — |

#### 6. Ordem de fornecimento

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| Ordem de fornecimento (OF) | Lei 14.133, art. 6º, X ("prazo de entrega de até 30 (trinta) dias da ordem de fornecimento"); art. 95 (substitutivos do contrato, entre eles a "autorização de compra") | `supply_order` | fica | Ordem de fornecimento | — |
| Quantidade mínima por ordem de fornecimento | D9 de `sisub-procurement-planning-flows` | `min_order_quantity` | fica | Quantidade mínima por ordem de fornecimento | — |
| Regularidade no SICAF | Decreto 11.462/2023, art. 2º, VIII; Decreto 3.722/2001, art. 1º | `sicaf_status` | fica | SICAF | — |

#### 7. Recebimento e fiscalização

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| Recebimento provisório e definitivo | Lei 14.133, art. 140, II, a e b | `goods_receipt`, `status` `provisional` · `definitive` (estado de fluxo) | fica | Recebimento | — |
| Guia de remessa | — | `source = 'delivery_note'` | fica | Guia de remessa | — |
| NF-e | Ajuste SINIEF 07/2005 | `nfe_*` | fica | NF-e | — |
| Glosa | — | `fiscal_resolution = 'glosa'` | fica | Glosa | — |
| Designação de gestor, fiscais e comissão | Lei 14.133, arts. 7º, 117 e 140, II, b; Decreto 11.246/2022, arts. 8º, 19 e 21 a 25 (o Decreto 13.031/2026 incluiu o gestor setorial, arts. 19, V, e 21-A, que ainda não tem `role`) | `contract_designation`, `role` ∈ `gestor` · `fiscal_tecnico` · `fiscal_administrativo` · `fiscal_setorial` · `membro_comissao` | fica; valores trocam | Designações | `manager`, `technical_inspector`, `administrative_inspector`, `sectoral_inspector`, `committee_member` |
| Ato de designação | Lei 14.133, art. 117 | `source = 'ato'` | fica | Ato | — |

#### 8. Almoxarifado e estoque

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| Lote (de fabricação) | RDC ANVISA 727/2022, art. 3º, XIV, e art. 30; homônimo do lote da Lei 14.133 | `stock_lot` (nunca `lot` sozinho fora do estoque) | fica | Lote | — |
| Movimentação (entrada, saída por produção, devolução, perda, transferência, ajuste) | IN SEDAP 205/1988, itens 3.1 (origens da entrada), 6.1 e 7.9 | `stock_movement.type` | fica | — | — |
| Requisição de material | IN SEDAP 205/1988, item 5.1.3 | `stock_issue_request` | fica | Requisição (tela "Saída do dia") | — |
| Ajuste | IN SEDAP 205/1988, item 8, a; MCASP 11ª ed., Parte II, 5.2.3 (ajuste de perdas de estoques) | `stock_adjustment` | fica | Ajustes | — |
| Inventário físico | IN SEDAP 205/1988, item 8.1, a, c e e (anual, de transferência de responsabilidade, eventual), e item 8.3 (rotativo); o inicial e o de extinção (8.1, b e d) não estão no sisub | `inventory_count`, `type` ∈ `anual` · `transferencia_responsabilidade` · `eventual` · `rotativo` | fica; valores trocam | Inventário físico | `annual`, `responsibility_transfer`, `rotating`; rótulo "Contagem Física" |
| Fechamento mensal (RMA) | Manual SIAFI, 021101, item 2.2 (RMA mensal, até o 5º dia útil do mês seguinte); MCASP 11ª ed., Parte II, 5.2.2 (custo médio ponderado) | `monthly_closing` | fica | Fechamento mensal | — |
| Competência | MCASP | `competencia` | fica | Competência | — |
| Carga inicial (saldo de abertura) | — | `opening_balance`, `cost_source` ∈ `ata` · `price_research` · `manual` | fica | Carga inicial; "ARP (preço registrado)" | rótulo "ATA (preço homologado)" |
| Reposição | — | `replenishment` | fica | Sugestões de reposição | — |

#### 9. Subsistência

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| Subsistência: o sistema do COMAER (órgão central SDAB) e, na OM, a Seção de Subsistência (SSUB), elo do sistema | RADA-e Módulo C, cap. 9 (SDAB, órgão central do Sistema de Subsistência); Módulo H, mód. 24, 24.2.1.3, d, e 24.3.1.7.4 (SSUB, elo do sistema no GAP e nas OM apoiadas); Módulo H, mód. 08 (revogado em 23 DEZ 2025, remete ao MCA 145-3/Digital) | — (é o domínio do sisub: schema `kitchen`, `inventory`) | — | Subsistência; Seção de Subsistência | "rancho" no sentido de subsistência da OM (linha "Unidade") |
| Refeitório: onde o comensal come e a presença é fiscalizada | RADA-e Módulo G, mód. 22, 22.3.7.1.1, s (UG sem refeitório não é elo do Sistema de Subsistência); Módulo H, mód. 4, 4.1.10, d ("comparecimento diário ao rancho" no sentido de local) | `mess_hall` | `kitchen.mess_halls` | Refeitório | "rancho" nesse sentido: seletor do Comensal ("Rancho padrão", "Selecione um rancho"), filtros e colunas "Rancho" do analytics e da presença, "escala sem apoio de rancho" no lanche, tipo `Mess Hall (Rancho)` |
| Refeitório no levantamento de efetivo (matriz da SDAB) | `20260827163000_workforce_matrix.sql` | `mess_hall_workforce` (rename decidido em 2026-09-27; a fusão em `mess_halls` é a change `sisub-workforce-by-mess-hall`) | `kitchen.mess_hall_workforce` (era `kitchen.rancho`); `workforce_submission.mess_hall_workforce_id` (era `rancho_id`) | Efetivo dos Refeitórios; na rede, efetivo da subsistência | `kitchen.rancho`, `core.rancho`, `rancho_id`, `ranchoInKitchen`, `ranchoId`, `Rancho*`, `RanchoWorkforce*`, `computeRanchoMetrics`, `createRancho`, `updateRancho`, "Efetivo dos Ranchos" |
| Cozinha: onde se produz, com os seus refeitórios | — | `kitchen` | `kitchen.kitchen` | Cozinha | "rancho" nesse sentido: "material de rancho", "item do rancho" (produção regular), "planejamento do rancho", "tipos de refeição do rancho" |
| Unidade (OM) e a sua subsistência | RADA-e Módulo B, 1.141 (OM); "serviço de rancho organizado" da OM: Decreto 4.307/2002, arts. 68 e 72, e RADA-e Módulo H, mód. 4, 4.10.1, a | `unit` | `core.units`, `unit_id` | Unidade; Gestão Unidade | "rancho" nesse sentido: "chefe do rancho" (→ quem tem Gestão Unidade), "despesa do rancho", "compra fora do rancho", "rancho militar" |
| Comensal | uso do COMAER. Não aparece no RADA-e nem no Decreto 4.307/2002 (conferido em 2026-09-28); a confirmar no MCA 145-3/Digital | `diner` | — (módulo PBAC) | Comensal | — |
| Arranchamento: o militar se arrancha (declara que vai comer em data, refeição e refeitório); presença é o comparecimento | Decreto 4.307/2002, arts. 68 e 71, § 2º ("arranchado": alimentado pela organização); RADA-e Módulo H, mód. 4, 4.10.1, a (repete o art. 68). "Desarranchado" (`will_eat = false`) não aparece em nenhum dos dois: é uso do sistema. O procedimento do arranchamento fica a confirmar no MCA 145-3/Digital | `arranchamento` (pt: "meal forecast" é a estimativa agregada) | `kitchen.arranchamento` | Arranchamento | `kitchen.meal_forecasts`, `mealForecastsInKitchen`, `mealForecast*`, `useMealForecast`, `upsertForecast`, `ForecastRecord`, `operations/forecast.ts`, `forecast.fn.ts`, `lib/forecast.ts`, rota `diner/forecast`, API `/api/rancho_previsoes`, rótulo "Previsão" |
| Previsão de comensais | RADA-e Módulo H, mód. 4, 4.1.10, d (a unidade apoiada faz a previsão de comparecimento diário: é o número agregado, não o arranchamento de cada um) | `forecasted_headcount` | `kitchen.daily_menu` | Previsão | — |
| Presença | — | `meal_presence`, `other_presence` | `kitchen.meal_presences`, `kitchen.other_presences` | Presenças | — |
| Fiscal de rancho: função da escala de serviço que registra e confere a presença. **Única ocorrência permitida de "rancho"**, como nome próprio; não é o fiscal do contrato (Lei 14.133, art. 117) | nome decidido pelo usuário em 2026-09-27 (D2). "Fiscal de rancho" e "fiscal de dia" não aparecem no RADA-e; lá "fiscal" é sempre o do contrato (Módulo B, 1.90 e 1.91; "fiscalização", 1.92), o que confirma a regra de não usar "fiscal" sozinho. A escala de serviço é feita pela unidade apoiada (RADA-e Módulo H, mód. 4, 4.1.10, a). A função fica a confirmar no MCA 145-3/Digital | módulo `messhall` (ID fica; 16 grants no banco em 2026-09-28) | — | Fiscal de rancho | rótulos "Fiscal" (módulo, breadcrumb) e "Fiscal de Rancho" (grafia) |
| Cardápio do dia | — | `daily_menu`, `menu_item` | `kitchen.daily_menu`, `kitchen.menu_items` | Cardápio | — |
| Cardápio semanal (modelo) | termo da nutrição | `menu_template` (`template_type = 'weekly'`) | fica | Cardápio semanal; Cardápio semanal modelo (global) | rótulos "Planos Semanais", "Planos Semanais Modelo"; rota `global/weekly-plans` |
| Cardápio de apoio: refeições previsíveis fora da rotina semanal (lanches de bordo e de apoio, coffee breaks) | — | `template_type = 'apoio'` | `kitchen.menu_template.template_type`, `kitchen.menu_items.origin_template_type` | Cardápio de apoio | `'exception'`; rotas `global/exceptions` e `kitchen/$kitchenId/exceptions` → `*/support-menus`; componentes `Exception*` |
| Lanche de bordo (missão aérea) e lanche de apoio (missão terrestre); "apoio" é homônimo: família do lanche, não tipo de cardápio | Módulo 7 do manual de subsistência da SDAB, "Composição e fornecimento de refeições de bordo e lanches de apoio no âmbito do COMAER" (atualização de 27 NOV 2025), itens 7.4.x, fonte já usada em `sisub-snack-support-requests`. O RADA-e só registra o lanche como produto da Seção de Subsistência (Módulo G, mód. 22, 22.3.7.1.3, a) e manda a subsistência para o MCA 145-3/Digital (Módulo H, mód. 08). Falta conferir se o Módulo 7 é desse manual (não está no acervo) | `snack_family` ∈ `bordo` · `apoio` | fica | Lanche de Bordo; Lanche de Apoio | — |
| Tipo de refeição | — | `meal_type`; `meal` ∈ `cafe` · `almoco` · `janta` · `ceia` | fica | Refeição | — |
| Preparação (ficha técnica de preparação) | Módulo 7 do manual de subsistência da SDAB, 7.4.5 (a etiqueta traz o "nome da preparação", sentido de prato). O RADA-e só usa "preparação de alimentação" como atividade custeada (Módulo G, mód. 17, 17.4.13.2). A ficha técnica fica a confirmar no MCA 145-3/Digital | `recipe` | `kitchen.recipes` | Preparação; Ficha técnica (impressão) | — |
| Preparação congelada | — | `frozen_preparation` | fica | Preparação congelada | — |
| Preparação legada do SISUBWEB | migração do SISUBWEB | `legacy_preparation` | (linhas de `kitchen.ingredient` com `preparation_group_id`); `kitchen.preparation_group` fica | Preparação legada | tool `list_preparations`, `AgentListPreparations*` |
| Insumo (gênero) | uso do COMAER; RADA-e Módulo B, 1.106 e 1.115 (material "de subsistência" no estoque e no consumo), Módulo I, 4.1.43, a ("gêneros perecíveis") | `ingredient`; `core.item.kind = 'insumo'` | `kitchen.ingredient` | Insumo | `product`, `Product*`, `policy_rule.target = 'product'` |
| CEAFA | Comissão de Estudos de Alimentação das Forças Armadas, do Ministério da Defesa (Revista da ESG, v. 34, n. 71, 2019). Origem da relação conferida no banco em 2026-09-28: `kitchen.ceafa` é a cópia de `legacy_sisubweb.ceafa` (`legacy_id` = `id_ceafa`), 19 gêneros com uma quantidade de referência cada (arroz 180, feijão 120, carnes 400…), vinda do SISUBWEB. A sigla não aparece no RADA-e; o ato de criação e a unidade da quantidade ficam a confirmar | `ceafa` | `kitchen.ceafa` | CEAFA | — |
| Etapa (etapa comum fixada para a localidade): o valor unitário da alimentação do militar | Decreto 4.307/2002, arts. 67 a 73 (o auxílio-alimentação é contado em etapas); RADA-e Módulo G, mód. 3, 3.3.7 (a receita do serviço de alimentação se chama "ressarcimento etapa de rancho") | não modelado; se entrar, `etapa` (pt: sem equivalente fiel) | — | Etapa | — |

#### 10. Pessoal e organização

| Termo da norma | Fonte | Identificador | Banco | Rótulo | Substituir |
|---|---|---|---|---|---|
| SARAM (número de ordem do militar) | declaração do mantenedor em 2026-09-28: o SARAM é o número de ordem, e identifica cada militar da FAB. O RADA-e confirma: os formulários tratam "Nº de ordem" e "SARAM" como a mesma matrícula (Módulo J, formulário de solicitação de perfis, campo 5, "matrícula"; Módulo L, mód. 2, anexo do 2.12: o número de ordem é "exclusivo para cada militar"; Módulo L, mód. 6, 6.2.2: "Nº de ordem (matrícula SDPP)"; Módulo M, mód. 3, anexos). **Homônimo:** no RADA-e, SARAM sozinho também é a Subdiretoria de Aplicação dos Recursos para Assistência Médico-Hospitalar, da DIRSA (Módulo N, 3.2.13; Módulo G, mód. 3, 3.8.5.2). O RADA-e não expande a sigla do número | `saram` | `core.person.saram`, `core.user_data.saram`, `core.military_identity.saram`; `core.user_military_data."nrOrdem"` fica (carga externa) | SARAM | `nr_ordem`, `nrOrdem` fora do espelho |
| Organização militar (OM) | RADA-e Módulo B, 1.141 | `unit` | `core.units`, `unit_id` | Unidade; OM | — |
| OM apoiadora (UG de apoio): a que conduz as aquisições, a liquidação, o pagamento e o pessoal das OM apoiadas | RADA-e Módulo H, o manual de procedimentos das unidades de apoio e apoiadas: mód. 5, 5.3 e 5.4 (responsabilidades da UG apoiada e da apoiadora nas aquisições); mód. 9, 9.2.1.1 (liquidação e pagamento só pela apoiadora); mód. 4, 4.1.10 (o que cabe às apoiadas) | `supporting_unit_id` | fica | OM apoiadora | — |
| Apoio de rancho: OM sem serviço de rancho organizado, porém apoiada, que come na OM apoiadora | Decreto 4.307/2002, art. 72, II e parágrafo único; RADA-e Módulo H, mód. 4, 4.10.1, a | não modelado em `core.units`; **não** é `supporting_unit_id`. No lanche, quem fornece é a `kitchen_id` da requisição | — | Cozinha apoiadora (lanche) | — |
| Posto / graduação | uso do COMAER | `posto` | espelho `sgPosto` | Posto | — |

#### Scenario: Tabela nova do anexo

- **WHEN** uma migration nova cria uma tabela filha do anexo quantitativo
- **THEN** ela se chama `procurement.quantity_estimate_<parte>` e aponta para `quantity_estimate_id`
- **AND** nenhum identificador dela contém `ata`, `procurement_list` ou `list_id`

#### Scenario: Mesmo conceito na tela e no código

- **WHEN** o usuário abre "Anexos Quantitativos" e o desenvolvedor lê a rota, o server fn e a tool que respondem a essa tela
- **THEN** os três usam `quantity_estimate` / `quantityEstimateId`

### Requirement: Termo da norma só para o conceito da norma

Um termo que a norma define SHALL nomear só o conceito que ela define. Em particular: "ata"/`ata` só para a Ata de Registro de Preços (Lei 14.133, art. 6º, XLVI); "publicar" só para a divulgação no PNCP; "margem" só para a margem de preferência; "dotação" nunca para o crédito recebido pela UG; "fiscal" sozinho nunca para quem registra presença no refeitório (esse é o "Fiscal de rancho"); `liquidation` nunca como identificador da liquidação da despesa.

#### Scenario: Valor de domínio que é ARP

- **WHEN** a contratação de origem tem `instrument = 'ata'` ou o saldo inicial tem `cost_source = 'ata'`
- **THEN** o valor fica, porque é a ARP
- **AND** o rótulo diz "ARP", nunca "ATA (preço homologado)"

#### Scenario: Anexo concluído

- **WHEN** quem tem Gestão Unidade conclui o anexo quantitativo
- **THEN** o banco grava `status = 'completed'`, e nenhum código novo escreve `published`

### Requirement: "Rancho" não é termo do sistema

"Rancho" SHALL NOT ser usado em identificador, rótulo, mensagem, prompt de IA ou comentário novo, porque nomeia conceitos diferentes conforme a frase. O texto SHALL dizer **cozinha** (`kitchen`), **refeitório** (`mess_hall`) ou **unidade** (`unit`), conforme o que a frase quer dizer. A única exceção é o nome próprio da função **Fiscal de rancho**, rótulo do módulo de presença (`messhall`), que MUST ser distinguido do fiscal do contrato (Lei 14.133, art. 117). Nome de terceiro (UG no SIAFI, PI, o plano orçamentário "Alimentação de Militares Ativos em Rancho", a receita "ressarcimento etapa de rancho") e texto livre de usuário MAY conter a palavra. O gate cobre identificador, rótulo, mensagem e prompt; comentário fica com a revisão.

#### Scenario: Seletor do Comensal

- **WHEN** o comensal escolhe onde vai comer
- **THEN** a tela diz "Refeitório padrão" e "Selecione um refeitório"

#### Scenario: Designação que falta no recebimento

- **WHEN** a conferência física não tem fiscal designado
- **THEN** a mensagem manda pedir a designação à Gestão Unidade (Designações), não "ao chefe do rancho"

#### Scenario: Módulo de presença

- **WHEN** o usuário abre o módulo `messhall`
- **THEN** o menu e o breadcrumb dizem "Fiscal de rancho"
- **AND** a tela de designações continua chamando de "fiscal" só o fiscal do contrato

#### Scenario: Matriz de efetivo

- **WHEN** o gestor da unidade abre a matriz de efetivo
- **THEN** o menu, o breadcrumb e a página dizem "Efetivo dos Refeitórios", e cada linha é um refeitório
- **AND** o banco guarda a linha em `kitchen.mess_hall_workforce` e a resposta em `workforce_submission.mess_hall_workforce_id`

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

#### Scenario: "Rancho" em texto novo

- **WHEN** um PR acrescenta o rótulo "Todos os ranchos" ou a função `listRanchos`
- **THEN** o opengrep reprova e pede cozinha, refeitório ou unidade
- **WHEN** o texto é "Apresente este código ao Fiscal de rancho"
- **THEN** o gate não reprova

#### Scenario: Nome descartado no banco vivo

- **WHEN** depois do contract do lote 2 uma migration recria uma coluna `list_id` em `procurement`
- **THEN** o teste de contrato do job `gate` reprova e aponta `quantity_estimate_id`
