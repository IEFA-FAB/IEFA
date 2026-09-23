## MODIFIED Requirements

### Requirement: Tipo de cardápio de exceção

O sistema SHALL suportar um terceiro tipo de cardápio, `template_type = 'exception'`, em `kitchen.menu_template`, ao lado de `'weekly'` e `'event'`. O CHECK constraint da coluna MUST aceitar exatamente os três valores. Uma exceção MUST ser sempre vinculada a uma cozinha (`kitchen_id` não nulo) — não existe exceção global/SDAB. Uma exceção MAY ser classificada como padrão de lanche (capability `snack-standards`); a classificação é opcional e não altera as demais regras deste requisito.

#### Scenario: Criar cardápio de exceção

- **WHEN** um usuário com permissão de cozinha nível 2 cria um cardápio informando `templateType: 'exception'` e uma `kitchen_id` válida
- **THEN** o sistema persiste um `menu_template` com `template_type = 'exception'` vinculado àquela cozinha
- **AND** redireciona para o editor dia-a-dia daquele cardápio

#### Scenario: Rejeitar valor de tipo inválido

- **WHEN** uma escrita tenta gravar `template_type` fora de `{'weekly','event','exception'}`
- **THEN** o banco rejeita a operação pelo CHECK constraint

#### Scenario: Exceção exige cozinha

- **WHEN** uma criação de exceção é submetida com `kitchen_id` nulo
- **THEN** o sistema rejeita a operação com erro de validação, sem persistir o registro

#### Scenario: Exceção sem classificação segue igual

- **WHEN** uma exceção é salva sem `snack_family`
- **THEN** ela se comporta exatamente como antes desta mudança e não aparece para pedido
