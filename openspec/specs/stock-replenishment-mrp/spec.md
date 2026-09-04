# stock-replenishment-mrp Specification

## Purpose
TBD - created by archiving change sisub-inventory-cycle. Update Purpose after archive.
## Requirements
### Requirement: Necessidade líquida
O sistema SHALL calcular, por cozinha×ingrediente e horizonte de planejamento, a necessidade líquida: demanda bruta dos cardápios planejados (via `scaleIngredientQuantity`) **corrigida por `correction_factor` e `rehydration_index`** (herança: override da receita → valor do ingrediente → 1), menos saldo disponível (excluindo lotes que vencem dentro do horizonte), menos quantidades em trânsito (OFs enviadas e não recebidas). As fórmulas existentes de ATA (`calculateAtaNeeds`) MUST permanecer inalteradas.

#### Scenario: Abatimento de estoque e trânsito
- **WHEN** a demanda bruta corrigida é 100 KG, há 30 KG em estoque válido e 20 KG em OF enviada
- **THEN** a necessidade líquida é 50 KG

#### Scenario: Lote vencendo dentro do horizonte
- **WHEN** 10 KG do saldo vencem antes do fim do horizonte de planejamento
- **THEN** esses 10 KG não contam como disponíveis e o sistema sinaliza o lote para consumo prioritário

#### Scenario: Fator de correção aplicado
- **WHEN** um ingrediente tem `correction_factor = 1.2` e demanda líquida de receita de 100 KG
- **THEN** a necessidade de compra considera 120 KG (peso bruto)

### Requirement: Política de estoque por cozinha×ingrediente
O sistema SHALL manter `inventory.stock_policy` com estoque mínimo, cobertura em dias e limiar de urgência opcional (UNIQUE cozinha×ingrediente) e alertar quando o saldo projetado cruzar o ponto de pedido (consumo diário planejado × lead time estimado + estoque mínimo).

#### Scenario: Alerta de ponto de pedido
- **WHEN** o saldo projetado de um ingrediente cai abaixo do ponto de pedido
- **THEN** o ingrediente entra na lista de sugestões de reposição com a quantidade sugerida

### Requirement: Lead time estimado com fallback
A estimativa de prazo SHALL usar o lead time observado por fornecedor×item (capability `goods-receipt`); sem histórico suficiente, SHALL usar o prazo contratual da ARP ou o default de cobertura da política, nesta ordem.

#### Scenario: Sem histórico
- **WHEN** um item nunca teve OF recebida
- **THEN** a estimativa usa o prazo contratual da ARP e indica a origem do valor

### Requirement: Roteamento de canal de compra
Para cada item com necessidade líquida positiva, o sistema SHALL recomendar canal em ordem determinística: (1) ARP própria vigente com saldo suficiente → empenho; (2) ARP de outra UASG localizável via API Compras.gov → carona/adesão; (3) item com CATMAT e cobertura abaixo do limiar de urgência (default: lead time estimado; configurável em `stock_policy`) → Supermercado Virtual; (4) pequeno valor (limites do art. 75 da Lei 14.133) fora de ata → Contrata+Brasil; (5) caso contrário → novo planejamento de licitação (`procurement_list`). Cada sugestão SHALL exibir custo estimado (reuso da `pesquisa_preco`) e prazo estimado. A decisão final MUST ser humana — o sistema não emite empenho/OF automaticamente.

#### Scenario: Canal 1 — ARP própria
- **WHEN** a necessidade é 50 KG e a ARP própria vigente tem saldo de 200 KG
- **THEN** a sugestão é empenho na ARP própria com custo e prazo estimados

#### Scenario: Canal 3 — ruptura iminente
- **WHEN** não há ARP com saldo e a cobertura atual está abaixo do limiar de urgência, e o item tem CATMAT
- **THEN** a sugestão é Supermercado Virtual com aviso de urgência

#### Scenario: Canal 5 — sem alternativa direta
- **WHEN** nenhum canal anterior se aplica
- **THEN** a sugestão é abrir novo planejamento de licitação vinculando o item

### Requirement: Checagem SICAF antes da OF
Antes da emissão de OF, o sistema SHALL consultar a situação do fornecedor no SICAF (via proxy Compras.gov) e alertar quando houver irregularidade; a emissão permanece possível com registro do alerta e do responsável pela decisão.

#### Scenario: Fornecedor irregular
- **WHEN** o gestor emite OF para fornecedor com pendência no SICAF
- **THEN** o sistema exibe o alerta, exige confirmação explícita e registra quem decidiu prosseguir

