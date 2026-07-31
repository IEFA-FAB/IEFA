# measure-unit-canonical — Fase 2a

## ADDED Requirements

### Requirement: Catálogo canônico de unidades de medida
O sistema SHALL manter a tabela `core.measure_unit` com códigos canônicos em maiúsculas (mínimo: KG, G, LT, ML, UN, DZ), descrição e dimensão (massa, volume, contagem). Toda tabela nova deste change MUST referenciar/validar unidades contra esse catálogo.

#### Scenario: Unidade canônica aceita
- **WHEN** um registro novo de estoque informa unidade `KG`
- **THEN** o registro é aceito

#### Scenario: Unidade fora do catálogo
- **WHEN** um registro novo de estoque informa unidade `caixa` (não canônica)
- **THEN** o sistema rejeita a escrita com erro de validação

### Requirement: Normalização dos dados existentes
O backfill SHALL normalizar os valores existentes de `measure_unit` (em `ingredient`, `ingredient_item`, `purchase_item`, `procurement_list_item` e correlatas) via `upper(trim())` + mapa de sinônimos, sem alterar valores não-mapeáveis, que MUST ser listados em fila de revisão.

#### Scenario: Normalização de caixa inconsistente
- **WHEN** o backfill encontra `kg` e `KG` no mesmo domínio
- **THEN** ambos ficam `KG` após a migração

#### Scenario: Valor não-mapeável
- **WHEN** o backfill encontra um valor sem correspondência no mapa de sinônimos (ex.: `fardo 5x2`)
- **THEN** o valor original é preservado e o registro aparece na fila de revisão para tratamento manual

### Requirement: Conversão única na fronteira
Quantidades persistidas no ledger de estoque MUST estar na unidade base do `ingredient`; a conversão de unidade de compra/embalagem para unidade base SHALL ocorrer uma única vez, no recebimento, e o fator usado SHALL ser gravado no documento de origem.

#### Scenario: Entrada em caixas
- **WHEN** um recebimento registra 10 caixas de 5 KG de um ingrediente com unidade base KG
- **THEN** o movimento de estoque registra 50 KG e o item do recebimento guarda o fator de conversão aplicado

### Requirement: Precedência de resolução de unidade
Ingrediente cuja unidade base estiver pendente na fila de revisão (não canônica) MUST NOT receber movimentos de estoque. O sistema SHALL bloquear a operação com mensagem que identifique o ingrediente, a pendência e o caminho de resolução (fila de revisão), evitando deadlock operacional silencioso no recebimento.

#### Scenario: Recebimento de ingrediente com unidade pendente
- **WHEN** um recebimento inclui item cujo ingrediente tem unidade não-mapeável (na fila de revisão)
- **THEN** o sistema bloqueia a inclusão desse item, apontando a fila de revisão, sem impedir os demais itens do recebimento
