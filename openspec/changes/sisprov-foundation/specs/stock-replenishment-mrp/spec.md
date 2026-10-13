## MODIFIED Requirements

### Requirement: Política de estoque por cozinha×ingrediente
O sistema SHALL manter `inventory.stock_policy` com estoque mínimo, cobertura em dias e limiar de urgência opcional (UNIQUE local×item) e alertar quando o saldo projetado cruzar o ponto de pedido (consumo diário planejado × lead time estimado + estoque mínimo). Na alimentação, o consumo planejado vem do cardápio da cozinha dona do local.

#### Scenario: Alerta de ponto de pedido
- **WHEN** o saldo projetado de um item cai abaixo do ponto de pedido
- **THEN** o item entra na lista de sugestões de reposição do local com a quantidade sugerida
