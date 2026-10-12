## ADDED Requirements

### Requirement: Um conceito, um nome, no fardamento
Cada conceito do glossário abaixo SHALL ter um único identificador, usado igual em tabela, coluna, view, função SQL, tipo, função, arquivo, query key, rota e rótulo de tela. Identificador em inglês, salvo termo que a norma ou a SDAB não reconheceriam traduzido (`posto`, `quadro`, `especialidade`, `saram`) e valor de domínio que é categoria da norma ou da SDAB (`avulsa`). Estado de fluxo do sistema fica em inglês. Este lote vale para os changes `sisprov-*` e `core-sigpes-sync`; conceito novo entra aqui antes da tabela que o cria.

Legenda de fonte: OS = Ordem de Serviço do legado fab-provisao (especificação executável); DET = detalhamento do projeto (local); SDAB = termo da Subdiretoria de Abastecimento, **a confirmar** na validação funcional (S6). Coluna "Legado": o nome no fab-provisao, para rastreabilidade; nunca para uso.

#### 1. Catálogo de fardamento

| Conceito | Fonte | Identificador | Banco | Rótulo | Legado |
| --- | --- | --- | --- | --- | --- |
| Família de peça (o tipo de item, sem gênero nem tamanho: camisa, coturno) | OS 13 §3.3 | `garment_family` | `sisprov.garment_family` | Família | `FamiliaRumaerBean` |
| Variante da família por gênero, com grade de tamanhos própria | OS 13 §3.3, OS 14 §2.2 | `garment_variant` | `sisprov.garment_variant` (`gender`) | Variante | `FamiliaRepresentanteBean` |
| Item estocável: variante × tamanho, `core.item` de tipo material com perfil | OS 13, D4 do design | `garment_item` | `sisprov.garment_item` (PK = `core.item.id`), `size_label` | Item | `ProdutoRepresentanteBean` |
| Aplicabilidade do item a posto, quadro e especialidade | OS 13 §3.3 | `garment_applicability` | `sisprov.garment_applicability` | Aplica-se a | `ProdutoRumaerBean` |
| Grade de tamanhos de uma variante | OS 14 §2.2 | `size_grid`, `size_label` | `sisprov.size_grid` | Grade de tamanhos | tamanhos em `ProdutoRepresentante` |
| Gênero da variante | RUMAER | `gender` ∈ `masculino` · `feminino` · `unissex` (valores do enum `rumaer.genero`) | coluna `gender` | Gênero | `genero` |
| Peça do regulamento (referência) | RCA 35-2 | `piece_id` → `rumaer.piece` | FK opcional | Peça do RUMAER | cadeia RUMAER |

#### 2. Demanda

| Conceito | Fonte | Identificador | Banco | Rótulo | Legado |
| --- | --- | --- | --- | --- | --- |
| Grupo de demanda: classe por atividade ou função numa OM (manutenção, TI, segurança…) | DET RN-01; OS 14 §2.4 | `demand_group` | `sisprov.demand_group` (`unit_id`, `is_intake`) | Grupo de demanda | `GrupoDistribuicaoFardamentoBean` ("grupo de distribuição") |
| Enxoval: itens, quantidade por militar e frequência de renovação de um grupo | DET RN-01 ("kit") | `kit`, `kit_item` | `sisprov.kit_item` (`demand_group_id`, `garment_family_id`, `quantity`, `renewal_interval_months`) | Enxoval | `QuantidadeNecessariaFamiliaRumaer` |
| Frequência de renovação | DET RN-01, RN-04 | `renewal_interval_months` | coluna | Renovação (meses) | não existia |
| Limite de quantidade por família e OM ou região | OS 15 §2.1, 2.2 | `family_limit` | `sisprov.family_limit` (`unit_id` ou `region_id`) | Limite | limites OM/região |
| Período de planejamento (ano, início, fim), um em execução por vez | OS 15 §2.4 | `planning_period` | `sisprov.planning_period`, status ∈ `draft` · `active` · `closed` | Período de planejamento | `PeriodoPlanejamentoBean` |
| Previsão de incorporação (efetivo que vai ingressar) por OM, grupo, posto, quadro, especialidade e gênero | DET RN-03; OS 15 §2.5 | `intake_forecast` | `sisprov.intake_forecast` (`men_count`, `women_count`) | Previsão de incorporação | `PrevisaoIncorporacaoBean` (`quantidadeHomens`, `quantidadeMulheres`) |
| Cenário da previsão | DET risco "efetivo impreciso"; RF-03.3 | `scenario` ∈ `low` · `expected` · `high` | coluna | Cenário (mínimo, esperado, máximo) | não existia |
| Estimativa por regressão do efetivo previsto | RF-03.5 | `intake_estimate`, `intake_model_version` | `sisprov.intake_estimate` | Estimativa | não existia |
| Elo SISPROV na OM | DET §4 | módulo `sisprov-planning` | PBAC | Planejamento | perfil do RBAC |
| Demanda de renovação do efetivo existente | DET RN-04 | `renewal_demand` | calculada | Renovação | não existia |

#### 3. Antropometria

