## ADDED Requirements

### Requirement: Item de fardamento é um `core.item` de tipo material
Todo item de fardamento distribuído ou estocado pelo SISPROV SHALL ser uma linha de `core.item` com `kind = 'material'`, e seu perfil (família, variante por gênero, tamanho, aplicabilidade) SHALL viver no schema `sisprov` com a MESMA chave primária (subtipo com PK compartilhada, técnica de `20260901120000_core_item_nucleus.sql`). O perfil MUST NOT ter identidade própria distinta do `core.item`. O `catalog_scope` do item é decidido no change do catálogo (`sisprov-catalog`), que cria o perfil.

#### Scenario: Perfil sem item
- **WHEN** uma escrita tenta criar o perfil de fardamento sem a linha correspondente em `core.item`
- **THEN** a FK da PK compartilhada recusa

#### Scenario: Mesmo id nos dois níveis
- **WHEN** um item de fardamento é criado
- **THEN** `core.item.id` e a PK do perfil em `sisprov` são o mesmo uuid, e qualquer tabela que referencie o item usa esse id

### Requirement: Vínculo opcional com o regulamento
O perfil de fardamento SHALL poder referenciar `rumaer.piece` (FK opcional, `on delete restrict`) quando a peça existe no RUMAER. O vínculo é referência regulamentar; o RUMAER MUST NOT passar a carregar tamanho, estoque ou distribuição. Item sem peça no regulamento é permitido e marcado como tal.

#### Scenario: Peça regulamentar removida
- **WHEN** alguém tenta apagar uma `rumaer.piece` referenciada por um perfil de fardamento
- **THEN** o banco recusa pela FK

### Requirement: Grade de tamanhos nasce no perfil
A grade de tamanhos (variante por gênero × tamanho) SHALL ser modelada no schema `sisprov` como parte do perfil, e cada tamanho concreto SHALL ser um item estocável (um `core.item` por variante × tamanho). O ledger do núcleo passa a aceitar esses itens no change `sisprov-core-inventory` (G1); até lá, o SISPROV MUST NOT movimentar estoque.

#### Scenario: Tamanho fora da grade
- **WHEN** um cadastro de tamanhos informa um valor que não existe na grade da variante
- **THEN** a escrita é recusada com a lista de tamanhos válidos
