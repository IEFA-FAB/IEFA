## ADDED Requirements

### Requirement: Recorrência mensal da exceção

O sistema SHALL permitir registrar em cada cardápio de exceção o número esperado de ocorrências mensais, via coluna `expected_monthly_occurrences` (inteiro positivo, anulável) em `kitchen.menu_template`. O campo MUST ser editável apenas para cardápios `template_type = 'exception'` e MUST ser ignorado para `weekly` e `event`.

#### Scenario: Definir ocorrências mensais de uma exceção

- **WHEN** um usuário informa `expected_monthly_occurrences = 30` num cardápio de exceção "Lanche de Bordo"
- **THEN** o valor é persistido no `menu_template`
- **AND** passa a ser usado como multiplicador no custeio da Ata

#### Scenario: Ocorrências ausentes tratadas como uma

- **WHEN** um cardápio de exceção tem `expected_monthly_occurrences` nulo
- **THEN** o custeio da Ata trata a exceção como 1 ocorrência mensal

#### Scenario: Rejeitar valor não positivo

- **WHEN** uma escrita tenta gravar `expected_monthly_occurrences` menor ou igual a zero
- **THEN** o sistema rejeita a operação com erro de validação

### Requirement: Exceções no custeio da Ata de Registro de Preços

A composição da Ata de Registro de Preços SHALL incluir cardápios com `template_type IN ('event','exception')`. Para cardápios de exceção, o custeio de comensais MUST ser calculado como `comensais_por_item × expected_monthly_occurrences` (com ocorrências nulas tratadas como 1), sem usar a média de dias úteis aplicada a cardápios semanais.

#### Scenario: Exceção disponível na composição da Ata

- **WHEN** um usuário compõe uma Ata na cozinha e existe um cardápio de exceção naquela cozinha
- **THEN** esse cardápio de exceção aparece como selecionável na composição, junto com os eventos

#### Scenario: Multiplicação por ocorrências mensais

- **WHEN** uma exceção com 200 comensais em um item e `expected_monthly_occurrences = 30` entra no custeio
- **THEN** o custeio contabiliza 6.000 comensais-item para aquele item
- **AND** não aplica a média semanal de dias úteis

#### Scenario: Regime de custeio distinto por tipo

- **WHEN** um cardápio semanal e um de exceção participam da mesma Ata
- **THEN** o semanal é agregado pela média de dias úteis existente
- **AND** o de exceção é agregado por `comensais × ocorrências mensais`
