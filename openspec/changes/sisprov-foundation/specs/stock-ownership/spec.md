## ADDED Requirements

### Requirement: Um estoque, dono SISPROV, para toda classe
Todo estoque do ERP, de qualquer classe de suprimento, SHALL viver no schema `inventory` e ser regido pelas regras do SISPROV (`@iefa/sisprov-domain/inventory` e as funções `inventory.*`). Nenhum app MUST manter ledger, saldo, custo médio ou fechamento de estoque próprio fora do `inventory`. A alimentação do sisub é uma classe desse estoque.

#### Scenario: Classe nova de estoque
- **WHEN** um change introduz uma classe nova de suprimento (por exemplo, fardamento)
- **THEN** ele acrescenta o valor ao CHECK de `core.item.catalog_scope` e os perfis da classe no schema dela, e movimenta pelo `inventory`, sem tabela de saldo própria

### Requirement: Local de estoque explícito
O sistema SHALL ter `inventory.stock_location` com OM dona (`unit_id`, obrigatório), cozinha opcional (`kitchen_id`, única), nível (`tier` ∈ `central_depot` · `unit_storeroom` · `kitchen`), nome e classes que guarda (`supply_classes`, não vazio). `tier = 'kitchen'` MUST valer se e somente se `kitchen_id` estiver preenchido. Toda cozinha SHALL ter exatamente um local `kitchen`, criado por trigger no cadastro da cozinha e acompanhando a troca de OM dela.

#### Scenario: Cozinha nova
- **WHEN** o sisub cadastra uma cozinha na OM 12
- **THEN** existe um `stock_location` com `tier = 'kitchen'`, `kitchen_id` da cozinha, `unit_id = 12` e `supply_classes = {alimentacao, auxiliar}`, sem nenhuma chamada a mais do app

#### Scenario: Cozinha muda de OM
- **WHEN** a cozinha passa da OM 12 para a OM 15
- **THEN** o `unit_id` do local dela passa a 15 na mesma transação

### Requirement: Classe do item e trava por local
A classe de suprimento de um item SHALL ser `core.item.catalog_scope`. Todo lote e todo movimento MUST ter a classe do item contida em `supply_classes` do local; a escrita fora disso é recusada pelo banco.

#### Scenario: Item de outra classe na cozinha
- **WHEN** uma escrita tenta lançar um item `fardamento` no local de uma cozinha (`{alimentacao, auxiliar}`)
- **THEN** o trigger recusa com erro que nomeia o item, a classe e o local

### Requirement: Permissão de estoque por local
O módulo `storage` SHALL ser o único módulo de estoque, para toda classe. Um grant `storage` vale para um local quando é global, quando é escopado à cozinha do local, ou quando é escopado a uma OM que cobre a OM do local pela hierarquia de apoio (`core.units.supporting_unit_id`). Deny (nível 0) na cozinha do local, na OM do local ou em qualquer apoiadora da cadeia MUST vencer o allow. Níveis: 1 consulta, 2 operação, 3 gestão (aprova ajuste e contagem, configura o local).

#### Scenario: Grant por OM alcança o almoxarifado e a cozinha da OM
- **WHEN** um usuário tem `storage` nível 2 escopado ao GAP-SJ, que apoia o IEFA
- **THEN** ele opera o almoxarifado e o local da cozinha do IEFA; um local de OM fora da cobertura é recusado

#### Scenario: Grant por cozinha continua valendo
- **WHEN** um usuário tem `storage` nível 3 escopado à cozinha 920
- **THEN** ele opera o local da cozinha 920 e nenhum outro

### Requirement: Lente por app
O sisub SHALL operar o estoque de alimentação pelas rotas `/storage/$kitchenId`, resolvendo a cozinha para o local dela e mostrando só as classes que o local guarda. O app SISPROV SHALL listar os locais que o grant `storage` alcança, com as classes de cada um. Quem só tem grant de cozinha MUST NOT precisar abrir o SISPROV para operar a cozinha.

#### Scenario: Operador da cozinha no sisub
- **WHEN** quem tem `storage` na cozinha 920 abre `/storage/920`
- **THEN** a tela opera o local da cozinha 920 e mostra só alimentação e auxiliar, como antes da mudança
