## ADDED Requirements

### Requirement: Item de fardamento é um `core.item` de classe fardamento
Todo item de fardamento distribuído ou estocado SHALL ser uma linha de `core.item` com `kind = 'material'` e `catalog_scope = 'fardamento'` (valor criado pela migration `inventory_multiclass`), e seu perfil (família, variante por gênero, tamanho, aplicabilidade) SHALL viver no schema da classe, criado no change do catálogo, com a MESMA chave primária (subtipo com PK compartilhada, técnica de `20260901120000_core_item_nucleus.sql`). O perfil MUST NOT ter identidade própria distinta do `core.item`.

#### Scenario: Perfil sem item
- **WHEN** uma escrita tenta criar o perfil de fardamento sem a linha correspondente em `core.item`
- **THEN** a FK da PK compartilhada recusa

#### Scenario: Mesmo id nos dois níveis
- **WHEN** um item de fardamento é criado
- **THEN** `core.item.id` e a PK do perfil são o mesmo uuid, e qualquer tabela que referencie o item usa esse id

### Requirement: Vínculo opcional com o regulamento
O perfil de fardamento SHALL poder referenciar `rumaer.piece` (FK opcional, `on delete restrict`) quando a peça existe no RUMAER. O vínculo é referência regulamentar; o RUMAER MUST NOT passar a carregar tamanho, estoque ou distribuição. Item sem peça no regulamento é permitido e marcado como tal.

#### Scenario: Peça regulamentar removida
- **WHEN** alguém tenta apagar uma `rumaer.piece` referenciada por um perfil de fardamento
- **THEN** o banco recusa pela FK

### Requirement: Grade de tamanhos nasce no perfil
A grade de tamanhos (variante por gênero × tamanho) SHALL ser modelada no schema da classe como parte do perfil, e cada tamanho concreto SHALL ser um item estocável (um `core.item` por variante × tamanho), movimentado pelo `inventory` como qualquer item (`stock-ownership`).

#### Scenario: Tamanho fora da grade
- **WHEN** um cadastro de tamanhos informa um valor que não existe na grade da variante
- **THEN** a escrita é recusada com a lista de tamanhos válidos
