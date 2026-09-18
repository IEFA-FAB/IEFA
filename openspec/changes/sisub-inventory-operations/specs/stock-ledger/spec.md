# stock-ledger (delta)

## ADDED Requirements

### Requirement: Instante físico do movimento
Todo movimento SHALL ter `occurred_at` (instante físico) além de `created_at` (lançamento). `occurred_at` SHALL ter default igual ao lançamento, MAY ser anterior apenas dentro do mesmo dia no fuso de Brasília, e MUST NOT ser anterior ao instante de contagem aprovada que inclua o item. Saldo em instante, competência e contagem SHALL usar `occurred_at`.

#### Scenario: Baixa lançada à tarde
- **WHEN** a saída física ocorreu às 09:00 e é lançada às 14:00 com `occurred_at` 09:00
- **THEN** o saldo do lote às 10:00 já considera a saída

#### Scenario: Retroativo antes de contagem
- **WHEN** alguém tenta lançar saída com `occurred_at` anterior a uma contagem aprovada do item
- **THEN** o banco recusa

### Requirement: Escrita no ledger só pelas funções do módulo
Inserção em `inventory.stock_movement` MUST ocorrer apenas por funções SQL do módulo, verificado por trigger que exige marcador de sessão definido por essas funções. As funções de `inventory` SHALL ser `SECURITY INVOKER` sem permissão de execução para `public`, `anon` e `authenticated`, e as tabelas de `inventory` MUST NOT ter leitura para `authenticated`.

#### Scenario: Insert direto com service role
- **WHEN** uma server function insere em `stock_movement` sem passar por função do módulo
- **THEN** o banco recusa

#### Scenario: PostgREST autenticado
- **WHEN** uma sessão autenticada de qualquer app consulta `inventory.goods_receipt_item_lot` ou chama `inventory.transfer_stock` pelo PostgREST
- **THEN** o acesso é negado

### Requirement: Quarentena de lote
`stock_lot` SHALL ter marcação de quarentena com autor, instante e motivo. Lote em quarentena MUST NOT ser alocado em saída nem contado como disponível, e a quarentena SHALL ser encerrada por ajuste lançado ou liberação por nível 3.

#### Scenario: Câmara falhou no sábado
- **WHEN** o nível 2 coloca em quarentena o lote de carne da câmara 2
- **THEN** a requisição de domingo não sugere esse lote, mesmo com o ajuste ainda pendente

### Requirement: Saída sem lote é pendência
Movimento de saída sem lote SHALL gerar alerta ao nível 3 da cozinha, SHALL aparecer como pendência do item em contagem que o inclua e SHALL ser regularizado por ajuste ou contagem aprovada.

#### Scenario: Falta registrada na saída
- **WHEN** uma saída de 12 KG encontra só 10 KG em lotes
- **THEN** 2 KG são gravados sem lote, o nível 3 é alertado e a próxima contagem do item mostra a pendência

## MODIFIED Requirements

### Requirement: Ledger imutável de movimentos
O sistema SHALL registrar todo movimento de estoque em `inventory.stock_movement`, append-only e sem soft delete. A imutabilidade MUST ser garantida por trigger `BEFORE UPDATE OR DELETE` que aborta a operação — grants/RLS não bastam, pois as server functions usam service role. Correções MUST ser feitas por documento de ajuste (capability `stock-adjustment`). Cada movimento SHALL ter `kitchen_id` (bigint), item estocado, lote (nulo apenas em saída sem saldo), tipo (`receipt`, `production_issue`, `issue_return`, `leftover_return`, `waste`, `transfer_in`, `transfer_out`, `lot_split_in`, `lot_split_out`, `adjustment_in`, `adjustment_out`), `reason_code` (obrigatório em `waste` e `adjustment_*`), quantidade positiva na unidade base, custo unitário/total, documento de origem, `occurred_at` e autor. A classificação de cada tipo como entrada ou saída MUST ser única no domínio e coberta por teste de contrato contra as funções SQL, a view de saldo e o fechamento mensal.