| Conceito | Fonte | Identificador | Banco | Rótulo | Legado |
| --- | --- | --- | --- | --- | --- |
| Ficha de tamanhos do militar (por SARAM e variante) | OS 14 §2.2, 2.3 | `size_record` | `sisprov.size_record` (`saram`, `garment_variant_id`, `size_label`, `source`) | Ficha de tamanhos | `EfetivoSigpesBean.tamanhos` |
| Origem do tamanho | RF-06 | `source` ∈ `self` · `storeroom` · `imported` | coluna | Informado por | não existia |
| Curva antropométrica: distribuição percentual de tamanhos por variante e nível | DET RN-02; OS 16 §3.9 | `size_curve` | `sisprov.size_curve` | Curva de tamanhos | `ProporcoesIncorporacaoVO` |
| Versão da curva (geração, parâmetros, amostra, nível usado) | RF-02.4 | `size_curve_version` | `sisprov.size_curve_version` | Versão da curva | não existia |
| Nível do fallback em cascata | RF-02.3 | `curve_level` ∈ `individual` · `unit` · `region` · `global` | coluna | Nível | OM → região (sem global) |
| Amostra mínima por nível | RF-02.3 | `min_sample_size` | parâmetro | Amostra mínima | constante 20 |

#### 4. Necessidade, OF e distribuição

| Conceito | Fonte | Identificador | Banco | Rótulo | Legado |
| --- | --- | --- | --- | --- | --- |
| Necessidade bruta (incorporação + renovação) por item, OM e período | OS 16 §3.9 (A + B + C) | `gross_need` | calculada; `sisprov.need_line` | Necessidade bruta | `NecessidadeAnualProdutoVO` |
| Necessidade líquida (bruta − disponível − em trânsito) | núcleo `calculateNetNeed` | `net_need` | calculada | Necessidade líquida | idem − `emEstoque` − `aReceber` |
| Ordem de fornecimento ao depósito central | Lei 14.133, art. 6º, X; glossário do núcleo | `supply_order` (do núcleo, `procurement.supply_order`) | reutiliza | Ordem de fornecimento | `OrdemDeFornecimentoRS` |
| Entrega da OF ao depósito em formato acordado | RF-05.6 | `supply_order_dispatch` | `sisprov.supply_order_dispatch` | Envio ao depósito | não existia |
| Saldo do depósito central por carga periódica | RF-05.7 | `depot_balance_snapshot` | `sisprov.depot_balance_snapshot` (`reference_date`) | Saldo do depósito | não existia |
| Depósito central (N1) | OS 04 | `central_depot` | rótulo e configuração; local de estoque em G2 | Depósito central | `LocalEstoque` N1 |
| Almoxarifado da OM (N2, N3) | OS 04 | escopo `unit`; local de estoque em G2 | PBAC | Almoxarifado | `LocalEstoque` N2/N3 |
| Distribuição ao militar | OS 19; DET RN-13 | `issue` (vocabulário do ledger: `issue`, `issue_return`) | `sisprov.clothing_issue`, movimento no ledger | Distribuição | não implementado |
| Tipo da distribuição | RF-13.1, 13.3 | `kind` ∈ `planejada` · `avulsa` (categorias da SDAB) | coluna | Planejada, Avulsa | não existia |
| Troca e devolução | RF-13.2 | `issue_return` com `reason_code` | ledger | Troca, Devolução | não existia |
| Aderência previsão × real | RF-09.1 | `forecast_adherence` | view | Aderência | não existia |

#### 5. Efetivo

| Conceito | Fonte | Identificador | Banco | Rótulo | Legado |
| --- | --- | --- | --- | --- | --- |
| SARAM | glossário `sisub-ubiquitous-language` | `saram` | `saram` | SARAM | `nrOrdem` |
| Posto ou graduação, quadro, especialidade | norma (sem equivalente fiel) | `posto`, `quadro`, `especialidade` | colunas | Posto, Quadro, Especialidade | idem |
| Data de praça ou incorporação | SIGPES, **a confirmar** | `enlisted_at` | coluna | Data de praça | não existia |
| Efetivo sincronizado do SIGPES | RF-08.3 | `sigpes_sync_run`, `core.*` a definir no change `core-sigpes-sync` | `core` | Efetivo | `efetivo_sigpes` (tabela replicada) |
| Região (agrupamento de OMs para o fallback da curva) | OS 15 §2.2 | `region` | reutiliza `core.units.parent_unit_id` (COMAR) se bastar; senão `sisprov.region` | Região | região do legado |

#### Scenario: Nome fora do glossário
- **WHEN** uma migration ou arquivo do SISPROV introduz identificador para um conceito listado aqui com outro nome (por exemplo `grupo_distribuicao`, `enxoval`, `familia_rumaer`)
- **THEN** a revisão do PR reprova e o nome volta ao glossário, ou o glossário é alterado neste spec antes

#### Scenario: Conceito novo
- **WHEN** um change `sisprov-*` precisa de conceito ausente desta tabela
- **THEN** a linha entra aqui no mesmo PR, com fonte, identificador, banco e rótulo
