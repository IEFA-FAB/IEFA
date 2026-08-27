# equipment-technical-sheet

## ADDED Requirements

### Requirement: Ficha técnica no modelo
`kitchen.equipment_model` SHALL carregar a ficha técnica que vale para toda unidade daquele modelo: `energy_source` (`electric` | `gas` | `steam` | `mixed` | `manual`), `voltage`, `width_cm`, `depth_cm`, `height_cm`, `weight_kg`, `requires_hood`, `water_inlet`, `drain_required`, `manual_url` e `expected_lifespan_years`. Todos os campos MUST ser opcionais, e nenhum deles MUST bloquear o cadastro de um modelo genérico (`is_generic = true`).

#### Scenario: Correção propaga para toda a frota
- **WHEN** o Catálogo Global corrige a potência declarada de um modelo
- **THEN** toda unidade daquele modelo, em qualquer cozinha, passa a exibir o valor corrigido sem edição adicional

#### Scenario: Modelo genérico sem ficha
- **WHEN** uma cozinha cadastra o modelo genérico "Forno combinado" sem nenhum dado de ficha
- **THEN** o cadastro é aceito e a unidade pode ser criada normalmente

### Requirement: Dados patrimoniais na unidade
`kitchen.equipment_unit` SHALL carregar o que varia peça a peça: `installed_on`, `warranty_until` e `supplier`, somando-se a `asset_tag`, `serial_number` e `acquired_on` já existentes. Estes campos MUST NOT existir no modelo.

#### Scenario: Duas unidades do mesmo modelo
- **WHEN** duas unidades do mesmo modelo têm garantias que vencem em datas diferentes
- **THEN** cada unidade guarda a sua `warranty_until` e ambas compartilham a mesma ficha técnica do modelo

### Requirement: Ficha visível a quem opera
A ficha técnica do modelo SHALL ser legível por quem tem `kitchen-production` nível 1 no escopo da cozinha, sem exigir permissão de catálogo.

#### Scenario: Operador consulta exigência de instalação
- **WHEN** um usuário com apenas `kitchen-production` nível 1 abre o cartão de uma unidade
- **THEN** vê fonte de energia, tensão, dimensões e link do manual, sem poder editá-los
