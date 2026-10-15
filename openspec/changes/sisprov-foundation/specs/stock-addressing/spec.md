## ADDED Requirements

### Requirement: Níveis de estoque e abastecedor
Todo local de estoque SHALL ter nível (`level` ∈ 1, 2, 3) e MAY ter abastecedor (`supplied_by_location_id`). O abastecedor MUST ser um local ativo de nível estritamente menor; o nível 1 MUST NOT ter abastecedor. Local de cozinha MUST ser nível 3. `receives_direct` marca o local que recebe do fornecedor sem passar pelo nível de cima. `gln`, quando informado, MUST ter 13 dígitos com dígito verificador GS1 válido e ser único.

#### Scenario: Abastecedor de nível igual ou maior
- **WHEN** um local de nível 2 é configurado com abastecedor de nível 2 ou 3
- **THEN** o banco recusa nomeando os dois níveis

#### Scenario: Cozinha nova
- **WHEN** o sisub cadastra uma cozinha com OM
- **THEN** o local dela nasce com nível 3, `receives_direct = true` e sem endereçamento

### Requirement: Posições em árvore por local
Num local com `uses_positions` (nunca o de cozinha), o sistema SHALL manter `inventory.storage_position` em árvore, com tipo (`building`, `sector`, `rack`, `shelf`, `bin`), segmento (`code`) e endereço completo (`address`) mantido pelo banco e único no local entre as posições ativas. A posição filha MUST ser do mesmo local e de tipo mais fundo que a mãe. Só `shelf` e `bin` guardam estoque. Posição com estoque nela ou abaixo dela MUST NOT ser desativada.

#### Scenario: Endereço derivado
- **WHEN** a prateleira `P3` é criada na estante `E05` do setor `S2` do depósito `D1`
- **THEN** o endereço gravado é `D1-S2-E05-P3`

#### Scenario: Estante dentro de prateleira
- **WHEN** alguém cria uma estante cuja mãe é uma prateleira
- **THEN** o banco recusa: o tipo da filha tem de ser mais fundo que o da mãe

#### Scenario: Local sem endereçamento
- **WHEN** alguém cria uma posição num local com `uses_positions = false` (por exemplo, uma cozinha)
- **THEN** o banco recusa

### Requirement: Lote endereçado e pendência de endereçamento
`stock_lot.position_id`, quando preenchido, SHALL apontar para posição ativa que guarda estoque e é do mesmo local do lote. Lote que entra num local endereçado sem posição SHALL aparecer como pendente de endereçamento até ser guardado. O lote derivado SHALL herdar a posição do lote de origem.

#### Scenario: Recebimento no depósito
- **WHEN** um recebimento é efetivado num local endereçado
- **THEN** os lotes criados ficam sem posição e entram na lista de pendentes do local

#### Scenario: Posição de outro local
- **WHEN** alguém tenta guardar um lote numa posição de outro local
- **THEN** o banco recusa

### Requirement: Unidades de movimentação
O sistema SHALL ter `inventory.handling_unit` com pallet (código GIAI) e caixa (SSCC de 18 dígitos com dígito verificador GS1, ligada a um lote do mesmo local, com quantidade, peso e categoria). A caixa MAY estar num pallet do mesmo local; caixa no pallet MUST NOT ter posição própria (vale a do pallet). Código MUST ser único por tipo entre as unidades abertas. A posição do lote encaixotado SHALL acompanhar as caixas abertas (com caixas em posições diferentes, a primeira da rota de separação), e mover o lote com caixa aberta MUST ser recusado.

#### Scenario: SSCC inválido
- **WHEN** alguém cadastra uma caixa com SSCC de dígito verificador errado
- **THEN** a escrita é recusada nomeando o código

#### Scenario: Caixa no pallet
- **WHEN** uma caixa é posta num pallet
- **THEN** a posição da caixa passa a ser a do pallet, e mover o pallet move a caixa

### Requirement: Movimentação entre posições
Guardar ou mover lote ou unidade SHALL ser feito por `inventory.move_to_position`, que confere local, posição e tipo, atualiza a posição e grava `inventory.position_move` na mesma transação. `position_move` MUST ser append-only. Mover MUST NOT gerar movimento no ledger nem alterar saldo, custo ou fechamento.

#### Scenario: Remanejar na prateleira
- **WHEN** o operador move um lote de `D1-S2-E05-P3` para `D1-S2-E06-P1`
- **THEN** o lote passa à posição nova, há uma linha em `position_move` com as duas posições, e o saldo do local é o mesmo

### Requirement: Última conferência da posição
Ao aprovar uma contagem, o banco SHALL gravar `last_counted_at` nas posições ATIVAS onde estão os lotes contados naquela cadeia de contagem. A gravação MUST NOT impedir a aprovação.

#### Scenario: Prateleira desativada depois
- **WHEN** um lote contado está numa prateleira cuja estante foi desativada depois
- **THEN** a contagem é aprovada normalmente e a posição desativada não é marcada

### Requirement: Lista de separação
`inventory.create_picking_list` SHALL receber itens e quantidades de um local (o mesmo item em mais de uma linha soma), alocar entre os lotes alocáveis (sem quarentena, dentro da validade, com saldo) na ordem da saída — `usar primeiro`, validade, entrada — e gravar `inventory.picking_list` numerada por local e ano, com linhas ordenadas pela ordem de separação da posição e pelo endereço. A lista MUST NOT mover estoque. Item sem saldo suficiente MUST aparecer com a falta, e não ser omitido.

#### Scenario: Separar 30 camisas
- **WHEN** a lista pede 30 unidades de um item com 20 no lote que vence antes e 40 no seguinte
- **THEN** a lista tem 20 do primeiro e 10 do segundo, na ordem de separação das posições deles

#### Scenario: Falta
- **WHEN** a lista pede 50 e o local tem 35 alocáveis
- **THEN** a lista registra 35 alocados e 15 em falta para o item
