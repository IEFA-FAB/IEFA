## MODIFIED Requirements

### Requirement: Ordem de Fornecimento por cozinha
O sistema SHALL manter `procurement.supply_order` (+ itens) vinculada a um empenho, com local de estoque de destino (`location_id` → `inventory.stock_location`), número, data de envio, **data prevista de entrega** e status (`draft | sent | partially_received | received | cancelled | expired`). A soma das quantidades das OFs de um empenho MUST NOT exceder a quantidade empenhada. A OF de alimentação vai para o local da cozinha; a de outra classe, para o almoxarifado da OM ou o depósito central.

#### Scenario: Emissão de OF
- **WHEN** o gestor emite uma OF de 200 KG contra um empenho com 500 KG disponíveis
- **THEN** a OF é criada com status `sent` e o disponível para novas OFs passa a 300 KG

#### Scenario: OF excede o empenho
- **WHEN** o gestor tenta emitir OF cuja quantidade ultrapassa o saldo do empenho
- **THEN** o sistema rejeita indicando o saldo disponível