#### Scenario: Tentativa de alteração
- **WHEN** qualquer cliente — inclusive com service role — tenta UPDATE ou DELETE em um movimento
- **THEN** o trigger aborta a operação com erro

#### Scenario: Correção de lançamento errado
- **WHEN** uma entrada de 50 KG deveria ter sido de 45 KG
- **THEN** a correção é um ajuste `entry_error_out` de 5 KG referenciando o movimento original, que é preservado

#### Scenario: Devolução no fechamento
- **WHEN** o mês tem uma `issue_return` de 2 KG
- **THEN** o fechamento a soma como entrada

### Requirement: Valoração a custo médio ponderado
O sistema SHALL valorar o estoque pelo custo médio ponderado (MCASP): cada entrada recalcula o custo médio da combinação cozinha×item; saídas usam o custo médio vigente. O custo unitário do lote é informativo (rastreio). O cálculo MUST ocorrer sob trava da linha de custo da combinação, criada se inexistente sem erro de concorrência. Entradas sem custo explícito (`adjustment_in`) SHALL usar o custo médio vigente; com média zero, o último custo de recebimento; sem nenhum, a escrita MUST ser recusada. `issue_return` SHALL usar o custo médio das saídas daquele lote pela requisição. `transfer_in` SHALL usar o custo do `transfer_out` correspondente. `lot_split_*` MUST NOT alterar o custo médio. `leftover_return` de preparação congelada SHALL entrar a custo zero. Entrada sobre saldo menor ou igual a zero SHALL definir a média como o custo da entrada.

#### Scenario: Recálculo em nova entrada
- **WHEN** o saldo é 10 KG a R$ 4,00 e entra um lote de 10 KG a R$ 6,00
- **THEN** o custo médio passa a R$ 5,00 e a próxima saída é valorada a R$ 5,00

#### Scenario: Sobra de inventário não dilui o custo
- **WHEN** o saldo é 10 KG a R$ 5,00 e um ajuste de sobra de 2 KG entra sem custo informado
- **THEN** o ajuste é valorado a R$ 5,00/KG e o custo médio permanece R$ 5,00

#### Scenario: Entradas concorrentes
- **WHEN** um recebimento de 10 KG a R$ 6,00 e um ajuste de sobra de 2 KG sem custo são gravados ao mesmo tempo sobre 10 KG a R$ 4,00
- **THEN** o resultado é igual ao de alguma ordem sequencial das duas escritas

#### Scenario: Entrada sobre saldo negativo
- **WHEN** o saldo é −2 KG e entram 10 KG a R$ 6,00
- **THEN** o custo médio passa a R$ 6,00

### Requirement: Inventário físico (contagem)
O inventário físico SHALL seguir a capability `stock-count`, e a carga inicial a capability `stock-opening-balance`. A contagem em si MUST NOT alterar saldo; só o ajuste gerado pela aprovação cria movimentos.

#### Scenario: Contagem com divergência
- **WHEN** o ledger indica 40 KG no instante da contagem e a contagem aprovada encontra 38 KG
- **THEN** um ajuste `count_loss` de 2 KG é lançado referenciando a contagem

#### Scenario: Contagem sem divergência
- **WHEN** a contagem aprovada confere em todas as linhas
- **THEN** nenhum movimento é gerado

### Requirement: Transferência entre cozinhas
Transferência SHALL ser um par atômico `transfer_out` (origem) + `transfer_in` (destino) na mesma transação, com referência cruzada, mesma quantidade e mesmo custo unitário (custo médio da origem), com o lote de origem travado. O lote de destino SHALL herdar código e validade do lote de origem.

#### Scenario: Transferência bem-sucedida
- **WHEN** a cozinha A, com custo médio R$ 5,00, transfere 20 KG do lote `L123` (comprado a R$ 6,00) para B
- **THEN** A reduz R$ 100,00, B aumenta R$ 100,00, e B tem lote `L123` com a mesma validade

#### Scenario: Falha parcial impossível
- **WHEN** a criação do movimento de destino falha
- **THEN** a transação inteira é revertida e a origem mantém o saldo
