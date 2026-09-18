# stock-replenishment-mrp (delta)

## MODIFIED Requirements

### Requirement: Necessidade líquida
O sistema SHALL calcular, por cozinha×ingrediente e horizonte de planejamento, a necessidade líquida: demanda bruta dos cardápios planejados (via `scaleIngredientQuantity`) **corrigida por `correction_factor` e `rehydration_index`** (herança: override da receita → valor do ingrediente → 1), menos saldo disponível (excluindo lotes em quarentena e vencidos), menos quantidades em trânsito (OFs enviadas e não recebidas, convertidas à unidade base). Saldo gravado sem lote SHALL reduzir o disponível. A demanda de tarefa do horizonte já atendida por saída emitida SHALL sair da demanda bruta — e o emitido MUST NOT ser descontado do disponível outra vez: o saldo já caiu na emissão, e descontar dos dois lados compraria duas vezes o mesmo insumo. Lote que vence dentro do horizonte SHALL contar como disponível apenas contra a demanda de tarefas com data até o dia do vencimento, inclusive — a saída usa o lote no próprio dia do vencimento; excluí-lo inteiro mandaria comprar o que está na prateleira e ainda serve à primeira metade do horizonte. As fórmulas existentes de ATA (`calculateAtaNeeds`) MUST permanecer inalteradas.

#### Scenario: Abatimento de estoque e trânsito
- **WHEN** a demanda bruta corrigida é 100 KG, há 30 KG em estoque válido e 20 KG em OF enviada
- **THEN** a necessidade líquida é 50 KG

#### Scenario: Lote vencendo dentro do horizonte
- **WHEN** 10 KG do saldo vencem no 5º dia de um horizonte de 14 e a demanda das tarefas até o 5º dia, inclusive, é 6 KG
- **THEN** 6 KG desse lote contam como disponíveis, os outros 4 KG não contam, e o sistema sinaliza o lote para consumo prioritário

#### Scenario: Requisição já emitida
- **WHEN** a demanda bruta do horizonte é 100 KG, 40 KG dela já saíram por requisição emitida e o saldo, depois da saída, é 30 KG
- **THEN** a necessidade líquida é 30 KG (60 KG de demanda restante menos 30 KG de saldo), e não 70 KG

#### Scenario: Lote em quarentena
- **WHEN** 15 KG do saldo estão em quarentena
- **THEN** esses 15 KG não contam como disponíveis

#### Scenario: Fator de correção aplicado
- **WHEN** um ingrediente tem `correction_factor = 1.2` e demanda líquida de receita de 100 KG
- **THEN** a necessidade de compra considera 120 KG (peso bruto)
