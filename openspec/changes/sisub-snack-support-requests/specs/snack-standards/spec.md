## ADDED Requirements

### Requirement: Exceção classificada como padrão de lanche

O sistema SHALL permitir classificar um `menu_template` de `template_type = 'exception'` como padrão de lanche, com `snack_family` (`bordo` | `apoio`), `snack_class` (`A` | `B` | `C`), `snack_variant` (`lanche` | `refeicao`), `requires_galley`, `requires_oven`, `reviewed_at`, `shelf_life_hours` e `orderable`. O banco MUST rejeitar `snack_family` preenchido em template que não seja exceção, e `snack_class = 'C'` com `snack_family = 'apoio'`.

#### Scenario: Classificar exceção como Lanche de Bordo B

- **WHEN** um usuário com `kitchen:2` salva uma exceção da própria cozinha com família `bordo`, classe `B`, variante `lanche`
- **THEN** a exceção fica gravada com a classificação
- **AND** continua aparecendo somente na lista de exceções

#### Scenario: Apoio classe C é inválido

- **WHEN** uma escrita tenta gravar `snack_family = 'apoio'` e `snack_class = 'C'`
- **THEN** o banco rejeita pelo CHECK

### Requirement: Quantidade do padrão em porções por kit

Em um padrão de lanche, `headcount_override` de cada item SHALL significar porções daquela preparação por kit, e `expected_monthly_occurrences` SHALL significar kits previstos por mês. A tela MUST trocar os rótulos de acordo, e o custeio da Ata MUST continuar calculando `Σ porções × kits/mês × vigência` sem alteração de fórmula.

#### Scenario: Ata com padrão de lanche

- **WHEN** um padrão tem 2 porções de pão e 1 de suco por kit, 40 kits por mês, e a Ata tem vigência de 12 meses
- **THEN** a Ata considera 960 porções de pão e 480 de suco

### Requirement: Valor calórico por kit conferido contra a classe

O sistema SHALL calcular no servidor o valor calórico por kit do padrão a partir das preparações e mostrá-lo junto da faixa da classe (Bordo A 0–100, Bordo B 300–800, Bordo C 600–1.200 ou 1.200–2.000, Apoio A 300–800, Apoio B 600–1.200 kcal). Fora da faixa MUST gerar aviso, não bloqueio. Preparação sem composição nutricional MUST aparecer como cobertura incompleta, nunca como 0 kcal.

#### Scenario: Kit abaixo da faixa

- **WHEN** um padrão Apoio B soma 450 kcal
- **THEN** a tela avisa que o kit está abaixo de 600 kcal
- **AND** o padrão pode ser salvo

#### Scenario: Insumo sem nutriente

- **WHEN** uma preparação do kit não tem composição nutricional
- **THEN** o total é exibido como parcial, com a preparação listada

### Requirement: Revisão trimestral

Padrão com `reviewed_at` nulo ou há mais de 3 meses SHALL ser sinalizado como revisão vencida na lista de exceções e na fila de pedidos da cozinha.

#### Scenario: Padrão com revisão vencida

- **WHEN** `reviewed_at` é de 4 meses atrás
- **THEN** o padrão aparece com o aviso "Revisão trimestral vencida"

### Requirement: Só padrão da cozinha e pedível entra no pedido

O comensal SHALL ver, para a cozinha apoiadora escolhida, somente padrões com `kitchen_id` igual a ela, `orderable = true` e `deleted_at` nulo. Padrão do catálogo global (`kitchen_id` nulo) MUST servir apenas de molde para fork.

#### Scenario: Padrão global não aparece para pedido

- **WHEN** existe um padrão global de Bordo A e a cozinha não o copiou
- **THEN** ele não aparece na tela de pedido
