# stock-ledger Specification

## Purpose
TBD - created by archiving change sisub-inventory-cycle. Update Purpose after archive.
## Requirements
### Requirement: Ledger imutável de movimentos
O sistema SHALL registrar todo movimento de estoque em `inventory.stock_movement`, append-only e sem soft delete. A imutabilidade MUST ser garantida por trigger `BEFORE UPDATE OR DELETE` que aborta a operação — grants/RLS não bastam, pois as server functions usam service role (que bypassa RLS). Correções MUST ser feitas por movimento de ajuste com justificativa. Cada movimento SHALL ter `kitchen_id` (bigint), item estocado (ver requirement de itens estocáveis), lote, tipo (`receipt`, `production_issue`, `leftover_return`, `waste`, `transfer_in`, `transfer_out`, `adjustment_in`, `adjustment_out`), quantidade positiva na unidade base, custo unitário/total, documento de origem e autor.

#### Scenario: Tentativa de alteração
- **WHEN** qualquer cliente — inclusive uma server function com service role — tenta UPDATE ou DELETE em um movimento existente
- **THEN** o trigger aborta a operação com erro

#### Scenario: Correção de lançamento errado
- **WHEN** um operador lançou entrada de 50 KG mas o correto era 45 KG
- **THEN** a correção é um `adjustment_out` de 5 KG com justificativa obrigatória, preservando o lançamento original

### Requirement: Itens estocáveis — ingrediente XOR preparação congelada
`stock_lot` e `stock_movement` SHALL referenciar exatamente um de `ingredient_id` ou `frozen_preparation_id` (CHECK `num_nonnulls(...) = 1`, mesmo padrão de `recipe_ingredients_source_xor`), permitindo estocar tanto insumos quanto sobras reaproveitadas/preparações congeladas.

#### Scenario: Lote de preparação congelada
- **WHEN** uma sobra reaproveitável gera `leftover_return` de uma preparação congelada
- **THEN** o lote é criado com `frozen_preparation_id` preenchido e `ingredient_id` nulo

#### Scenario: Referência dupla rejeitada
- **WHEN** uma escrita tenta preencher `ingredient_id` e `frozen_preparation_id` no mesmo lote
- **THEN** o banco rejeita pela constraint XOR

### Requirement: Lotes com validade
O sistema SHALL manter `inventory.stock_lot` por cozinha×item com código de lote, validade, custo e origem (`goods_receipt_item`). Todo movimento de entrada por recebimento MUST referenciar um lote; quando o operador não informa lote, o sistema SHALL gerar lote sintético `SEM-LOTE-<data>` para não bloquear a operação.

#### Scenario: Entrada com lote informado
- **WHEN** um recebimento definitivo informa lote `L123` com validade 2026-12-31
- **THEN** o `stock_lot` é criado com esses dados e o movimento de entrada o referencia

#### Scenario: Entrada sem lote
- **WHEN** o operador confirma recebimento sem informar lote
- **THEN** o sistema cria o lote sintético `SEM-LOTE-<data>` e prossegue

### Requirement: Saldo por cozinha, item e lote
O sistema SHALL expor o saldo atual via view `inventory.v_stock_balance`, agregando o ledger por cozinha×item e por lote, com quantidade, valor total e última movimentação. Saldo de qualquer combinação sem movimentos MUST ser zero.

#### Scenario: Saldo após entrada e saída
- **WHEN** uma cozinha tem entrada de 50 KG e saída de produção de 12 KG de um ingrediente
- **THEN** a view retorna saldo 38 KG para essa cozinha×ingrediente

#### Scenario: Estado inicial
- **WHEN** o schema é criado e nenhum movimento existe
- **THEN** a view retorna vazio/zero para todas as combinações

### Requirement: Valoração a custo médio ponderado
O sistema SHALL valorar o estoque pelo custo médio ponderado (MCASP): cada entrada recalcula o custo médio da combinação cozinha×item; saídas usam o custo médio vigente. O custo unitário do lote é informativo (rastreio); a valoração contábil é sempre pelo custo médio. O cálculo MUST ser transacional (função SQL) para evitar corrida entre lançamentos simultâneos.

#### Scenario: Recálculo em nova entrada
- **WHEN** o saldo é 10 KG a R$ 4,00 e entra um lote de 10 KG a R$ 6,00
- **THEN** o custo médio passa a R$ 5,00 e a próxima saída é valorada a R$ 5,00

### Requirement: Inventário físico (contagem)
O sistema SHALL suportar contagem física via `inventory.inventory_count` (+ itens contados por lote), por cozinha. Divergências entre contado e saldo do ledger SHALL gerar movimentos `adjustment_in`/`adjustment_out` vinculados à contagem, com justificativa. A contagem em si MUST NOT alterar saldo — só os ajustes derivados dela.

#### Scenario: Contagem com divergência
- **WHEN** o ledger indica 40 KG e a contagem física encontra 38 KG
- **THEN** ao confirmar a contagem, um `adjustment_out` de 2 KG é criado referenciando a contagem

#### Scenario: Contagem sem divergência
- **WHEN** a contagem confere com o saldo do ledger
- **THEN** a contagem é registrada e nenhum movimento é gerado

### Requirement: Transferência entre cozinhas
Transferência SHALL ser um par atômico `transfer_out` (origem) + `transfer_in` (destino) na mesma transação, com referência cruzada entre os movimentos e mesma quantidade. O lote de destino SHALL herdar código, validade e custo do lote de origem.

#### Scenario: Transferência bem-sucedida
- **WHEN** a cozinha A transfere 20 KG do lote `L123` para a cozinha B
- **THEN** são criados `transfer_out` em A e `transfer_in` em B com referência cruzada, e B passa a ter lote `L123` com a mesma validade e custo

#### Scenario: Falha parcial impossível
- **WHEN** a criação do movimento de destino falha
- **THEN** a transação inteira é revertida e a origem mantém o saldo

