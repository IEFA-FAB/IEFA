# stock-replenishment-mrp (delta)

## MODIFIED Requirements

### Requirement: Necessidade líquida
O sistema SHALL calcular, por cozinha×ingrediente e horizonte de planejamento, a necessidade líquida: demanda bruta dos cardápios planejados (via `scaleIngredientQuantity`) **corrigida por `correction_factor` e `rehydration_index`** (herança: override da receita → valor do ingrediente → 1), menos saldo disponível (excluindo lotes em quarentena, vencidos e que vencem dentro do horizonte, e descontando o que já foi emitido por requisição aberta para tarefas do horizonte), menos quantidades em trânsito (OFs enviadas e não recebidas, convertidas à unidade base). Saldo gravado sem lote SHALL reduzir o disponível. As fórmulas existentes de ATA (`calculateAtaNeeds`) MUST permanecer inalteradas.

#### Scenario: Abatimento de estoque e trânsito
- **WHEN** a demanda bruta corrigida é 100 KG, há 30 KG em estoque válido e 20 KG em OF enviada
- **THEN** a necessidade líquida é 50 KG

#### Scenario: Lote vencendo dentro do horizonte
- **WHEN** 10 KG do saldo vencem antes do fim do horizonte de planejamento
- **THEN** esses 10 KG não contam como disponíveis e o sistema sinaliza o lote para consumo prioritário

#### Scenario: Lote em quarentena
- **WHEN** 15 KG do saldo estão em quarentena
- **THEN** esses 15 KG não contam como disponíveis

#### Scenario: Fator de correção aplicado
- **WHEN** um ingrediente tem `correction_factor = 1.2` e demanda líquida de receita de 100 KG
- **THEN** a necessidade de compra considera 120 KG (peso bruto)
