## ADDED Requirements

### Requirement: Fila de requisições da cozinha

O sistema SHALL listar em `/kitchen/$kitchenId/snack-requests`, para `kitchen:1` sobre a cozinha, as requisições dela ordenadas por data de retirada, filtráveis por status e período, com as marcas "Fora do prazo", "Diverge da sugestão", "Passageiros opcionais" e "Revisão do padrão vencida". A cozinha da requisição MUST ser lida da linha, nunca do input.

#### Scenario: Requisição de outra cozinha

- **WHEN** um usuário com `kitchen:2` na cozinha X tenta decidir uma requisição da cozinha Y
- **THEN** a operação é negada

### Requirement: Decisão da SSU

Usuário com `kitchen:2` SHALL aceitar ou recusar requisição em `submitted`. Recusa MUST exigir motivo. Aceite MUST exigir o valor do lanche (`unit_value`, Anexo E item 11) e SHALL permitir reduzir as quantidades marcadas como opcionais, gravando o ajuste no evento.

#### Scenario: Aceitar sem valor

- **WHEN** o aceite é enviado sem `unit_value`
- **THEN** a operação é rejeitada

#### Scenario: Recusar pax opcional

- **WHEN** a cozinha aceita zerando os passageiros opcionais da Classe C
- **THEN** a requisição vai a `accepted` e o evento registra quantidades antes e depois

### Requirement: Andamento de produção

Usuário com `kitchen:2` ou `kitchen-production:1` SHALL mover a requisição por `accepted → in_production → ready`. Passar para `ready` MUST exigir o registro de coleta de amostra (7.4.6), com data/hora e responsável, e a tela MUST lembrar a guarda por 72 h.

#### Scenario: Pronto sem amostra

- **WHEN** alguém tenta marcar `ready` sem amostra registrada
- **THEN** a operação é rejeitada

### Requirement: Consolidado de produção do dia

O sistema SHALL mostrar em `/kitchen/$kitchenId/snack-requests/production?date=` o total das requisições `accepted` e `in_production` com retirada na data: kits por padrão, porções por preparação (somando todos os padrões) e material de apoio previsto, cada total com link para as requisições de origem.

#### Scenario: Duas requisições usam o mesmo sanduíche

- **WHEN** a requisição 1 pede 6 kits e a 2 pede 4 kits de padrões que levam 1 porção de "Sanduíche natural de frango"
- **THEN** o consolidado mostra 10 porções dessa preparação, com as duas origens

### Requirement: Etiqueta do lanche

O sistema SHALL gerar etiquetas imprimíveis por kit com: OM produtora, nome do padrão e das preparações, data de fabricação, validade (`fabricação + shelf_life_hours`, default 24 h), valor energético do kit e o texto "Próprio para consumo imediato" (7.4.5). Quando a cobertura nutricional for parcial a etiqueta MUST indicar isso em vez de mostrar valor incompleto.

#### Scenario: Imprimir etiquetas de 10 kits

- **WHEN** a cozinha imprime as etiquetas de uma requisição com 10 kits
- **THEN** saem 10 etiquetas com todos os campos de 7.4.5

### Requirement: Retirada, cautela e devolução

Ao registrar a retirada (`ready → delivered`) o sistema SHALL registrar o material cautelado (garrafa térmica, caixa térmica, hotbox, cooler, outro, com quantidade). A requisição SHALL ir a `closed` só quando todo o material estiver devolvido. Cancelamento depois de `in_production` MUST marcar devolução pendente e a tela MUST informar que o perecível devolvido não é reaproveitado (7.4.4, 7.4.11).

#### Scenario: Fechar com garrafa não devolvida

- **WHEN** a cautela tem 2 garrafas térmicas e só 1 foi devolvida
- **THEN** a requisição não pode ir a `closed`

#### Scenario: Missão cancelada com lanche pronto

- **WHEN** a requisição em `ready` é cancelada pela cozinha
- **THEN** ela vai a `cancelled` com devolução pendente
- **AND** a tela avisa que o perecível não volta ao estoque

### Requirement: Pedido aceito entra no quadro de produção, discriminado

No aceite, o sistema SHALL lançar o pedido no quadro da Produção Cozinha na data civil de Brasília da retirada, sob o tipo de refeição de sistema "Lanches de Bordo/Apoio", com um item por (linha × preparação do padrão), `planned_portion_quantity = kits aprovados × porções por kit` e `origin_snack_request_id` apontando para o pedido, e a tarefa de produção pendente de cada item. O quadro MUST identificar, em cada item de lanche, o pedido (missão, destino, retirada) e o padrão. O tipo de refeição de sistema MUST NOT aparecer nos seletores de cardápio e MUST NOT ser editável ou excluível.

#### Scenario: Aceitar pedido de 6 kits

- **WHEN** a cozinha aceita um pedido com 6 kits de um padrão com 1 sanduíche e 1 suco por kit, retirada às 06:00 de 03/10 (Brasília)
- **THEN** o quadro de 03/10 ganha, sob "Lanches de Bordo/Apoio", 6 porções de sanduíche e 6 de suco marcadas com a missão do pedido
- **AND** as duas tarefas de produção nascem pendentes

#### Scenario: Dois aceites simultâneos no mesmo dia

- **WHEN** dois pedidos da mesma cozinha e do mesmo dia são aceitos ao mesmo tempo
- **THEN** existe um único cardápio "Lanches de Bordo/Apoio" naquele dia, com os itens dos dois pedidos

#### Scenario: Cancelamento tira do quadro

- **WHEN** um pedido `accepted` é cancelado
- **THEN** os itens dele somem do quadro de produção

#### Scenario: Tipo de sistema fora dos seletores

- **WHEN** a cozinha abre o cardápio semanal
- **THEN** "Lanches de Bordo/Apoio" não aparece como refeição
- **AND** uma tentativa de renomear ou excluir o tipo de sistema não altera nada
