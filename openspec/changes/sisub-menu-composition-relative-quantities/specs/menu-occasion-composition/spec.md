## ADDED Requirements

### Requirement: Evento e apoio compostos por refeições próprias

Todo cardápio de evento ou de apoio SHALL ser composto por zero ou mais refeições próprias, cada uma
com nome livre, horário do calendário (tipo de refeição), grupos e preparações. Todo item de evento
ou de apoio MUST pertencer a uma refeição do mesmo cardápio. O cardápio semanal MUST continuar na
grade de dias × tipos de refeição, sem refeições próprias.

#### Scenario: Apoio simples é uma lista de preparações

- **WHEN** a nutricionista cria um cardápio de apoio sem mexer na estrutura
- **THEN** ele nasce com uma refeição "Kit" sem grupos
- **AND** o editor mostra as preparações dessa refeição em lista, sem colunas de grupo

#### Scenario: Kit com refeição e lanche

- **WHEN** a nutricionista cadastra o padrão Lanche de Bordo C com a refeição "Refeição" (carboidrato, proteína, legume, sobremesa) e a refeição "Lanche" (sanduíche, bebida)
- **THEN** o padrão é salvo com as duas refeições e suas preparações
- **AND** um pedido aceito de 10 kits lança no quadro de produção as preparações das duas refeições, cada uma com as porções de 10 kits

#### Scenario: Item de apoio sem refeição é recusado

- **WHEN** uma escrita de cardápio de apoio traz uma preparação sem refeição do cardápio
- **THEN** o servidor recusa com a mensagem de que todo item pertence a uma refeição

#### Scenario: Padrão de lanche fica no horário de sistema

- **WHEN** um cardápio de apoio classificado como padrão de lanche é salvo com uma refeição em outro horário
- **THEN** o servidor grava a refeição no horário de sistema "Lanches de Bordo/Apoio"

### Requirement: Quantidade de preparações por grupo

Cada grupo de uma refeição de evento ou de apoio SHALL aceitar, opcionalmente, o número mínimo e
máximo de preparações esperadas (inteiros de 0 a 50, mínimo ≤ máximo). O editor MUST mostrar a
contagem atual contra a esperada e avisar quando ficar fora. Contagem fora do esperado MUST NOT
impedir salvar, adaptar ou aplicar o cardápio. A contagem vale em modelo global e em cardápio local.

#### Scenario: Padrão da SDAB só com a composição

- **WHEN** a SDAB cadastra o modelo global "Padrão A — Especial/Solene" com a refeição "Almoço institucional" e os grupos "Proteínas 2", "Guarnições 2", "Saladas 2 a 3", sem preparação nenhuma
- **THEN** o modelo é salvo
- **AND** o catálogo mostra os grupos com a quantidade esperada

#### Scenario: Faltou uma proteína

- **WHEN** a cozinha preenche "Proteínas 2" com uma preparação só e salva
- **THEN** o cardápio é salvo
- **AND** o grupo mostra "1 de 2" com aviso

#### Scenario: Contagem inválida

- **WHEN** uma escrita traz um grupo com mínimo 8 e máximo 6
- **THEN** o servidor recusa com erro de validação

### Requirement: Adaptar escolhe as refeições

Ao adaptar um cardápio de evento ou de apoio, o usuário SHALL poder escolher quais refeições do
modelo levar. A cópia MUST conter só as refeições escolhidas, com os grupos (e a contagem) e as
preparações delas. Sem escolha explícita, todas as refeições são copiadas.

#### Scenario: Só o coquetel do padrão B

- **WHEN** a cozinha adapta o "Padrão B — Institucional" marcando só a refeição "Coquetel"
- **THEN** a cópia local tem uma refeição, "Coquetel", com os grupos e as preparações dela
- **AND** café da manhã, brunch, almoço e jantar do modelo não vêm
