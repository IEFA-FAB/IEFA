## MODIFIED Requirements

### Requirement: Tipo de cardápio de exceção

O sistema SHALL suportar o cardápio de apoio (ex-exceção), `template_type = 'apoio'`, em
`kitchen.menu_template`, ao lado de `'weekly'` e `'event'`. O CHECK constraint da coluna MUST aceitar
exatamente os três valores. Um cardápio de apoio SHALL existir como cardápio da cozinha (`kitchen_id`
preenchido) ou como modelo global da SDAB (`kitchen_id` nulo). O modelo global de apoio MUST guardar
só quantidades relativas (ver `menu-quantity-scope`) e MUST NOT ser pedível como padrão de lanche.

#### Scenario: Criar cardápio de apoio da cozinha

- **WHEN** um usuário com permissão de cozinha nível 2 cria um cardápio informando `templateType: 'apoio'` e uma `kitchen_id` válida
- **THEN** o sistema persiste um `menu_template` com `template_type = 'apoio'` vinculado àquela cozinha
- **AND** o cardápio nasce com uma refeição "Kit"

#### Scenario: Rejeitar valor de tipo inválido

- **WHEN** uma escrita tenta gravar `template_type` fora de `{'weekly','event','apoio'}`
- **THEN** o banco rejeita a operação pelo CHECK constraint

#### Scenario: Modelo global de apoio

- **WHEN** um usuário com `global:2` cria um cardápio de apoio sem cozinha, com porções por kit e sem ocorrências por mês
- **THEN** o sistema persiste o modelo global
- **AND** as cozinhas o veem em "Cardápios de Apoio Modelo" para adaptar

#### Scenario: Modelo global de apoio com ocorrências

- **WHEN** a mesma criação traz ocorrências por mês
- **THEN** o sistema recusa com `GLOBAL_TEMPLATE_ABSOLUTE_QUANTITY`
