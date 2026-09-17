# stock-lot-labeling (delta)

## ADDED Requirements

### Requirement: Etiqueta interna de lote
Todo lote SHALL ter código curto único e SHALL poder imprimir etiqueta com código de barras desse código e o texto: item, lote, validade, local e data de entrada. A impressão SHALL funcionar pelo navegador em rolo térmico de 58 e 80 mm e em folha A4, individual ou em lote ao final do recebimento. A leitura da etiqueta SHALL identificar o lote.

#### Scenario: Etiquetas ao fim do recebimento
- **WHEN** o operador conclui o provisório com 12 lotes
- **THEN** pode imprimir as 12 etiquetas numa ação

#### Scenario: Lote sem lote do fornecedor
- **WHEN** o lote foi criado como `SEM-LOTE`
- **THEN** ele tem código curto próprio e etiqueta imprimível

### Requirement: Abrir, fracionar e descongelar
O sistema SHALL permitir mover quantidade de um lote para um lote derivado na mesma cozinha, com derivação `opened`, `portioned` ou `thawed`, referência ao lote de origem, instante da manipulação e validade igual à menor entre a validade de origem e o instante da manipulação somado ao prazo do ingrediente para aquela derivação. A operação SHALL gerar `lot_split_out` e `lot_split_in` na mesma transação, sem alterar saldo do item nem custo médio, e SHALL oferecer a impressão da etiqueta do lote derivado com designação, data de manipulação e validade.

#### Scenario: Descongelamento de frango
- **WHEN** o operador descongela 10 KG de um lote congelado válido por 60 dias e o prazo após descongelar é 2 dias
- **THEN** é criado lote derivado `thawed` de 10 KG com validade de 2 dias e a etiqueta é oferecida

#### Scenario: Prazo não cadastrado
- **WHEN** o ingrediente não tem prazo para a derivação escolhida
- **THEN** o operador informa a validade manualmente e a informação fica registrada como manual
