# production-stock-issue — Fase 5

## ADDED Requirements

### Requirement: Baixa de estoque vinculada à produção
Ao concluir uma `production_task` (status `DONE`), o sistema SHALL abrir o fluxo de confirmação de saída pré-preenchido com o consumo teórico (via `scaleIngredientQuantity`), permitindo ao operador ajustar as quantidades reais antes de confirmar. O consumo teórico MUST ser calculado a partir do **snapshot congelado** da receita (`menu_items.recipe`, json), não da receita viva — o que foi produzido é o registro auditável (MCASP), imune a edições posteriores da receita. A confirmação SHALL gerar movimentos `production_issue` referenciando a `production_task`.

#### Scenario: Baixa pré-preenchida
- **WHEN** uma tarefa de produção é concluída
- **THEN** o fluxo de saída lista cada ingrediente com a quantidade teórica calculada, editável

#### Scenario: Confirmação da saída
- **WHEN** o operador confirma a saída com as quantidades reais
- **THEN** um movimento `production_issue` por ingrediente é criado na unidade base, vinculado à tarefa

### Requirement: Consumo FEFO por lote
A baixa SHALL consumir lotes em ordem de validade crescente (FEFO — primeiro a vencer, primeiro a sair), podendo atravessar múltiplos lotes; o operador SHALL poder sobrescrever a seleção de lote com justificativa.

#### Scenario: Consumo atravessando lotes
- **WHEN** a baixa é de 30 KG e o lote mais próximo do vencimento tem 20 KG
- **THEN** o sistema consome 20 KG desse lote e 10 KG do lote seguinte por validade

#### Scenario: Override de lote
- **WHEN** o operador seleciona manualmente um lote diferente do FEFO
- **THEN** o sistema exige justificativa e registra o lote escolhido

### Requirement: Verificação de suficiência antes da produção
O módulo kitchen-production SHALL exibir, por tarefa, a suficiência de estoque dos ingredientes (disponível × necessário), com alerta quando insuficiente. Estoque insuficiente MUST NOT bloquear a produção — apenas alertar.

#### Scenario: Badge de suficiência
- **WHEN** uma tarefa planejada precisa de 4 ingredientes e 3 têm saldo suficiente
- **THEN** a tarefa exibe "3/4 disponíveis" com detalhe do faltante

### Requirement: Retorno de sobra ao estoque
Sobra reaproveitável registrada em `production_task.leftover_quantity` SHALL poder gerar movimento `leftover_return`, criando lote **da preparação congelada** (`frozen_preparation_id` via XOR do ledger — capability `stock-ledger`) com validade derivada de `frozen_preparation.shelf_life_days`. Sobra descartada SHALL gerar movimento `waste` com motivo.

#### Scenario: Sobra reaproveitada
- **WHEN** o operador marca 5 KG de sobra como reaproveitável em preparação congelada com shelf life de 30 dias
- **THEN** um `leftover_return` cria lote referenciando a `frozen_preparation` (não um ingrediente) com validade a 30 dias da produção

#### Scenario: Descarte
- **WHEN** o operador marca a sobra como descarte
- **THEN** um movimento `waste` é criado com o motivo informado

### Requirement: Variância teórico × real
O sistema SHALL reportar, por período e por ingrediente, a diferença entre consumo teórico (planejado) e real (movimentos confirmados), em quantidade e percentual.

#### Scenario: Relatório de variância
- **WHEN** o gestor consulta a variância do mês de uma cozinha
- **THEN** o relatório lista por ingrediente: teórico, real, delta absoluto e percentual
