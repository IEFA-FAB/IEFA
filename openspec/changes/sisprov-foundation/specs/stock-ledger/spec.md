## MODIFIED Requirements

### Requirement: Ledger imutável de movimentos
O sistema SHALL registrar todo movimento de estoque em `inventory.stock_movement`, append-only e sem soft delete. A imutabilidade MUST ser garantida por trigger `BEFORE UPDATE OR DELETE` que aborta a operação — grants/RLS não bastam, pois as server functions usam service role (que bypassa RLS). Correções MUST ser feitas por movimento de ajuste com justificativa. Cada movimento SHALL ter local de estoque (`location_id` → `inventory.stock_location`), item (`item_id` → `core.item`), lote, tipo (`receipt`, `production_issue`, `issue_return`, `leftover_return`, `waste`, `transfer_in`, `transfer_out`, `lot_split_in`, `lot_split_out`, `adjustment_in`, `adjustment_out`), quantidade positiva na unidade base, custo unitário/total, documento de origem e autor. Tipo novo (por exemplo, a saída ao militar do fardamento) entra no CHECK com o change que o usa.

#### Scenario: Tentativa de alteração
- **WHEN** qualquer cliente — inclusive uma server function com service role — tenta UPDATE ou DELETE em um movimento existente
- **THEN** o trigger aborta a operação com erro

#### Scenario: Correção de lançamento errado
- **WHEN** um operador lançou entrada de 50 KG mas o correto era 45 KG
- **THEN** a correção é um `adjustment_out` de 5 KG com justificativa obrigatória, preservando o lançamento original

### Requirement: Itens estocáveis — ingrediente XOR preparação congelada
`stock_lot`, `stock_movement` e toda tabela do `inventory` que identifica item SHALL referenciar `item_id` → `core.item`. Ingrediente e preparação congelada são subtipos de `core.item` com a mesma PK (`kitchen.ingredient`, `kitchen.frozen_preparation`); o que os distingue é o perfil, não a coluna. Item de outra classe (por exemplo, fardamento) é estocável pelo mesmo caminho.

#### Scenario: Lote de preparação congelada
- **WHEN** uma sobra reaproveitável gera `leftover_return` de uma preparação congelada
- **THEN** o lote é criado com `item_id` igual ao id da preparação, que existe em `core.item`

#### Scenario: Preparação sem item no núcleo
- **WHEN** uma escrita cria `kitchen.frozen_preparation`
- **THEN** a linha de `core.item` correspondente existe na mesma transação (trigger de sincronia), e a FK da PK compartilhada recusa preparação sem item

### Requirement: Saldo por cozinha, item e lote
O sistema SHALL expor o saldo atual via view `inventory.v_stock_balance`, agregando o ledger por local×item e por lote, com quantidade, valor total e última movimentação. Saldo de qualquer combinação sem movimentos MUST ser zero.

#### Scenario: Saldo após entrada e saída
- **WHEN** o local de uma cozinha tem entrada de 50 KG e saída de produção de 12 KG de um ingrediente
- **THEN** a view retorna saldo 38 KG para esse local×item

#### Scenario: Estado inicial
- **WHEN** nenhum movimento existe
- **THEN** a view retorna vazio/zero para todas as combinações

### Requirement: Valoração a custo médio ponderado
O sistema SHALL valorar o estoque pelo custo médio ponderado (MCASP): cada entrada recalcula o custo médio da combinação local×item; saídas usam o custo médio vigente. O custo unitário do lote é informativo (rastreio); a valoração contábil é sempre pelo custo médio. O cálculo MUST ser transacional (função SQL) para evitar corrida entre lançamentos simultâneos.

#### Scenario: Recálculo em nova entrada
- **WHEN** o saldo é 10 KG a R$ 4,00 e entra um lote de 10 KG a R$ 6,00
- **THEN** o custo médio passa a R$ 5,00 e a próxima saída é valorada a R$ 5,00

### Requirement: Inventário físico (contagem)
O sistema SHALL suportar contagem física via `inventory.inventory_count` (+ itens contados por lote), por local de estoque. Divergências entre contado e saldo do ledger SHALL gerar movimentos `adjustment_in`/`adjustment_out` vinculados à contagem, com justificativa. A contagem em si MUST NOT alterar saldo — só os ajustes derivados dela.

#### Scenario: Contagem com divergência
- **WHEN** o ledger indica 40 KG e a contagem física encontra 38 KG
- **THEN** ao confirmar a contagem, um `adjustment_out` de 2 KG é criado referenciando a contagem

#### Scenario: Contagem sem divergência
- **WHEN** a contagem confere com o saldo do ledger
- **THEN** a contagem é registrada e nenhum movimento é gerado

### Requirement: Transferência entre cozinhas
Transferência SHALL ser um par atômico `transfer_out` (local de origem) + `transfer_in` (local de destino) na mesma transação, com referência cruzada entre os movimentos e mesma quantidade. O lote de destino SHALL herdar código, validade e custo do lote de origem. O local de destino MUST guardar a classe do item.

#### Scenario: Transferência bem-sucedida
- **WHEN** o almoxarifado da OM transfere 20 KG do lote `L123` para o local da cozinha
- **THEN** são criados `transfer_out` na origem e `transfer_in` no destino com referência cruzada, e o destino passa a ter lote `L123` com a mesma validade e custo

#### Scenario: Destino que não guarda a classe
- **WHEN** a transferência leva um item `fardamento` para o local de uma cozinha
- **THEN** a transação inteira é revertida pela trava de classe e a origem mantém o saldo
